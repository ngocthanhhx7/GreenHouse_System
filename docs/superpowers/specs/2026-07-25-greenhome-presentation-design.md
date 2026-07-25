# GreenHome Kitchen System Presentation Design

Date: 2026-07-25

Audience: FPT University lecturers, reviewers, and classmates

Presentation language: English

Project identity: GreenHome Kitchen System — Group 4, SE1917, FPT University

## Communication job

By the end of the presentation, reviewers should understand why Group 4 selected
the project, how GreenHome connects customer commerce with internal kitchenware
operations, how the main actors and data structures fit together, and how the
documented design maps to the running system and code.

## Approved visual direction

Use the approved **Minimal Academic** direction:

- 16:9 widescreen canvas.
- White background with emerald green as the primary accent.
- Dark forest text, pale green support fills, and neutral gray secondary text.
- Clean sans-serif typography with strong hierarchy and generous margins.
- A slim emerald navigation rule and restrained page numbering for continuity.
- Minimal decorative kitchen references; technical readability takes priority.
- No dense dashboard-style card grids, decorative clutter, or unnecessary effects.

The cover remains minimal. Content slides use takeaway-style titles. Diagram
slides reserve nearly the full usable canvas for the visual.

## Narrative and slide structure

1. **Cover**

   GreenHome Kitchen System; Group 4; SE1917; FPT University.

2. **Team Members**

   Five equal photo drop zones with full names and student IDs:
   - Nguyen Ngoc Thanh — HE186491
   - Pham Thanh Chung — HE189007
   - Nguyen Quang Huy — HE186466
   - Nguyen Huu Anh Nhat — HE176402
   - Le Vu Cuong — HE187396

3. **Agenda**

   Project rationale, system differentiation, system diagrams, live flow, and
   code walkthrough.

4. **What Is GreenHome Kitchen System?**

   Explain the project as a connected kitchenware e-commerce and operations
   platform. Include why the team chose the project: it provides a realistic
   end-to-end business problem that joins customer experience, payment, order
   processing, inventory, delivery, and after-sales operations.

5. **What Makes It Different?**

   Emphasize the connected post-checkout workflow, role-based operations,
   controlled order and refund state transitions, inventory traceability,
   PayOS integration, notifications, audit logs, reports, and after-sales
   support.

6. **Context Diagram**

   Show Guest, Customer, Staff, Warehouse Manager, Admin, PayOS, and Email
   Service around the GreenHome system boundary.

7. **Use Case Overview**

   Show the complete user-facing role model at a readable summary level.

8. **Guest Use Cases**

9. **Customer Use Cases**

10. **Staff Use Cases**

11. **Warehouse Manager Use Cases**

12. **Admin Use Cases**

13. **Entity Relationship Diagram**

14 onward. **Sequence Diagrams**

   Include every sequence diagram that is complete and available in the current
   project documents at implementation time. Each sequence diagram receives one
   independent slide. Do not invent unfinished diagrams. When the documents are
   updated, add new sequence slides using the same layout.

Penultimate slide. **From Design to Running System**

Use a clean transition slide announcing that the presentation will continue
with the live project flow and a code walkthrough when needed.

Final slide. **Thank You**

Close with “Questions & Discussion” and a concise statement that the team is
ready to demonstrate the system.

## Diagram treatment

- One diagram per slide, without exceptions.
- Use a short takeaway title and a small diagram-type label.
- Center the diagram inside a large white viewing area with a subtle border.
- Preserve the diagram's original meaning and labels.
- Crop unused margins and enlarge the diagram until labels are readable.
- Do not place explanatory paragraphs beside dense technical diagrams.
- If a source diagram is too dense for projection, improve legibility through
  higher-resolution export or clean recreation while preserving its content.
- Context and role-specific use case diagrams must match the SRS actors.
- ERD must match the documented GreenHome data model and current backend scope.
- Sequence diagrams must come from completed project documentation only.

## Content sources

Primary sources:

- Google Drive project folder provided by the user.
- `WDP301_Group4_SE1917NJ_SRS`.
- `WDP301_Group4_SE1917NJ_SDS`.
- `docs/PROJECT_DESCRIPTION.md`.
- `docs/FINAL_DEMO_READINESS_PLAN.md`.
- `docs/DATA_SCHEMA_GAP_REVIEW.md`.
- `docs/RETURN_REFUND_RECONCILIATION.md`.
- Existing repository implementation and demo evidence.

The deck must use the project name **GreenHome Kitchen System** consistently,
even where older files or the existing Canva draft use “GreenHouse System.”

## Copy and presentation rules

- All audience-facing slide copy is in English.
- Keep visible copy concise and presentation-ready.
- Use direct titles that state the slide's point.
- Avoid internal production notes, unfinished drafting language, and technical
  implementation commentary on audience-facing slides.
- The live-demo transition is intentional audience-facing copy, not a presenter
  note.
- Maintain readable typography and avoid shrinking text to fit dense content.

## Canva editing boundary

The existing Canva design may be fully restyled; its current visual template is
not a constraint. Preserve access to the original design while replacing or
reworking slides into the approved system. Reuse only content that is accurate
and visually suitable.

## Acceptance criteria

- Project name, group, class, university, member names, and student IDs are correct.
- All slide copy is English.
- The two project-introduction slides cover both project rationale and differentiation.
- Context, overall use case, five role-specific use case, ERD, and available
  sequence diagrams each occupy separate slides.
- Every diagram is readable at presentation size.
- The live-flow/code transition slide appears immediately before the demo.
- The deck ends with a polished thank-you and discussion slide.
- Styling is consistently Minimal Academic across the full deck.
- No unintended overlap, clipping, unresolved drafting text, or inconsistent naming remains.
