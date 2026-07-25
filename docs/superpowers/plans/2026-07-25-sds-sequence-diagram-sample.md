# SDS Sequence Diagram Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one editable and visually reviewed UML sequence diagram for `SL-008/UC-REV-02` without modifying the Google Docs SDS.

**Architecture:** Use the bundled deterministic Draw.io sequence-layout generator for lifelines, activation bars, and messages. Apply a narrow XML patch for the GreenHome visual treatment and UML `alt` fragment, validate the Draw.io structure, export a PNG, and inspect the rendered image before presenting it to the user.

**Tech Stack:** Draw.io desktop CLI, bundled `seqlayout.py` and `validate.py`, JSON, Draw.io XML, PNG.

## Global Constraints

- Keep the Google Docs SDS unchanged during this sample step.
- Use only the five approved participants: Staff / CSKH, Staff Review Page, ReviewController, ProductReviewService, and MongoDB.
- Model the main moderation transaction and invalid-role/input, stale-version/race, and duplicate-idempotency outcomes.
- Do not imply that the diagram proves the current application code implements SL-008.
- Keep all labels in English and readable at normal SDS body width.
- Use a white background, restrained GreenHome green accents, standard UML lifelines, activation bars, synchronous arrows, grey dashed return arrows, and one `alt` combined fragment.

---

### Task 1: Author the Deterministic Sequence Source

**Files:**
- Create: `docs/srs-sds-reconciliation/sequence-diagrams/sl008-review-moderation-sequence.json`
- Reference: `docs/superpowers/specs/2026-07-25-sds-sequence-diagram-sample-design.md`

**Interfaces:**
- Consumes: approved participant order and message sequence from the design specification.
- Produces: a valid `seqlayout.py` JSON document with participant IDs `staff`, `page`, `controller`, `service`, and `db`.

- [ ] **Step 1: Create the participant and message JSON**

Use this exact participant order:

```json
[
  {"id": "staff", "label": "Staff / CSKH", "actor": true},
  {"id": "page", "label": "Staff Review Page"},
  {"id": "controller", "label": "ReviewController"},
  {"id": "service", "label": "ProductReviewService"},
  {"id": "db", "label": "MongoDB"}
]
```

The main messages must show command submission, authorization and input validation, service delegation, idempotency lookup, current-review/version lookup, moderation-state validation, one atomic update/evidence transaction, commit, updated projection, and success display. Add three short outcome messages at the bottom for invalid input/role, stale state, and duplicate idempotency; Task 2 will enclose them in the `alt` fragment.

- [ ] **Step 2: Validate the JSON**

Run:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m json.tool `
  'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.json'
```

Expected: formatted JSON is printed and the command exits with code `0`.

- [ ] **Step 3: Review business coverage**

Confirm the source contains all of these literal concepts:

```text
POST /api/staff/reviews/{reviewId}/moderation
requireActiveStaff()
Allowed <-> HiddenByStaff
ReviewModerationEvent + AuditLog + DomainOutbox
403/422 No state change
409 Current state/version
200 Prior committed result
```

### Task 2: Generate, Style, and Validate the Draw.io Source

**Files:**
- Consume: `docs/srs-sds-reconciliation/sequence-diagrams/sl008-review-moderation-sequence.json`
- Create: `docs/srs-sds-reconciliation/sequence-diagrams/sl008-review-moderation-sequence.drawio`
- Reference tool: `C:\Users\admin\.codex\skills\drawio-skill\scripts\seqlayout.py`
- Reference validator: `C:\Users\admin\.codex\skills\drawio-skill\scripts\validate.py`

**Interfaces:**
- Consumes: participant/message JSON from Task 1.
- Produces: structurally valid Draw.io XML with GreenHome styling and a labeled UML `alt` fragment.

- [ ] **Step 1: Generate deterministic lifeline geometry**

Run:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'C:\Users\admin\.codex\skills\drawio-skill\scripts\seqlayout.py' `
  'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.json' `
  -o 'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.drawio'
```

Expected: the `.drawio` file is created and contains five UML lifelines.

- [ ] **Step 2: Apply the approved visual and fragment patch**

Patch only the generated XML:

- lifeline headers: `fillColor=#EAF4EE`, `strokeColor=#2F6B4F`, `fontColor=#173F2D`, Arial 12;
- normal messages and activation bars: `strokeColor=#2F6B4F`;
- returns: `strokeColor=#6B7280`, `fontColor=#4B5563`;
- notes: `fillColor=#F1F8F4`, `strokeColor=#7AA88D`;
- add a transparent `shape=umlFrame` cell labeled `alt Moderation command outcome`;
- add two horizontal operand separators and guard labels for invalid input/role, stale state, and duplicate idempotency;
- add a note stating `Staff cannot edit or delete Customer rating/content.`;
- set the page name to `Staff Review Moderation Sequence`.

- [ ] **Step 3: Validate XML structure**

Run:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'C:\Users\admin\.codex\skills\drawio-skill\scripts\validate.py' `
  'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.drawio' `
  --score
```

Expected: no dangling edges, duplicate/reserved IDs, broken parents, or unintended overlaps.

- [ ] **Step 4: Verify semantic labels**

Search the generated XML and confirm it contains the five participants, the API route, state transition, atomic evidence records, three alternative outcomes, and the Staff content-mutation prohibition.

### Task 3: Export and Inspect the User Preview

**Files:**
- Consume: `docs/srs-sds-reconciliation/sequence-diagrams/sl008-review-moderation-sequence.drawio`
- Create preview: `docs/srs-sds-reconciliation/sequence-diagrams/sl008-review-moderation-sequence.png`
- Create editable final PNG: `docs/srs-sds-reconciliation/sequence-diagrams/sl008-review-moderation-sequence.drawio.png`
- Reference repair tool: `C:\Users\admin\.codex\skills\drawio-skill\scripts\repair_png.py`

**Interfaces:**
- Consumes: validated Draw.io XML from Task 2.
- Produces: one clean preview PNG for user approval and one PNG carrying embedded editable Draw.io XML.

- [ ] **Step 1: Export the clean preview**

Run:

```powershell
& 'C:\Program Files\draw.io\draw.io.exe' -x -f png --width 2000 -b 20 `
  -o 'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.png' `
  'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.drawio'
```

Expected: a non-empty PNG no wider than 2,000 pixels.

- [ ] **Step 2: Inspect the PNG**

Open the preview at original detail and verify:

- no clipped participant or message labels;
- no overlapping arrows, notes, activation bars, guards, or frame labels;
- all lifelines align vertically;
- main and alternative outcomes are distinguishable;
- text remains legible when viewed at SDS page width.

If a defect exists, patch the `.drawio`, rerun validation, and re-export. Perform at most two automatic correction rounds before presenting the current best version.

- [ ] **Step 3: Export the editable PNG**

Run:

```powershell
& 'C:\Program Files\draw.io\draw.io.exe' -x -f png -e -s 2 -b 20 `
  -o 'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.drawio.png' `
  'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.drawio'

& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'C:\Users\admin\.codex\skills\drawio-skill\scripts\repair_png.py' `
  'docs\srs-sds-reconciliation\sequence-diagrams\sl008-review-moderation-sequence.drawio.png'
```

Expected: the PNG is readable by strict image decoders and retains embedded Draw.io XML.

- [ ] **Step 4: Present the sample without modifying SDS**

Show the preview to the user and ask for visual/content approval. Do not insert the image into Google Docs, update the change log, refresh the table of contents, or export a new SDS PDF until the user explicitly approves the sample.
