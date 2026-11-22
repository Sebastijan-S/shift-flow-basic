import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createWorkspace } from "../src/lib/demo";
import { cloudState, type StoredState } from "../src/lib/storage";
import type { BarData } from "../src/lib/bar";
import type { HoursData } from "../src/lib/hours";

test("recovery: full isolated database backup restores modules, drafts, archives, audits, links and RLS", async () => {
  const db = await PGlite.create(); let restored: PGlite | undefined;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    // Match the real project: the old private-notes migration has never been applied.
    for (const file of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && !n.includes("planner_private_notes")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const user = "00000000-0000-0000-0000-000000000081";
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'restore@example.test',now(),'{\"company_name\":\"Restore\"}')", [user]);
    const company = (await db.query<{ company_id: string }>("select company_id from memberships where user_id=$1", [user])).rows[0].company_id;
    await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    const workspace: StoredState = { schema: 2, revision: 1, current: createWorkspace("Restore"), past: [], future: [] };
    await db.query("select save_workspace_v2($1,$2::jsonb,0,$3)", [company, JSON.stringify(cloudState(workspace)), crypto.randomUUID()]);
    for (const module of ["hours", "revenue", "notes", "bar"]) await db.query("select set_company_module($1,$2,true)", [company, module]);
    const hours = (await db.query<{ d: HoursData }>("select hours_command($1,'start',null,0,'{\"start\":\"2026-10-01\"}') d", [company])).rows[0].d;
    await db.query("select hours_command($1,'close',$2,0,'{\"end\":\"2026-10-31\",\"workspaceVersion\":1}')", [company, hours.open!.id]);
    await db.query("select save_revenue($1,$2,null,'{\"date\":\"2026-11-01\",\"shift\":\"\",\"cash\":0,\"cards\":null}')", [company, crypto.randomUUID()]);
    await db.query("select notes_command($1,$2,$3::jsonb)", [company, crypto.randomUUID(), JSON.stringify({ id: crypto.randomUUID(), version: null, action: "save", values: { text: "Recovery reminder", date: "2026-11-01", time: null, completed: false } })]);
    let bar = (await db.query<{ d: BarData }>("select read_bar($1) d", [company])).rows[0].d;
    const command = async (action: string, payload: unknown) => { bar = (await db.query<{ d: BarData }>("select bar_command($1,$2,$3::jsonb) d", [company, crypto.randomUUID(), JSON.stringify({ version: bar.version, action, payload })])).rows[0].d; };
    await command("item", { id: crypto.randomUUID(), name: "Zero stock", unit: "kom", initial: 0 });
    await command("open", { id: crypto.randomUUID(), date: "2026-11-01" }); await command("finish", bar.draft);
    await command("open", { id: crypto.randomUUID(), date: "2026-11-01" });
    const token = (await db.query<{ token: string }>("select rotate_planner_link($1) token", [company])).rows[0].token;
    await db.exec("reset role");
    const tables = ["workspace_documents", "memberships", "company_modules", "company_module_changes", "hours_ledgers", "hours_snapshots", "hours_changes", "revenue_entries", "revenue_changes", "notes_entries", "notes_changes", "bar_state", "bar_books", "bar_changes", "planner_links", "save_receipts"];
    const snapshot = async (database: PGlite) => Promise.all(tables.map(async table => (await database.query(`select coalesce(jsonb_agg(j order by j::text),'[]') d from (select to_jsonb(t) j from public.${table} t) q`)).rows));
    const before = await snapshot(db);
    // A failed transactional schema change is rolled back locally; no deployed migration is reversed.
    await db.exec("begin; create table public.failed_migration_probe(id int)");
    await assert.rejects(db.exec("select 1/0")); await db.exec("rollback");
    assert.equal((await db.query<{ absent: boolean }>("select to_regclass('public.failed_migration_probe') is null absent")).rows[0].absent, true);
    assert.deepEqual(await snapshot(db), before);
    const archive = await db.dumpDataDir();
    restored = await PGlite.create({ loadDataDir: archive });
    assert.deepEqual(await snapshot(restored), before);
    await restored.exec("set role authenticated"); await restored.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    const restoredHours = (await restored.query<{ d: HoursData }>("select read_hours($1) d", [company])).rows[0].d;
    assert.equal(restoredHours.history.length, 1); assert.equal(restoredHours.open!.entries.length, 0);
    const restoredBar = (await restored.query<{ d: BarData }>("select read_bar($1) d", [company])).rows[0].d;
    assert.equal(restoredBar.books.length, 1); assert.ok(restoredBar.draft); assert.equal(restoredBar.inventory!.rows[0].closing, 0);
    await restored.exec("set role anon"); await restored.query("select set_config('request.jwt.claim.sub','',false)");
    for (const rpc of ["read_hours", "read_revenue", "read_notes", "read_bar"]) await assert.rejects(restored.query(`select ${rpc}($1)`, [company]), /permission denied/);
    const planner = JSON.stringify((await restored.query("select read_planner_workspace($1)", [token])).rows);
    for (const secret of ["Recovery reminder", "Zero stock", "closedAt", "rates", "cash"]) assert.ok(!planner.includes(secret));
  } finally { await restored?.close(); await db.close(); }
});
