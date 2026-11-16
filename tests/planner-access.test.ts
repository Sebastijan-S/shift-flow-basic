import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createDemo } from "../src/lib/demo";
import { cloudState, migrateState } from "../src/lib/storage";

test("planner link allows only scheduling and availability, with immediate rotation and revocation", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of ["20261114213420_shiftflow_initial.sql", "20261114213536_shiftflow_basic.sql", "20261114213542_shiftflow_access_hardening.sql", "20261114213547_shiftflow_notification_events.sql", "20261114224339_planner_access.sql", "20261117000000_planner_private_notes.sql"]) {
      await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    }
    const owner = "00000000-0000-0000-0000-000000000011";
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'owner@example.test',now(),'{\"company_name\":\"Pilot\"}')", [owner]);
    const company = (await db.query<{ company_id: string }>("select company_id from memberships where user_id=$1", [owner])).rows[0].company_id;
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const current = createDemo();
    const scheduledWeek = Object.keys(current.schedules)[0];
    current.schedules[scheduledWeek].assignments[0].note = "Manager secret";
    const initial = cloudState(migrateState({ schema: 2, revision: 1, current, past: [], future: [] }));
    await db.query("select save_workspace_v2($1,$2::jsonb,0,$3)", [company, JSON.stringify(initial), crypto.randomUUID()]);
    await db.exec("reset role");
    await db.query("update workspace_documents set state=jsonb_set(state,'{current,billing}','{\"private\":true}'::jsonb) where company_id=$1", [company]);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const token = (await db.query<{ token: string }>("select rotate_planner_link($1) token", [company])).rows[0].token;
    await db.exec("set role anon");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const firstRead = (await db.query<{ result: { company_id: string; state: { current: typeof current } } }>("select read_planner_workspace($1) result", [token])).rows[0].result;
    assert.equal(firstRead.company_id, company);
    assert.equal(firstRead.state.current.schedules[scheduledWeek].assignments[0].note, undefined, "planner projection hides private notes");
    assert.ok(!JSON.stringify(firstRead).includes("Manager secret"));
    assert.ok(!JSON.stringify(firstRead).includes("billing"), "future administrative fields stay private");
    await assert.rejects(db.query("select * from companies"), /permission denied/);
    await assert.rejects(db.query("select * from memberships"), /permission denied/);
    await assert.rejects(db.query("select * from workspace_documents"), /permission denied/);
    await assert.rejects(db.query("select save_workspace_v2($1,$2::jsonb,1,$3)", [company, JSON.stringify(initial), crypto.randomUUID()]), /permission denied/);
    const allowed = structuredClone(firstRead.state) as unknown as typeof initial;
    allowed.revision++;
    allowed.current.employees[0].daysOff = [2];
    allowed.current.absences = [{ id: crypto.randomUUID(), employeeId: allowed.current.employees[0].id, from: "2027-01-04", to: "2027-01-05", kind: "absence", reason: "Odmor" }];
    allowed.current.schedules["2027-01-04"] = { week: "2027-01-04", status: "draft", assignments: [] };
    const operation = crypto.randomUUID();
    const save = () => db.query<{ version: number }>("select save_planner_workspace($1,$2::jsonb,1,$3) version", [token, JSON.stringify(allowed), operation]);
    assert.equal(Number((await save()).rows[0].version), 2);
    assert.equal(Number((await save()).rows[0].version), 2, "repeated operation is idempotent");
    const loaded = (await db.query<{ result: { state: { current: typeof current } } }>("select read_planner_workspace($1) result", [token])).rows[0].result;
    assert.deepEqual(loaded.state.current.employees[0].daysOff, [2]);
    assert.equal(loaded.state.current.absences?.length, 1);
    assert.ok(loaded.state.current.schedules["2027-01-04"]);
    await db.exec("reset role");
    assert.equal((await db.query<{ billing: { private: boolean } }>("select state#>'{current,billing}' billing from workspace_documents where company_id=$1", [company])).rows[0].billing.private, true, "planner saves preserve hidden fields");
    await db.exec("set role anon");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    for (const forbidden of [
      (s: typeof allowed) => { s.current.name = "Promenjeno"; },
      (s: typeof allowed) => { s.current.rules.minRestHours = 0; },
      (s: typeof allowed) => { s.current.employees[0].targetHours = 8; },
      (s: typeof allowed) => { s.current.templates[0].name = "Nova smena"; }
    ]) {
      const attempt = structuredClone(allowed); forbidden(attempt);
      await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,2,$3)", [token, JSON.stringify(attempt), crypto.randomUUID()]), /PLANNER_SCOPE_VIOLATION/);
    }
    const publication = structuredClone(allowed);
    publication.current.schedules["2027-01-04"].status = "published";
    publication.current.schedules["2027-01-04"].publishedAt = new Date().toISOString();
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,2,$3)", [token, JSON.stringify(publication), crypto.randomUUID()]), /PLANNER_SCOPE_VIOLATION/);
    const edited = structuredClone(allowed);
    edited.current.schedules[scheduledWeek].assignments[0].locked = !edited.current.schedules[scheduledWeek].assignments[0].locked;
    await db.query("select save_planner_workspace($1,$2::jsonb,2,$3)", [token, JSON.stringify(edited), crypto.randomUUID()]);
    const afterEdit = (await db.query<{ result: { state: { current: typeof current } } }>("select read_planner_workspace($1) result", [token])).rows[0].result;
    assert.equal(afterEdit.state.current.schedules[scheduledWeek].assignments[0].note, undefined);
    await db.exec("reset role");
    assert.equal((await db.query<{ note: string }>("select state#>>'{current,schedules," + scheduledWeek + ",assignments,0,note}' note from workspace_documents where company_id=$1", [company])).rows[0].note, "Manager secret", "normal planner edit retains the private note");
    await db.exec("set role anon");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const weakened = structuredClone(edited);
    weakened.current.schedules[scheduledWeek].assignments[0].note = "Crafted secret";
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,3,$3)", [token, JSON.stringify(weakened), crypto.randomUUID()]), /PLANNER_SCOPE_VIOLATION/);
    weakened.current.schedules[scheduledWeek].assignments[0].note = "";
    weakened.current.schedules[scheduledWeek].assignments = weakened.current.schedules[scheduledWeek].assignments.slice(1);
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,3,$3)", [token, JSON.stringify(weakened), crypto.randomUUID()]), /PLANNER_SCOPE_VIOLATION/);
    weakened.current.schedules[scheduledWeek].assignments = edited.current.schedules[scheduledWeek].assignments;
    weakened.current.schedules[scheduledWeek].rules = { ...weakened.current.rules, minRestHours: 0 };
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,3,$3)", [token, JSON.stringify(weakened), crypto.randomUUID()]), /PLANNER_SCOPE_VIOLATION/);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    assert.equal((await db.query<{ note: string }>("select state#>>'{current,schedules," + scheduledWeek + ",assignments,0,note}' note from workspace_documents where company_id=$1", [company])).rows[0].note, "Manager secret", "manager retains note access");
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const replacement = (await db.query<{ token: string }>("select rotate_planner_link($1) token", [company])).rows[0].token;
    await db.exec("set role anon");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(db.query("select read_planner_workspace($1)", [token]), /INVALID_PLANNER_LINK/);
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,3,$3)", [token, JSON.stringify(allowed), crypto.randomUUID()]), /INVALID_PLANNER_LINK/);
    assert.ok((await db.query("select read_planner_workspace($1)", [replacement])).rows.length);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.query("select revoke_planner_link($1)", [company]);
    await db.exec("set role anon");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(db.query("select read_planner_workspace($1)", [replacement]), /INVALID_PLANNER_LINK/);
  } finally {
    await db.close();
  }
});
