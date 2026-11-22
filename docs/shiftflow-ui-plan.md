# ShiftFlow UI implementation plan

Open a new chat in the ShiftFlow project and copy the prompt for the module you select. Work through modules 01–06 in the recommended order, starting with Pazar. Modules 07–11 are optional polish passes. Review each diff and test report before starting the next chat.

## 01. Pazar

~~~~markdown
# ShiftFlow implementation brief — Pazar

Implement the Pazar UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Make recording takings the easiest action on arrival. In the audit at 390 × 844 the empty entry form started about 711 px down.

## Implementation

Start with `src/components/revenue-panel.tsx`. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Put Novi unos beside the title and bring its editor into view with focus. Keep date, cash, card, optional shift and total together. Give the all-date aggregate and latest individual entry distinct labels. Keep refresh with the records and edit on its row. Present records legibly on a phone.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Enter cash only, a literal zero, and two entries for the same date. Edit the older entry, cancel a second edit, refresh, and verify aggregate, latest-by-creation and saved order. Preserve blank versus zero, RSD precision, version checks and existing retry behavior.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 02. Notes i podsetnici

~~~~markdown
# ShiftFlow implementation brief — Notes i podsetnici

Implement the Notes i podsetnici UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Let a manager see what is due and add a note in one action.

## Implementation

Start with `src/components/notes-panel.tsx`. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Lead with active reminders and a visible create action. Separate undated notes and completed items. Move tie-break explanations out of the working view. Keep date/time guidance at the inputs, and give complete, edit, reopen and delete distinct prominence. Bring the active editor into view when editing a lower record.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Try an undated note, a date-only reminder, a timed overdue reminder and a long multiline note. Check ordering, deadline text, completion/reopening, cancelled deletion and confirmed deletion. Preserve Europe/Belgrade handling and version-aware commands. Leave Overview for its own chat.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 03. Operativni pregled

~~~~markdown
# ShiftFlow implementation brief — Operativni pregled

Implement the Operativni pregled UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Make today’s staffing and due work scannable while retaining the operational dashboard introduced after the reference screenshot.

## Implementation

Start with `src/components/dashboard-panel.tsx`. Relevant scope: src/components/dashboard-panel.tsx and the Pregled composition in src/components/shiftflow.tsx. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Emphasize today’s staffing and reminders. Group module metrics and shortcuts by purpose. Give missing data, zero and unavailable data distinct text. Use the existing blue selectively for links to modules. Retain access to the embedded schedule, its tools, refresh and reminder completion.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Check schedule-only, all modules enabled, empty and populated demo states. Verify shortcut destinations, reminders, embedded week/day/list views and disabled-module visibility. Preserve module-specific reads, independent failure states, refresh and planner restrictions.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 04. Radni sati i obračun

~~~~markdown
# ShiftFlow implementation brief — Radni sati i obračun

Implement the Radni sati i obračun UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Help the manager distinguish reviewing time, correcting pay and closing the whole team’s period.

## Implementation

Start with `src/components/hours-panel.tsx`. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Group period selection and import together. Make employee, hours and amount easy to compare. Keep editable extras and shift corrections close to their employee. Distinguish the whole-team close from ordinary saves; show the period and irreversible consequence at confirmation. Keep locked history and printing easy to locate.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

In isolated demo data exercise first-period setup, import, a manual correction and reimport, an extra amount, cancel-close, confirmed close and locked-history print preview. Preserve rounding, rate methods, partial-month rules, snapshot values and the next period’s starting state.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 05. Knjiga šanka i inventar

~~~~markdown
# ShiftFlow implementation brief — Knjiga šanka i inventar

Implement the Knjiga šanka i inventar UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Make item identity and draft versus finalized state clear during stock entry, especially on phones.

## Implementation

Start with `src/components/bar-panel.tsx`. Relevant scope: src/components/bar-panel.tsx and src/components/bar-print.ts. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Separate current inventory, open book and finished books. Distinguish save draft from finish, and place the carry-forward consequence beside confirmation. Keep desktop row comparison. For the 1,150 px editor grid, keep the item identifiable while editing on a phone, using pinned labels or a compact per-item layout. Keep item setup discoverable.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Use disposable demo stock. Check opening stock, draft save/reopen, invalid quantities, finish/cancel, carry-forward into the next book, historical correction and print preview. Preserve historical names/units, last-confirmed inventory, concurrency guards and retry of the same command.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 06. Podešavanja

~~~~markdown
# ShiftFlow implementation brief — Podešavanja

Implement the Podešavanja UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Help a manager find a setting as more modules are enabled.

## Implementation

Start with `src/components/shiftflow.tsx`. Relevant scope: src/components/shiftflow.tsx (Podešavanja), src/components/module-settings.tsx and src/components/basic-panels.tsx. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Add a compact in-page index for the sections actually visible. Group venue, module selection, module-specific configuration and access. Visually distinguish automatic module saves from explicit form saves. Keep existing module-owned editors and limit changes to their settings placement unless a local layout adjustment is needed.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Check minimal and all-enabled configurations, phone navigation, automatic toggle feedback and manual save. Verify hidden-module links disappear, disabling a module preserves its data, and visible access controls respect existing roles. Avoid remounting an editor or losing its draft merely by navigating the index.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 07. Raspored

~~~~markdown
# ShiftFlow implementation brief — Raspored

Implement the Raspored UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Optional polish pass on an original visual reference. Identify a reproducible friction point before making an edit.

