import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_BAR, MAX_QUANTITY, changeBarRow, demoBarCommand, newBarDraft, parseQuantity, quantityInput, readDemoBar, validateDraft, validateRows, type BarCommand, type BarData } from "../src/lib/bar";

test("bar quantities: exact hundredths, both anchors, base corrections and invalid inputs", () => {
  assert.equal(parseQuantity("0,29"), 29); assert.equal(parseQuantity(" 1.25 "), 125);
  assert.equal(parseQuantity("9999999.99"), MAX_QUANTITY);
  for (const input of ["", " ", "-1", "NaN", "Infinity", "1e3", "1.234", "1,234", ".1", "1.", "1,2.3", "10000000"]) assert.throws(() => parseQuantity(input), input);
  assert.equal(parseQuantity(quantityInput(29)), 29);
  const data = { ...EMPTY_BAR, items: [{ id: "a", name: "Čokolada", unit: "kg", initial: 1000 }] };
  let row = newBarDraft(data, "book", "2026-11-21").rows[0];
  row = changeBarRow(row, "acquired", 500); row = changeBarRow(row, "used", 300);
  assert.deepEqual([row.total, row.closing, row.used, row.anchor], [1500, 1200, 300, "used"]);
  const preserveUsed = changeBarRow(row, "acquired", 700); assert.equal(preserveUsed.closing, 1400);
  row = changeBarRow(row, "closing", 1200); row = changeBarRow(row, "acquired", 700);
  assert.deepEqual([row.closing, row.used, row.anchor], [1200, 500, "closing"]);
  row = changeBarRow(row, "previous", 1100); assert.equal(row.used, 600);
  row = changeBarRow(row, "total", 2000); assert.equal(row.acquired, 900); assert.equal(row.used, 800);
  validateRows([row], [row]);
  for (const invalid of [changeBarRow(row, "closing", 2100), changeBarRow(row, "total", 100), { ...row, used: 0.1 }, { ...row, total: 1 }, { ...row, acquired: Infinity }]) assert.throws(() => validateRows([invalid], [row]));
  assert.throws(() => validateRows([], [row])); assert.throws(() => validateRows([row, row], [row, row]));
  assert.throws(() => validateRows([{ ...row, name: "Forged" }], [row]));
  assert.throws(() => validateDraft({ id: "x", date: "2026-02-29", shift: "", rows: [row] }, [row]));
});

test("bar demo: persistent draft, ten zero books, transfer order, last-five isolated edits and deleted history", () => {
  let data = structuredClone(EMPTY_BAR);
  const run = (action: BarCommand["action"], payload: unknown) => { data = demoBarCommand(data, crypto.randomUUID(), { version: data.version, action, payload }); return data; };
  run("item", { id: "zero", name: "Topla čokolada", unit: "kg", initial: 0 });
  run("item", { id: "coffee", name: "Kafa", unit: "kg", initial: 1000 });
  for (let n = 1; n <= 10; n++) {
    run("open", { id: `book-${n}`, date: "2026-11-21" });
    assert.equal(data.draft!.rows[0].previous, 0);
    if (n === 1) {
      const draft = structuredClone(data.draft!); draft.rows[1] = changeBarRow(draft.rows[1], "used", 200); run("draft", draft);
      data = JSON.parse(JSON.stringify(data)); assert.equal(data.draft!.rows[1].closing, 800);
    } else assert.equal(data.draft!.rows[1].previous, 800);
    run("finish", data.draft!); assert.equal(data.inventory!.sequence, n);
  }
  assert.equal(data.books.length, 10); assert.equal(readDemoBar(data).books.length, 5);
  const inventory = structuredClone(data.inventory), newer = structuredClone(data.books.slice(0, 4));
  const fifth = data.books[4];
  run("edit", { id: fifth.id, date: fifth.date, shift: "Ispravka", rows: fifth.rows.map(r => r.itemId === "coffee" ? changeBarRow(r, "closing", 700) : r) });
  assert.deepEqual(data.inventory, inventory); assert.deepEqual(data.books.slice(0, 4), newer);
  const latest = data.books[0]; run("edit", { id: latest.id, date: latest.date, shift: "", rows: latest.rows.map(r => r.itemId === "coffee" ? changeBarRow(r, "closing", 600) : r) });
  assert.deepEqual(data.inventory, inventory, "even correction of latest does not silently change inventory");
  assert.throws(() => run("edit", data.books[5]), /BOOK_OUTSIDE_LAST_FIVE/);
  assert.throws(() => run("open", { id: "early", date: "2026-11-20" }));
  run("deleteItem", { id: "zero" }); run("item", { id: "coffee", name: "Espreso", unit: "kg", initial: 0 });
  run("open", { id: "next", date: "2026-11-22" });
  assert.equal(data.draft!.rows.length, 1); assert.equal(data.draft!.rows[0].name, "Espreso"); assert.equal(data.draft!.rows[0].previous, 800);
  assert.equal(data.books[0].rows[0].name, "Topla čokolada");
  run("cancel", { id: "next" }); assert.equal(data.draft, null);
});

test("bar demo: exact retries and stale simultaneous completion cannot duplicate a book", () => {
  let d: BarData = { ...structuredClone(EMPTY_BAR), items: [{ id: "a", name: "Voda", unit: "l", initial: 125 }] };
  d = demoBarCommand(d, "open", { version: 0, action: "open", payload: { id: "b", date: "2026-11-21" } });
  const command: BarCommand = { version: d.version, action: "finish", payload: d.draft! };
  d = demoBarCommand(d, "finish", command);
  assert.deepEqual(demoBarCommand(d, "finish", command), d);
  assert.throws(() => demoBarCommand(d, "finish", { ...command, version: 0 }), /REQUEST_CONFLICT/);
  assert.throws(() => demoBarCommand(d, "other", command), /VERSION_CONFLICT/);
  assert.equal(d.books.length, 1);
});
