import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { changeBarRow, type BarCommand, type BarData, type BarDraft } from "../src/lib/bar";
import { createWorkspace } from "../src/lib/demo";
import { cloudState, migrateState } from "../src/lib/storage";

for (const withPrivateNotes of [false, true]) test(`bar database: atomic books, history, conflicts, audit and tenant permissions (private notes ${withPrivateNotes})`, async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && (withPrivateNotes || !n.includes("planner_private_notes"))).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    const users = [61, 62, 63].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
    for (const id of users) await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{\"company_name\":\"Bar test\"}')", [id, `${id}@example.test`]);
    const members = (await db.query<{ user_id: string; company_id: string }>("select user_id,company_id from memberships")).rows;
    const companies = users.map(u => members.find(m => m.user_id === u)!.company_id), company = companies[0];
    const signIn = async (u: string) => { await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u]); };
    const read = async (tenant = company) => (await db.query<{ d: BarData }>("select read_bar($1) d", [tenant])).rows[0].d;
    const command = async (input: unknown, request = crypto.randomUUID(), tenant = company) => (await db.query<{ d: BarData }>("select bar_command($1,$2,$3::jsonb) d", [tenant, request, JSON.stringify(input)])).rows[0].d;
    let data: BarData;
    const run = async (action: BarCommand["action"], payload: unknown) => { data = await command({ version: data.version, action, payload }); return data; };
    await signIn(users[0]); await assert.rejects(read(), /MODULE_DISABLED/);
    await db.query("select set_company_module($1,'bar',true)", [company]); data = await read();
    await db.query("select save_workspace_v2($1,$2::jsonb,0,$3)", [company, JSON.stringify(cloudState(migrateState({ schema: 2, revision: 1, current: createWorkspace("Bar test"), past: [], future: [] }))), crypto.randomUUID()]);
    const before = (await db.query("select state,version from workspace_documents where company_id=$1", [company])).rows;
    const zero = crypto.randomUUID(), coffee = crypto.randomUUID();
    const article = { id: coffee, name: "Kafa · tajna 8729", unit: "kg", initial: 1025 };
    await run("item", { id: zero, name: "Topla čokolada", unit: "kg", initial: 0 }); await run("item", article);
    for (const initial of [-1, 0.5, 1000000000, "100", null]) await assert.rejects(run("item", { ...article, initial }));
    for (let n = 1; n <= 10; n++) {
      const id = crypto.randomUUID(); await run("open", { id, date: "2026-11-21" });
      assert.equal(data!.draft!.rows[0].previous, 0);
      assert.equal(data!.draft!.rows[1].previous, n === 1 ? 1025 : 900);
      if (n === 1) {
        const draft = structuredClone(data!.draft!); draft.shift = "Prva";
        draft.rows[1] = changeBarRow(changeBarRow(draft.rows[1], "acquired", 200), "closing", 900);
        await run("draft", draft); assert.deepEqual((await read()).draft, draft, "refresh persists draft");
        const version = data!.version;
        for (const bad of [
          { ...draft, rows: [] }, { ...draft, rows: [...draft.rows, draft.rows[0]] },
          { ...draft, rows: draft.rows.map(r => ({ ...r, name: "Forged" })) },
          ...[-1, 0.1, null, "100", 1000000000].map(used => ({ ...draft, rows: draft.rows.map(r => ({ ...r, used })) })),
          { ...draft, rows: draft.rows.map(r => ({ ...r, total: 123 })) }, { ...draft, extra: true }, { ...draft, date: "2026-02-29" },
        ]) await assert.rejects(run("finish", bad));
        assert.equal((await read()).version, version, "failed completion is atomic"); assert.equal((await read()).books.length, 0);
      }
      const finish: BarCommand = { version: data!.version, action: "finish", payload: data!.draft! }, req = crypto.randomUUID();
      const results = await Promise.all([command(finish, req), command(finish, req)]);
      data = results[0]; assert.deepEqual(results[1], data); assert.equal(data.sequence, n);
      await assert.rejects(command(finish), /VERSION_CONFLICT/);
      await assert.rejects(command({ ...finish, version: 0 }, req), /REQUEST_CONFLICT/);
    }
    assert.equal(data!.books.length, 5); assert.deepEqual(data!.books.map(b => b.sequence), [10, 9, 8, 7, 6]);
    const inventory = structuredClone(data!.inventory), latest = structuredClone(data!.books[0]);
    const fifth = data!.books[4];
    await run("open", { id: crypto.randomUUID(), date: "2026-11-22" });
    const open = structuredClone(data!.draft);
    const doc = (b: BarDraft) => ({ id: b.id, date: b.date, shift: b.shift, rows: b.rows });
    await run("edit", { ...doc(fifth), rows: fifth.rows.map(r => r.itemId === coffee ? changeBarRow(r, "closing", 800) : r) });
    assert.deepEqual(data!.books[0], latest); assert.deepEqual(data!.inventory, inventory); assert.deepEqual(data!.draft, open);
    await run("edit", { ...doc(latest), rows: latest.rows.map(r => r.itemId === coffee ? changeBarRow(r, "closing", 700) : r) });
    assert.deepEqual(data!.inventory, inventory); assert.deepEqual(data!.draft, open);
    await assert.rejects(run("edit", { ...doc(latest), date: "2026-11-23" }), /HISTORICAL_DATE_LOCKED/);
    await run("cancel", { id: data!.draft!.id });
    await assert.rejects(run("open", { id: crypto.randomUUID(), date: "2026-11-20" }), /INVALID_DATE/);
    await run("deleteItem", { id: zero }); await run("item", { ...article, name: "Espreso" });
    await assert.rejects(run("item", { id: zero, name: "Resurrect", unit: "kg", initial: 0 }), /ITEM_DELETED/);
    await run("open", { id: crypto.randomUUID(), date: "2026-11-21" });
    assert.equal(data!.draft!.rows.length, 1); assert.equal(data!.draft!.rows[0].previous, 900); assert.equal(data!.draft!.rows[0].name, "Espreso");
    assert.equal(data!.books[0].rows[0].name, "Topla čokolada");
    await db.exec("reset role");
    const all = (await db.query<{ document: BarDraft }>("select document from bar_books where company_id=$1 order by sequence", [company])).rows;
    assert.equal(all.length, 10);
    const audit = (await db.query<{ payload: BarCommand; previous_data: BarData; next_data: BarData }>("select payload,previous_data,next_data from bar_changes where company_id=$1 and payload->>'action'='edit'", [company])).rows;
    assert.equal(audit.length, 2); assert.ok(audit.every(a => a.previous_data.version + 1 === a.next_data.version));
    await signIn(users[0]); await assert.rejects(run("edit", all[4].document), /BOOK_OUTSIDE_LAST_FIVE/);
    const saved = await read();
    await db.query("select set_company_module($1,'bar',false)", [company]); await assert.rejects(read(), /MODULE_DISABLED/); await assert.rejects(run("cancel", { id: saved.draft!.id }), /MODULE_DISABLED/);
    await db.query("select set_company_module($1,'bar',true)", [company]); assert.deepEqual(await read(), saved);
    for (const table of ["bar_state", "bar_books", "bar_changes"]) for (const sql of [`select * from ${table}`, `delete from ${table}`, `update ${table} set company_id='${companies[1]}'`, `insert into ${table}(company_id) values('${company}')`]) await assert.rejects(db.query(sql), /permission denied/);
    await signIn(users[1]); await assert.rejects(read(), /ACCESS_DENIED/); await assert.rejects(run("cancel", { id: saved.draft!.id }), /ACCESS_DENIED/);
    await db.query("select set_company_module($1,'bar',true)", [companies[1]]); assert.equal((await read(companies[1])).books.length, 0);
    await db.exec("reset role"); await db.query("insert into memberships(company_id,user_id,role) values($1,$2,'manager')", [company, users[1]]);
    await signIn(users[1]); await run("draft", saved.draft!);
    await db.exec("reset role"); await db.query("delete from memberships where company_id=$1 and user_id=$2", [company, users[1]]);
    await signIn(users[1]); await assert.rejects(read(), /ACCESS_DENIED/); await assert.rejects(run("finish", saved.draft!), /ACCESS_DENIED/);
    await signIn(users[0]);
    const token = (await db.query<{ t: string }>("select rotate_planner_link($1) t", [company])).rows[0].t;
    assert.deepEqual((await db.query("select state,version from workspace_documents where company_id=$1", [company])).rows, before);
    await db.exec("set role anon"); await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(read(), /permission denied/); await assert.rejects(run("finish", saved.draft!), /permission denied/);
    await assert.rejects(db.query("select private.read_bar($1)", [company]), /permission denied/);
    const planner = JSON.stringify((await db.query("select read_planner_workspace($1)", [token])).rows);
    for (const secret of [coffee, zero, "8729", "bar_books"]) assert.ok(!planner.includes(secret));
    await assert.rejects(db.query("select save_planner_workspace($1,$2::jsonb,0,$3)", [token, JSON.stringify({ bar: data! }), crypto.randomUUID()]));
    await db.exec("reset role"); await db.query("update companies set access_status='expired' where id=$1", [company]);
    await signIn(users[0]); data = await read(); await assert.rejects(run("finish", data.draft!), /TRIAL_EXPIRED/);
    await db.exec("reset role"); await db.query("update companies set access_status='pilot',trial_ends_at=null where id=$1", [company]);
    await signIn(users[0]); await run("finish", data!.draft!);
    await db.exec("reset role");
    const wrappers = (await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('read_bar','bar_command')")).rows;
    assert.equal(wrappers.length, 2); assert.ok(wrappers.every(p => !p.prosecdef));
  } finally { await db.close(); }
});
