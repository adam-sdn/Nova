# Design references

These are the source files of the approved mockups, written in a design-canvas format. They are **not** runnable
app code and they depend on a runtime that is not in this repo. Do not import or copy them wholesale.

Read them for:

- layout (columns, panels, spacing, what sits where)
- exact copy and labels (column names, chip text, button labels)
- chip and button styles, colours and sizes (also summarised in docs/SPEC.md section 13)
- the interactions that were prototyped (see below)

| File | Screen | Prototyped interactions |
|---|---|---|
| `nurse-board.dc.html` | Nurse board: seven columns, escort strip, enquiries inbox | Show names toggle, inbox filter tabs, "Patient is with the doctor" moves A-102 into Doctor Consultation, Reset demo |
| `doctor-board.dc.html` | Doctor board: Ready to be seen, profile, session frame | View profile, Consult now, demo "nurse confirms patient is here", Start session, Complete (tests or decision) |

All names, IDs, times and summaries in them are demo data. Vitals show as `[from triage]` and the note template as
`[your trust's template]` on purpose: those are placeholders for a clinician to fill.

Not mocked up: only the Patient phone screens. Build them from docs/SPEC.md section 6 and the
same design tokens, keeping the same look (IBM Plex fonts, teal accent, text-plus-icon chips).

## Layout frames (`frames/`)

Rendered frames added as layout guides. Use them for **layout only** (what sits where, panel order, density).
Visual style (colours, type, spacing details) is still to be decided, so keep the tokens in SPEC section 13 for now.
Names, numbers and vitals in them are made up; do not copy clinical values from them.

| File | Use it for |
|---|---|
| `frames/nurse-board.webp` | Nurse board: header, Show names / Reset demo, escort strip, seven columns, enquiries inbox on the right |
| `frames/doctor-ready-to-be-seen.webp` | Doctor home: priority filter tabs, Ready to be seen cards, Patient Overview panel with Consult now |
| `frames/layout-patients-list.webp` | Reference only: left filter rail, table list, right detail panel |
| `frames/layout-tasks.webp` | Reference only: list with right-hand detail panel and action footer |
