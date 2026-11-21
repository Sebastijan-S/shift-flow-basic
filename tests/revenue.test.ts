import test from "node:test";
import assert from "node:assert/strict";
import { demoSaveRevenue, latestRevenue, revenueSummary, revenueValues, type RevenueData } from "../src/lib/revenue";
import { defaultModules, moduleVisible } from "../src/lib/modules";

test("revenue: optional amounts, zero, invalid amounts and exact integer sums", () => {
  assert.deepEqual(revenueValues("2026-11-21", " Jutro ", "0", ""), { date: "2026-11-21", shift: "Jutro", cash: 0, cards: null });
  assert.equal(revenueValues("2026-11-21", "", "", "0,20").cards, 20);
  for (const [cash, cards] of [["", ""], [" ", ""], ["-1", ""], ["1.001", ""], ["1e2", ""], ["NaN", ""], ["1,000.00", ""], ["1000000000", ""], ["", "abc"]]) assert.throws(() => revenueValues("2026-11-21", "", cash, cards));
  for (const date of ["2026-02-29", "2026-04-31", "2026-11-21T00:00:00Z", "0000-01-01", "21.11.2026", ""]) assert.throws(() => revenueValues(date, "", "1", ""));
  assert.doesNotThrow(() => revenueValues("2024-02-29", "", "1", ""));
  assert.deepEqual(revenueSummary({ entries: [] }), { cash: null, cards: null, total: null, count: 0 });
  let data: RevenueData = { entries: [] };
  data = demoSaveRevenue(data, "a", null, revenueValues("2026-11-21", "", "0.10", ""));
  data = demoSaveRevenue(data, "b", null, revenueValues("2026-11-21", "", "", "0.20"));
  data = demoSaveRevenue(data, "c", null, revenueValues("2026-11-20", "", "10.25", "20.50"));
  assert.equal(revenueSummary(data).total, 3105);
  assert.equal(revenueSummary({ entries: [data.entries[0]] }).cards, null);
  const zero = demoSaveRevenue({ entries: [] }, "zero", null, revenueValues("2026-11-21", "", "0", ""));
  assert.equal(revenueSummary(zero).total, 0);
});

test("revenue: latest individual record follows creation, editing and persistence preserve order", () => {
  let data: RevenueData = { entries: [] };
  const first = revenueValues("2026-11-21", "", "10", "20");
  data = demoSaveRevenue(data, "a", null, first, "2026-11-21T00:00:00Z");
  data = demoSaveRevenue(data, "a", null, first); assert.equal(data.entries.length, 1);
  data = demoSaveRevenue(data, "b", null, revenueValues("2026-11-21", "", "", "7"), "2026-11-21T00:00:00Z");
  assert.deepEqual(latestRevenue(data), { id: "b", date: "2026-11-21", total: 700 });
  data = demoSaveRevenue(data, "c", null, revenueValues("2026-11-01", "", "5.10", "0.20"), "2026-11-21T23:00:00Z");
  assert.deepEqual(latestRevenue(data), { id: "c", date: "2026-11-01", total: 530 });
  const createdAt = data.entries[0].createdAt;
  data = demoSaveRevenue(data, "a", 0, revenueValues("2026-10-31", "ispravka", "99", ""), "2026-11-22T00:00:00Z");
  assert.equal(data.entries[0].createdAt, createdAt); assert.equal(latestRevenue(data)?.id, "c");
  assert.throws(() => demoSaveRevenue(data, "a", 0, first), /VERSION_CONFLICT/);
  assert.throws(() => demoSaveRevenue(data, "a", null, first), /VERSION_CONFLICT/);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  assert.equal(data.entries.length, 3, "no generated empty dates");
  const modules = { ...defaultModules(), revenue: true };
  assert.equal(moduleVisible("revenue", modules), true); assert.equal(moduleVisible("revenue", modules, true), false);
  modules.revenue = false; assert.equal(moduleVisible("revenue", modules), false);
});

test("revenue: Belgrade business dates survive UTC midnight and DST boundaries", () => {
  for (const [instant, expected] of [["2026-11-21T23:30:00Z", "2026-11-22"], ["2026-03-28T23:30:00Z", "2026-03-29"], ["2026-03-29T01:30:00Z", "2026-03-29"], ["2026-10-25T01:30:00Z", "2026-10-25"]]) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
    assert.equal(date, expected);
    const data = demoSaveRevenue({ entries: [] }, "a", null, revenueValues(date, "", "0", ""), instant);
    assert.equal(latestRevenue(data)?.date, expected);
  }
});