## Implementation

Start with `src/components/shiftflow.tsx`. Relevant scope: src/components/shiftflow.tsx (Raspored and Calendar) and src/components/export-schedule.tsx. Follow the normal navigation entry point and trace its existing states and handlers before editing.

Inspect week/day/list, date navigation, filter and toolbar wrapping, shift labels and the mobile grid. Keep employee and date context visible during comparison. Limit changes to verified issues and check the shared schedule rendering on Pregled before and after.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Exercise search, position filters, week navigation, shift editing, undo/redo, share/export preview and planner-specific controls in isolated demo or test fixtures as applicable. Preserve generation, assignments, conflict handling, publishing, export privacy and planner visibility.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 08. Zaposleni

~~~~markdown
# ShiftFlow implementation brief — Zaposleni

Implement the Zaposleni UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Optional polish pass on the reference team list. Preserve its compact scan pattern.

## Implementation

Start with `src/components/shiftflow.tsx`. Relevant scope: src/components/shiftflow.tsx (Zaposleni and employee editor). Follow the normal navigation entry point and trace its existing states and handlers before editing.

Check search, status, positions, hours and row actions with long names and multiple roles. Check whether edit remains discoverable on a phone. Retain the visible add action and recognizable employee identity; change only demonstrated issues.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Check search with matches and no matches, add/edit/cancel, multi-position labels and active/inactive employees using disposable data. Verify weekly target and any optional maximum survive unrelated edits.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 09. Dostupnost

~~~~markdown
# ShiftFlow implementation brief — Dostupnost

Implement the Dostupnost UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Optional polish pass on the weekly matrix and its related exceptions.

## Implementation

Start with `src/components/shiftflow.tsx`. Relevant scope: src/components/shiftflow.tsx (Dostupnost) and src/components/basic-panels.tsx (BasicAvailability). Follow the normal navigation entry point and trace its existing states and handlers before editing.

Preserve the compact weekly controls and visible weekday/employee relationship. Check how a phone user identifies a cell, opens exceptions and distinguishes a recurring rule from a dated change. Retain textual state labels beside visual cues.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Exercise a weekly toggle, dated exception, partial availability and absence in the demo. Check their displayed scope, keyboard access and allowed planner actions. Preserve saved rules, schedule constraints and permissions.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 10. Pravila rada

~~~~markdown
# ShiftFlow implementation brief — Pravila rada

Implement the Pravila rada UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Optional polish pass to make adjustable rules and their consequences easier to scan.

## Implementation

Start with `src/components/shiftflow.tsx`. Relevant scope: src/components/shiftflow.tsx (Pravila rada). Follow the normal navigation entry point and trace its existing states and handlers before editing.

Group related controls using the existing settings form rhythm. Keep units with numeric fields, and explain blocking rules and warnings where the user chooses them. Review long labels, keyboard focus and save feedback on a phone.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Inspect all rules exposed by the current screen, change representative settings in the demo, reload and verify persistence and the corresponding scheduler tests. Preserve rule defaults, validation and scheduling behavior.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~

## 11. Istorija izmena

~~~~markdown
# ShiftFlow implementation brief — Istorija izmena

Implement the Istorija izmena UI task in the existing ShiftFlow repository at `C:\Users\Cebo\Documents\shift-flow-basic-main`. This brief authorizes one module. Start from the current working tree, read AGENTS.md and the relevant installed Next.js guide, and inspect any changes since the audit at `1ea74fb`. Other chats may already have improved patterns you can reuse.

## Outcome

Optional polish pass to make past changes and available recovery actions easy to identify.

## Implementation

Start with `src/components/shiftflow.tsx`. Relevant scope: src/components/shiftflow.tsx (Istorija izmena). Follow the normal navigation entry point and trace its existing states and handlers before editing.

Keep action, context and time legible on narrow screens. Give undo and redo clear labels and disabled states. Check whether metadata hidden on mobile removes necessary context; keep the existing order and history boundaries.

Use Raspored, Zaposleni and Dostupnost in the current app as visual references. Match their Instrument Sans typography, compact spacing, thin borders, aligned rows and Geist Mono details. Keep Serbian Latin UI copy. Reuse the current dark and light theme tokens in `src/app/shiftflow.css`. Green marks primary actions and active navigation. Where a related destination needs emphasis, use existing muted blue with a label or directional icon. Keep warning and error states explicit. Check contrast, keyboard focus and touch access. Scope any shared shell or CSS change to this module and preserve unrelated work.

Keep existing business logic, API contracts, persistence, authentication, permissions and module visibility intact. Reuse handlers and validation. If a product decision cannot be resolved from this brief, the current implementation or the repository, ask me before changing that behavior.

## Acceptance and handoff

Use disposable data to create a change, undo, redo and inspect the resulting state. Check empty history, unavailable actions and feedback. Preserve conflict safeguards, local undo semantics and any existing audit visibility.

Capture the baseline and inspect the finished screen in installed **Google Chrome** at 1440 × 900 and 390 × 844, in dark and light themes. Use isolated demo/test data for writes. Verify the primary task, a populated state and an empty state where applicable, including focus and scrolling. Run the existing tests, TypeScript check and production build using the repository commands. Report any checks or role-specific states you could not exercise.

Deliver the scoped diff or file-by-file change summary with a reviewable diff, before/after screenshots, test results and any remaining issue. Leave the result locally for review. Wait for my explicit instruction before committing, pushing, publishing or moving to another module.
~~~~
