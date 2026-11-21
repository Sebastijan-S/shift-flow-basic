import { quantityLabel, type BarBook } from "../lib/bar";

/** Generated locally on request, using the existing browser Save as PDF workflow. */
export function printBar(book: BarBook, company: string) {
  const frame = document.createElement("iframe");
  frame.title = "Knjiga šanka · PDF / štampa";
  frame.style.cssText = "position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.title = `ShiftFlow-knjiga-${book.date}-${book.sequence}-v${book.revision + 1}`;
  doc.documentElement.lang = "sr-Latn";
  const style = doc.createElement("style");
  style.textContent = "@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#17202a}h1{font-size:22px}p{line-height:1.5;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #aaa;padding:8px;text-align:right;overflow-wrap:anywhere}th:first-child,td:first-child{text-align:left;width:23%}footer{margin-top:24px;font-size:10px;color:#555}.signature{margin-top:36px}";
  doc.head.appendChild(style);
  const add = (parent: HTMLElement, tag: string, text: string) => { const el = doc.createElement(tag); el.textContent = text; parent.appendChild(el); return el; };
  add(doc.body, "h1", "Knjiga šanka i inventar"); add(doc.body, "p", company);
  add(doc.body, "p", `Datum: ${book.date} · Knjiga #${book.sequence} · ${book.shift || "Bez oznake smene"} · Verzija ${book.revision + 1}`);
  const table = doc.createElement("table"), head = doc.createElement("thead"), heading = doc.createElement("tr");
  for (const title of ["Artikal / jedinica", "Preneto / prethodno", "Nabavljeno", "Ukupno", "Novo stanje", "Utrošeno"]) add(heading, "th", title);
  head.appendChild(heading); table.appendChild(head);
  const body = doc.createElement("tbody");
  for (const row of book.rows) {
    const tr = doc.createElement("tr");
    for (const value of [`${row.name} (${row.unit})`, ...[row.previous, row.acquired, row.total, row.closing, row.used].map(quantityLabel)]) add(tr, "td", value);
    body.appendChild(tr);
  }
  table.appendChild(body); doc.body.appendChild(table);
  add(doc.body, "p", "Potpis / datum: __________________________").className = "signature";
  add(doc.body, "footer", `Interna evidencija · Završeno: ${book.completedAt} · ID: ${book.id}. Naknadna ispravka ove knjige ne menja inventar i naredne knjige. PDF se generiše na zahtev.`);
  frame.contentWindow!.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 1000), { once: true });
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 100);
}
