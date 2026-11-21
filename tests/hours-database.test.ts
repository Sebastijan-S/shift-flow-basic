import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createWorkspace } from "../src/lib/demo";
import { cloudState, migrateState } from "../src/lib/storage";
import { payRows, type HoursData } from "../src/lib/hours";

for (const withPrivateNotes of [false, true]) test(`hours database: atomic team, retries, history, isolation (private notes ${withPrivateNotes})`, async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && (withPrivateNotes || !n.includes("planner_private_notes"))).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    const users = [31,32,33].map(n => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`);
    for (const id of users) await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{\"company_name\":\"Test lokal\"}')",[id,`${id}@example.test`]);
    const members = (await db.query<{user_id:string;company_id:string}>("select user_id,company_id from memberships")).rows;
    const companies = users.map(u => members.find(m => m.user_id===u)!.company_id);
    const signIn = async (id: string) => { await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); };
    await signIn(users[0]); const company=companies[0];
    await assert.rejects(db.query("select read_hours($1)",[company]), /MODULE_DISABLED/);
    await db.query("select set_company_module($1,'hours',true)",[company]);
    let data: HoursData;
    const read = async () => (await db.query<{d:HoursData}>("select read_hours($1) d",[company])).rows[0].d;
    data = await read(); assert.equal(data.open,null);
    const w = createWorkspace("Test lokal");
    w.employees = ["Ana", "Marko", "Jelena", "Luka"].map((name,i)=>({id:`e${i}`,name,initials:name[0],color:"mint",positions:["Barista"],targetHours:40,active:true,daysOff:[]}));
    w.schedules["2026-10-05"]={week:"2026-10-05",status:"draft",assignments:[
      {id:"a",employeeId:"e0",day:0,templateId:"morning",position:"Barista",locked:false,note:"",start:"07:00",end:"14:20"},
      {id:"b",employeeId:"e0",day:1,templateId:"morning",position:"Barista",locked:false,note:"",start:"07:00",end:"14:20"},
      {id:"c",employeeId:"e1",day:0,templateId:"morning",position:"Barista",locked:false,note:"",start:"07:00",end:"14:29"},
      {id:"d",employeeId:"e2",day:0,templateId:"morning",position:"Barista",locked:false,note:"",start:"07:00",end:"14:30"},
    ]};
    const saveWorkspace=async(version:number)=>db.query("select save_workspace_v2($1,$2::jsonb,$3,$4)",[company,JSON.stringify(cloudState(migrateState({schema:2,revision:version+1,current:w,past:[],future:[]}))),version,crypto.randomUUID()]);
    await saveWorkspace(0);
    const cmd = async (action:string,payload:object,period=data.open?.id??null,version=data.open?.version??0) => { const result=(await db.query<{d:HoursData}>("select hours_command($1,$2,$3,$4,$5::jsonb) d",[company,action,period,version,JSON.stringify({workspaceVersion:data.workspaceVersion,...payload})])).rows[0].d; data=result; return result; };
    await cmd("start",{start:"2026-10-01"}); await cmd("import",{end:"2026-10-15"}); assert.equal(data.open!.entries.length,4);
    await cmd("rate",{employee:"e0",method:"hourly",cents:10025}); await cmd("rate",{employee:"e1",method:"hourly",cents:20000});
    await cmd("rate",{employee:"e2",method:"shift",cents:30000}); await cmd("rate",{employee:"e3",method:"monthly",cents:6000000});
    await cmd("extra",{employee:"e0",overtime:12345,monthly:null});
    // Manual changes survive re-import even when a planned shift is moved/deleted.
    await cmd("entry",{key:"2026-10-05:a",minutes:90});
    await cmd("import",{end:"2026-10-15"});
    assert.equal(data.open!.entries.find(a=>a.key==="2026-10-05:a")!.minutes,90);
    await cmd("entry",{key:"2026-10-05:a",minutes:440});
    const staleVersion=data.open!.version-1;
    await assert.rejects(cmd("entry",{key:"2026-10-05:a",minutes:1},data.open!.id,staleVersion),/VERSION_CONFLICT/);
    const before = structuredClone(data);
    await assert.rejects(cmd("close",{end:"2026-10-15"}), /MONTHLY_AMOUNT_REQUIRED/);
    assert.deepEqual(await read(),before,"failed close leaves entire team and period unchanged");
    await cmd("extra",{employee:"e3",overtime:50000,monthly:3000000});
    await assert.rejects(cmd("close",{end:"2026-10-15",workspaceVersion:-1}),/VERSION_CONFLICT/);
    const expected = payRows(data,w,"2026-10-15").sort((a,b)=>a.employee.localeCompare(b.employee));
    const oldPeriod=data.open!.id, oldVersion=data.open!.version;
    const closed = await Promise.all([cmd("close",{end:"2026-10-15"},oldPeriod,oldVersion),cmd("close",{end:"2026-10-15"},oldPeriod,oldVersion)]);
    assert.deepEqual(closed[0],closed[1],"concurrent double-click returns the same single closure");
    assert.deepEqual(data.history[0].rows,expected,"server and preview agree on all methods and rounding");
    assert.equal(data.history[0].rows[0].hours,15); assert.equal(data.open!.entries.length,0); assert.deepEqual(data.open!.extras,{}); assert.equal(data.open!.start,"2026-10-16");
    await cmd("close",{end:"2026-10-15"},oldPeriod,oldVersion); assert.equal(data.history.length,1,"same period retry returns existing result");
    await assert.rejects(cmd("entry",{key:"2026-10-05:a",minutes:60},oldPeriod,oldVersion),/VERSION_CONFLICT/);
    const snapshot=structuredClone(data.history[0]);
    await cmd("rate",{employee:"e0",method:"hourly",cents:999});
    w.employees[0].name="Promenjeno ime"; w.schedules["2026-10-05"].assignments=[]; await saveWorkspace(1);
    assert.deepEqual((await read()).history[0],snapshot,"schedule, name and rate edits cannot rewrite snapshot");
    await cmd("extra",{employee:"e3",overtime:0,monthly:0}); await cmd("close",{end:"2026-10-31"}); assert.equal(data.history[0].rows.every(r=>r.hours===0),true,"empty period locks zero hours for team");
    await cmd("extra",{employee:"e3",overtime:0,monthly:0});
    await assert.rejects(cmd("extra",{employee:"e3",overtime:-1,monthly:null}),/INVALID_AMOUNT/);
    await assert.rejects(cmd("rate",{employee:"foreign",method:"hourly",cents:1}),/INVALID_EMPLOYEE/);
    await assert.rejects(cmd("rate",{employee:"e0",method:"hourly",cents:1.1}),/INVALID_RATE/);
    await assert.rejects(cmd("import",{end:"2099-01-01"}),/INVALID_PERIOD/);
    await assert.rejects(cmd("entry",{key:"missing",minutes:60}),/INVALID_MINUTES/);
    await db.query("select set_company_module($1,'hours',false)",[company]); await assert.rejects(read(),/MODULE_DISABLED/);
    await db.query("select set_company_module($1,'hours',true)",[company]); assert.deepEqual((await read()).history[1],snapshot,"disable preserves data");
    for(const table of ["hours_ledgers","hours_snapshots","hours_changes"]) {
      await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
      await assert.rejects(db.query(`delete from ${table}`),/permission denied/);
    }
    await signIn(users[1]); await assert.rejects(read(),/ACCESS_DENIED/); await assert.rejects(cmd("close",{end:"2026-11-10"}),/ACCESS_DENIED/);
    await db.query("select set_company_module($1,'hours',true)",[companies[1]]);
    assert.equal((await db.query<{d:HoursData}>("select read_hours($1) d",[companies[1]])).rows[0].d.history.length,0);
    await db.exec("reset role"); await db.query("insert into memberships(company_id,user_id,role) values($1,$2,'manager')",[company,users[1]]);
    await signIn(users[1]); data=await read(); await cmd("rate",{employee:"e0",method:"hourly",cents:123});
    await db.exec("reset role"); await db.query("delete from memberships where company_id=$1 and user_id=$2",[company,users[1]]); await signIn(users[1]); await assert.rejects(read(),/ACCESS_DENIED/);
    await signIn(users[0]); const token=(await db.query<{t:string}>("select rotate_planner_link($1) t",[company])).rows[0].t;
    await db.exec("set role anon"); await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(read(),/permission denied/); await assert.rejects(cmd("close",{end:"2026-11-10"}),/permission denied/);
    const planner=JSON.stringify((await db.query("select read_planner_workspace($1)",[token])).rows);
    for(const secret of ["hourly","6000000","hours_ledgers","overtime","closedAt"]) assert.ok(!planner.includes(secret));
    // Complete calendar month in a separate tenant, without rewriting a live period.
    await signIn(users[2]); const other=companies[2];
    await db.query("select set_company_module($1,'hours',true)",[other]);
    await db.query("select save_workspace_v2($1,$2::jsonb,0,$3)",[other,JSON.stringify(cloudState(migrateState({schema:2,revision:1,current:w,past:[],future:[]}))),crypto.randomUUID()]);
    let otherData=(await db.query<{d:HoursData}>("select hours_command($1,'start',null,0,'{\"start\":\"2026-09-01\"}') d",[other])).rows[0].d;
    otherData=(await db.query<{d:HoursData}>("select hours_command($1,'rate',$2,0,'{\"employee\":\"e3\",\"method\":\"monthly\",\"cents\":6000000}') d",[other,otherData.open!.id])).rows[0].d;
    otherData=(await db.query<{d:HoursData}>("select hours_command($1,'close',$2,1,'{\"end\":\"2026-09-30\",\"workspaceVersion\":1}') d",[other,otherData.open!.id])).rows[0].d;
    assert.equal(otherData.history[0].rows.find(r=>r.employee==="e3")!.base,6000000);
    assert.equal(otherData.history[0].rows.every(r=>r.hours===0),true);
    // An empty team can finish an empty period; no invented employees or hours.
    w.employees=w.employees.map(e=>({...e,active:false}));
    await db.query("select save_workspace_v2($1,$2::jsonb,1,$3)",[other,JSON.stringify(cloudState(migrateState({schema:2,revision:2,current:w,past:[],future:[]}))),crypto.randomUUID()]);
    otherData=(await db.query<{d:HoursData}>("select hours_command($1,'close',$2,0,'{\"end\":\"2026-10-31\",\"workspaceVersion\":2}') d",[other,otherData.open!.id])).rows[0].d;
    assert.deepEqual(otherData.history[0].rows,[]);
  } finally { await db.close(); }
});
