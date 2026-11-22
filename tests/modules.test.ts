import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, defaultModules, moduleVisible, parseModules } from "../src/lib/modules";
import { accessReadOnly, trialDays } from "../src/lib/access";

test("modules: legacy defaults, persisted choices and unavailable modules never create pages", () => {
  const defaults = parseModules({});
  assert.equal(moduleVisible("schedule", defaults), true);
  assert.equal(moduleVisible("overview", defaults), true);
  const stored = parseModules(JSON.parse(JSON.stringify({ ...defaults, overview: false, hours: true, bar: true })));
  assert.equal(moduleVisible("overview", stored), false);
  for (const m of MODULES.filter(m => !m.available)) assert.equal(moduleVisible(m.id, stored), false);
  const enabled = parseModules({ overview: true });
  assert.equal(moduleVisible("overview", enabled, true), false);
  assert.equal(moduleVisible("schedule", enabled, true), true);
  assert.deepEqual(defaultModules(), defaults, "settings are not shared mutable defaults");
  assert.ok(!MODULES.some(m => String(m.id) === "reports"), "retired reports have no settings or navigation entry");
  assert.deepEqual(parseModules({ ...defaults, reports: true }), defaults, "legacy flags do not break loading other modules");
  for (const invalid of [null, [], "", { schedule: false }, { overview: "false" }, { hours: null }, { unknown: true }]) {
    assert.throws(() => parseModules(invalid));
  }
});

test("pilot: no countdown or deadline; ordinary trials still expire at the exact boundary", () => {
  const deadline = "2026-11-21T10:00:00Z", now = Date.parse(deadline);
  const trial = { access_status: "trial", trial_ends_at: deadline };
  assert.equal(accessReadOnly(trial, now - 1), false);
  assert.equal(accessReadOnly(trial, now), true);
  assert.equal(trialDays(trial, now - 1), 1);
  assert.equal(trialDays(trial, now), 0);
  for (const access_status of ["setup", "active", "pilot"]) {
    const company = { access_status, trial_ends_at: deadline };
    assert.equal(accessReadOnly(company, now + 100 * 86400000), false);
    assert.equal(trialDays(company, now + 100 * 86400000), null);
  }
  assert.equal(accessReadOnly({ access_status: "expired", trial_ends_at: null }, now), true);
  assert.equal(accessReadOnly(null, now), false);
  assert.equal(trialDays({ access_status: "pilot", trial_ends_at: null }, now), null);
});
