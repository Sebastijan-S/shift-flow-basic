import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createDemo } from "../src/lib/demo";
import { cloudState, migrateState } from "../src/lib/storage";

test("modules and pilot: tenant isolation, audit, preserved data and restricted scheduling after 21 days", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql")).sort()) {
      await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    }
    const users = [21, 22, 23, 24].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
    for (const id of users) await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{\"company_name\":\"Pilot\"}')", [id, `${id}@example.test`]);
    const memberships = (await db.query<{ user_id: string; company_id: string }>("select user_id,company_id from memberships")).rows;
    const companies = users.map(user => memberships.find(m => m.user_id === user)!.company_id);
    const signIn = async (user: string) => { await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); };
    const setModule = (company: string, id: string | null, enabled: boolean | null) => db.query("select set_company_module($1,$2,$3)", [company, id, enabled]);
    const modules = () => db.query<{ company_id: string; module_id: string; enabled: boolean }>("select company_id,module_id,enabled from company_modules order by module_id");
    const current = createDemo();
    const state = cloudState(migrateState({ schema: 2, revision: 1, current, past: [], future: [] }));
    await signIn(users[0]);
    await db.query("select save_workspace_v2($1,$2::jsonb,0,$3)", [companies[0], JSON.stringify(state), crypto.randomUUID()]);
    const before = (await db.query<{ state: unknown }>("select state from workspace_documents where company_id=$1", [companies[0]])).rows[0].state;
    await setModule(companies[0], "overview", false);
    await setModule(companies[0], "hours", true);
    await setModule(companies[0], "hours", true);
    assert.equal((await db.query("select * from company_module_changes")).rows.length, 2, "retries do not duplicate audit changes");
    assert.deepEqual((await db.query<{ state: unknown }>("select state from workspace_documents where company_id=$1", [companies[0]])).rows[0].state, before, "toggling does not edit schedules, notes, absences or history");
    await setModule(companies[0], "hours", false);
    assert.equal((await modules()).rows.find(m => m.module_id === "hours")!.enabled, false);
    await db.query("select save_workspace_v2($1,$2::jsonb,1,$3)", [companies[0], JSON.stringify(state), crypto.randomUUID()]);
    assert.equal((await modules()).rows.find(m => m.module_id === "overview")!.enabled, false, "workspace saves do not overwrite settings");
    for (const [id, value] of [["unknown", true], [null, true], ["hours", null]] as const) await assert.rejects(setModule(companies[0], id, value), /INVALID_MODULE/);
    await assert.rejects(setModule(companies[0], "schedule", false), /SCHEDULE_REQUIRED/);
    await assert.rejects(db.query("update company_modules set enabled=true"), /permission denied/);
    await assert.rejects(db.query("update companies set access_status='pilot'"), /permission denied/);
    await assert.rejects(setModule(companies[1], "notes", true), /ACCESS_DENIED/);
    for (let i = 1; i < users.length; i++) {
      await signIn(users[i]);
      assert.equal((await modules()).rows.length, 0);
      assert.equal((await db.query("select * from company_module_changes")).rows.length, 0);
      await setModule(companies[i], "notes", true);
      assert.equal((await modules()).rows.length, 1);
      assert.equal((await modules()).rows[0].company_id, companies[i]);
    }
    await db.exec("reset role");
    await db.query("insert into memberships(company_id,user_id,role) values($1,$2,'manager')", [companies[0], users[1]]);
    await signIn(users[1]);
    await setModule(companies[0], "revenue", true);
    await db.exec("reset role");
    await db.query("delete from memberships where company_id=$1 and user_id=$2", [companies[0], users[1]]);
    await signIn(users[1]);
    await assert.rejects(setModule(companies[0], "bar", true), /ACCESS_DENIED/);
    await signIn(users[0]);
    const token = (await db.query<{ t: string }>("select rotate_planner_link($1) t", [companies[0]])).rows[0].t;
    await db.exec("reset role");
    await db.query("update companies set access_status='trial',trial_started_at=now()-interval '31 days',trial_ends_at=now()-interval '10 days' where id=$1", [companies[0]]);
    await signIn(users[0]);
    await assert.rejects(setModule(companies[0], "bar", true), /TRIAL_EXPIRED/);
    await assert.rejects(db.query("select save_workspace_v2($1,$2::jsonb,2,$3)", [companies[0], JSON.stringify(state), crypto.randomUUID()]), /TRIAL_EXPIRED/);
    await db.exec("reset role");
    await assert.rejects(db.query("update companies set access_status='pilot' where id=$1", [companies[0]]), /companies_pilot_has_no_deadline/);
    await db.query("update companies set access_status='pilot',trial_ends_at=null where id=$1", [companies[0]]);
    await signIn(users[0]);
    await setModule(companies[0], "bar", true);
    await db.query("select save_workspace_v2($1,$2::jsonb,2,$3)", [companies[0], JSON.stringify(state), crypto.randomUUID()]);
    assert.ok((await db.query<{ message: string }>("select message from notifications")).rows.some(n => n.message.includes("Besplatan pilot")));
    await db.exec("set role anon"); await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(modules(), /permission denied/);
    await assert.rejects(db.query("select * from company_module_changes"), /permission denied/);
    await assert.rejects(setModule(companies[0], "bar", false), /permission denied/);
    const planner = (await db.query<{ p: { state: typeof state; access_status: string; trial_ends_at: null } }>("select read_planner_workspace($1) p", [token])).rows[0].p;
    assert.equal(planner.access_status, "pilot"); assert.equal(planner.trial_ends_at, null);
    assert.ok(!JSON.stringify(planner).includes("company_modules"));
    const changed = migrateState(planner.state); changed.current.employees[0].daysOff = [3]; changed.revision++;
    await db.query("select save_planner_workspace($1,$2::jsonb,3,$3)", [token, JSON.stringify(changed), crypto.randomUUID()]);
    const crafted = structuredClone(changed) as typeof changed & { current: { modules: unknown } };
    crafted.current.modules = { revenue: true };
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,4,$3)", [token, JSON.stringify(crafted), crypto.randomUUID()]), /PLANNER_SCOPE_VIOLATION/);
    await signIn(users[0]);
    assert.equal((await modules()).rows.find(m => m.module_id === "revenue")!.enabled, true);
  } finally { await db.close(); }
});
