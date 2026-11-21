import test from "node:test";
import assert from "node:assert/strict";
import { printHours } from "../src/components/hours-panel";
import type { HoursSnapshot } from "../src/lib/hours";

test("hours print: repeatable historical amounts, all employees and signature wording without server storage", t => {
  // A document sink verifies exactly what is sent to the browser's print document.
  // Visual pagination remains a separate Chrome check.
  class Element {
    children: Element[] = []; textContent = ""; className = ""; title = ""; lang = ""; style = { cssText: "" };
    printed = 0; removed = false;
    contentDocument?: Doc;
    contentWindow = { addEventListener: () => {}, focus: () => {}, print: () => { this.printed++; } };
    constructor(public tag: string) {}
    appendChild(child: Element) { this.children.push(child); return child; }
    append(...children: Element[]) { this.children.push(...children); }
    remove() { this.removed = true; }
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
  const snapshot: HoursSnapshot = { id: "locked-period", company: "Kafe <test>", start: "2026-10-01", end: "2026-10-15", closedAt: "2026-10-16T08:00:00Z", rows: [
    { employee: "a", name: "Ana Petrović", minutes: 880, hours: 15, shifts: 2, method: "hourly", rate: 35025, base: 525375, overtime: 125050, total: 650425 },
    { employee: "b", name: "Marko Jovanović", minutes: 0, hours: 0, shifts: 0, method: "monthly", rate: 6000000, base: 3000000, overtime: 0, total: 3000000 },
  ] };
  const before = structuredClone(snapshot);
  printHours(snapshot); printHours(snapshot); t.mock.timers.tick(100);
  assert.equal(doc.body.children.length, 2);
  const [first, second] = doc.body.children;
  assert.equal(first.printed, 1); assert.equal(second.printed, 1);
  assert.equal(first.contentDocument!.body.text(), second.contentDocument!.body.text());
  assert.equal(first.contentDocument!.body.children.length, 2, "one signature page for every employee, including zero hours");
  const text = first.contentDocument!.body.text();
  for (const expected of ["Ana Petrović", "Marko Jovanović", "2026-10-01 - 2026-10-15", "15 h", "Po satu", "Fiksna mesečna plata", "6.504,25 RSD", "30.000,00 RSD", "1.250,50 RSD", "Potpis ne potvrđuje prijem novca.", "Potpis zaposlenog / datum"]) assert.ok(text.includes(expected), expected);
  assert.deepEqual(snapshot, before);
  assert.equal(first.contentDocument!.head.children.length, 1, "only inline print CSS; no external resources or server PDF upload");
});
