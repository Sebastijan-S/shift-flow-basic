import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

/** Deterministic effect/async harness: exercises the real hook with mocked I/O, without a DOM. */
export function hookHarness<T>(file: string, name: string, mocks: Record<string, unknown>, args: unknown[] = []) {
  const slots: any[] = [], effects: (() => void)[] = [];
  let cursor = 0, dirty = true, value: T;
  const equal = (a: unknown[], b?: unknown[]) => b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next: any) => { const v = typeof next === "function" ? next(slots[index].value) : next; if (!Object.is(v, slots[index].value)) { slots[index].value = v; dirty = true; } }];
    },
    useRef(initial: any) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(fn: any, deps: unknown[]) { const index = cursor++; if (!slots[index] || !equal(deps, slots[index].deps)) slots[index] = { deps, fn }; return slots[index].fn; },
    useEffect(fn: () => any, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || !equal(deps, slots[index].deps)) {
        const old = slots[index]; slots[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const nativeRequire = createRequire(resolve(file)), module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((id: string) => id === "react" ? react : id in mocks ? mocks[id] : nativeRequire(id.startsWith("@/") ? resolve("src", id.slice(2)) : id), module, module.exports);
  const render = () => { cursor = 0; dirty = false; value = module.exports[name](...args); effects.splice(0).forEach(fn => fn()); };
  render();
  return {
    get value() { if (dirty) render(); return value; },
    async settle() { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (dirty) render(); } return value; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
