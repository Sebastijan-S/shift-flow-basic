import test from "node:test";
import assert from "node:assert/strict";
import { printBar } from "../src/components/bar-print";
import type { BarBook } from "../src/lib/bar";

test("bar PDF print: historical names, exact quantities, revision, safe text and repeatable on-demand document", t => {
  class Element {
    children: Element[] = []; textContent = ""; className = ""; title = ""; lang = ""; style = { cssText: "" };
    printed = 0; contentDocument?: Doc;
    contentWindow = { addEventListener: () => {}, focus: () => {}, print: () => { this.printed++; } };
    constructor(public tag: string) {}
    appendChild(child: Element) { this.children.push(child); return child; }
    remove() {}
    text(): string { return [this.textContent, ...this.children.map(c => c.text())].join("\n"); }
  }
  class Doc {
    head = new Element("head"); body = new Element("body"); documentElement = new Element("html"); title = "";
    createElement(tag: string): Element { const el = new Element(tag); if (tag === "iframe") el.contentDocument = new Doc(); return el; }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document"), doc = new Doc();
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document"); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const snapshot: BarBook = { id: "book", date: "2026-11-21", shift: "Veče", sequence: 10, revision: 2, completedAt: "2026-11-21T20:00:00Z", rows: [
    { itemId: "zero", name: "Čokolada <script>alert(1)</script>", unit: "kg", previous: 0, acquired: 0, total: 0, closing: 0, used: 0, anchor: "used" },
    { itemId: "a", name: "Kafa", unit: "kg", previous: 1025, acquired: 200, total: 1225, closing: 900, used: 325, anchor: "closing" },
  ] };
  const before = structuredClone(snapshot);
  printBar(snapshot, "Kafe <test>"); printBar(snapshot, "Kafe <test>"); t.mock.timers.tick(100);
  const [first, second] = doc.body.children;
  assert.equal(first.printed, 1); assert.equal(second.printed, 1);
  assert.equal(first.contentDocument!.body.text(), second.contentDocument!.body.text());
  const text = first.contentDocument!.body.text();
  for (const expected of ["Knjiga šanka i inventar", "Čokolada <script>alert(1)</script> (kg)", "Kafa (kg)", "10,25", "12,25", "3,25", "Verzija 3", "Knjiga #10", "2026-11-21", "Potpis / datum", "ne menja inventar"]) assert.ok(text.includes(expected), expected);
  const table = first.contentDocument!.body.children.find(c => c.tag === "table")!;
  assert.equal(table.children[1].children.length, 2, "zero articles included");
  assert.equal(first.contentDocument!.head.children.length, 1, "no external resources or server PDF upload");
  assert.ok(first.contentDocument!.head.text().includes("table-header-group"));
  assert.ok(first.contentDocument!.head.text().includes("A4 landscape"));
  assert.deepEqual(snapshot, before);
});
