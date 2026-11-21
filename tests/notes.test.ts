import test from "node:test";
import assert from "node:assert/strict";
import { demoNotesCommand, noteInstant, noteOverdue, notesOrder, noteValues, type NoteEntry } from "../src/lib/notes";
import { defaultModules, moduleVisible } from "../src/lib/modules";

test("notes: validation, optional date/time, midnight and Belgrade DST", () => {
  assert.deepEqual(noteValues(" tekst "), { text: "tekst", date: null, time: null, completed: false });
  assert.equal(noteValues("dan", "2026-11-21").time, null);
  for (const args of [[""], [" \n\t"], ["x".repeat(10001)], ["x", "2026-02-29"], ["x", "0000-01-01"], ["x", "", "12:00"], ["x", "2026-11-21", "24:00"], ["x", "2026-11-21", "12:00:01"], ["x", "2026-03-29", "02:30"]]) assert.throws(() => noteValues(args[0], args[1], args[2]));
  assert.equal(new Date(noteInstant("2026-03-29", "03:30")).toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(new Date(noteInstant("2026-10-25", "02:30")).toISOString(), "2026-10-25T01:30:00.000Z");
  const day = noteValues("dan", "2026-03-29");
  assert.equal(noteOverdue(day, new Date("2026-03-29T21:59:59Z")), false);
  assert.equal(noteOverdue(day, new Date("2026-03-29T22:00:00Z")), true);
  const autumn = noteValues("dan", "2026-10-25");
  assert.equal(noteOverdue(autumn, new Date("2026-10-25T22:59:59Z")), false);
  assert.equal(noteOverdue(autumn, new Date("2026-10-25T23:00:00Z")), true);
  const timed = noteValues("rok", "2026-11-22", "00:00");
  assert.equal(noteOverdue(timed, new Date("2026-11-21T22:59:59Z")), false);
  assert.equal(noteOverdue(timed, new Date("2026-11-21T23:00:01Z")), true);
  assert.equal(noteOverdue({ ...timed, completed: true }, new Date("2027-01-01Z")), false);
  assert.equal(noteOverdue(noteValues("bez roka"), new Date("2030-01-01Z")), false);
});
test("notes: deterministic sorting, including equal deadlines, creation ties and completed entries", () => {
  const entry = (id: string, date = "", time = "", createdAt = "2026-11-21T10:00:00Z", completed = false): NoteEntry => ({ ...noteValues(id, date, time, completed), id, version: 0, createdAt, updatedAt: createdAt });
  const entries = [entry("note-old"), entry("end", "2026-11-21"), entry("b", "2026-11-21", "12:00"), entry("done", "2026-01-01", "", undefined, true), entry("early", "2026-11-20"), entry("a", "2026-11-21", "12:00"), entry("note-new", "", "", "2026-11-22T10:00:00Z")];
  assert.deepEqual(notesOrder(entries).map(e => e.id), ["early", "a", "b", "end", "note-new", "note-old", "done"]);
  assert.deepEqual(notesOrder(entries.reverse()).map(e => e.id), ["early", "a", "b", "end", "note-new", "note-old", "done"]);
  const modules = { ...defaultModules(), notes: true };
  assert.equal(moduleVisible("notes", modules), true); assert.equal(moduleVisible("notes", modules, true), false);
  modules.notes = false; assert.equal(moduleVisible("notes", modules), false);
});
test("notes demo: save, refresh, retries, conflicts, completion and deletion do not resurrect data", () => {
  const create = { id: "one", version: null, action: "save" as const, values: noteValues("prva") };
  let data = demoNotesCommand({ entries: [] }, "create", create);
  assert.deepEqual(demoNotesCommand(data, "create", create), data);
  assert.throws(() => demoNotesCommand(data, "create", { ...create, values: noteValues("druga") }), /REQUEST_CONFLICT/);
  const edit = { ...create, version: 0, values: noteValues("podsetnik", "2026-11-21", "12:30", true) };
  data = demoNotesCommand(data, "edit", edit);
  assert.deepEqual(demoNotesCommand(data, "edit", edit), data);
  assert.throws(() => demoNotesCommand(data, "stale", edit), /VERSION_CONFLICT/);
  assert.equal(data.entries[0].completed, true); assert.equal(data.entries[0].version, 1);
  const remove = { id: "one", version: 1, action: "delete" as const, values: null };
  data = demoNotesCommand(data, "delete", remove);
  assert.deepEqual(demoNotesCommand(data, "delete", remove), data);
  assert.throws(() => demoNotesCommand(data, "resurrect", create), /VERSION_CONFLICT/);
  assert.deepEqual(demoNotesCommand(data, "create", create).entries, []);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});
