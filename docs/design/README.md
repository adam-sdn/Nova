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

Not mocked up: the Patient phone screens and the Interpreter window. Build those from docs/SPEC.md section 6 and the
same design tokens, keeping the same look (IBM Plex fonts, teal accent, text-plus-icon chips).
