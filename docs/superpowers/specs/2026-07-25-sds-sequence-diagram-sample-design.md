# SDS Sequence Diagram Sample Design

**Date:** 2026-07-25

**Status:** Approved for sample design; SDS insertion not yet authorized

## 1. Goal

Create one polished UML sequence diagram for user review before adding the complete `c. Sequence Diagrams` section to the GreenHome Kitchen SDS.

The sample shall demonstrate the intended visual language, level of detail, lifeline structure, activation bars, synchronous and return messages, and alternative paths. It shall not change the Google Docs SDS until the user accepts the rendered sample.

## 2. Selected Scenario

**Figure title:** `Staff Review Moderation Sequence`

**Traceability:** `SL-008/UC-REV-02`, `BR-085`, `BR-091`, `BR-092`, `AT-157`, `AT-158`, and `AT-160`

**Business outcome:** An active Staff/CSKH user hides or restores a Product Review with a mandatory reason. The system changes only the Staff-owned moderation state, preserves the Customer's rating and content, and records immutable moderation, audit, and outbox evidence atomically.

## 3. Participants

The diagram shall place these participants from left to right:

1. `Staff / CSKH` — external initiating actor.
2. `Staff Review Page` — boundary object collecting the moderation command.
3. `ReviewController` — control object enforcing authentication, role, request shape, and version inputs.
4. `ProductReviewService` — application service owning state guards and the transaction boundary.
5. `MongoDB` — persistence boundary for ProductReview, ReviewModerationEvent, AuditLog, and DomainOutbox.

The diagram shall not add Admin, Warehouse Manager, Customer, or Carrier as participants because none of them initiates or performs this command.

## 4. Main Sequence

1. Staff selects `Hide` or `Restore`, enters the mandatory reason, and submits.
2. Staff Review Page sends `POST /api/staff/reviews/{reviewId}/moderation` with action, reason, expected version, and idempotency key.
3. ReviewController authenticates the session, requires an active Staff role, and validates the command.
4. ReviewController delegates the authorized command to ProductReviewService.
5. ProductReviewService loads the current ProductReview and any prior result for the idempotency key.
6. ProductReviewService verifies the allowed transition `Allowed <-> HiddenByStaff` and checks the expected version.
7. In one MongoDB transaction, the service:
   - updates only `moderationState` and version;
   - inserts one immutable ReviewModerationEvent;
   - inserts one privacy-safe AuditLog entry;
   - inserts one DomainOutbox event.
8. MongoDB commits the complete transaction.
9. ProductReviewService returns the updated moderation projection.
10. ReviewController returns success and Staff Review Page displays the committed result.

## 5. Alternative Paths

The diagram shall include one UML `alt` combined fragment:

- `[invalid role | missing reason | invalid action]`: reject the command without changing ProductReview, ReviewModerationEvent, AuditLog, or DomainOutbox.
- `[stale version | concurrent moderation]`: return the current state/version and create no duplicate business effect.
- `[duplicate idempotency key]`: return the prior committed result without creating another moderation event, audit entry, or outbox event.

The diagram shall make clear that Staff cannot edit or delete the Customer's rating or content.

## 6. Visual Design

- Use standard UML lifelines, activation bars, filled synchronous arrows, and grey dashed return arrows.
- Use a clean white background with restrained GreenHome green accents.
- Use dark neutral text and thin grey lifelines; avoid the dated colors and crowded layout of the supplied SDS template.
- Keep labels in English to match the existing SDS.
- Keep the figure readable when scaled to the SDS printable body width.
- Use short operation-oriented message labels; place detailed invariants in a note instead of oversized arrows.
- Caption: `Figure II-8-c-1. Staff Review Moderation Sequence (SL-008/UC-REV-02)`.

## 7. Sample Deliverables

The review sample shall include:

- an editable `.drawio` source;
- a high-resolution PNG preview;
- structural validation of the Draw.io XML;
- visual inspection for clipped labels, overlaps, broken lifelines, unreadable text, and incorrect arrows.

No Google Docs SDS write, change-log entry, table-of-contents update, or final PDF export is part of this sample step.

## 8. Acceptance Criteria

The sample is accepted when:

1. every participant has the correct role and layer;
2. the message order realizes the approved SL-008 moderation use case;
3. the transaction clearly groups ProductReview, ReviewModerationEvent, AuditLog, and DomainOutbox;
4. Customer content/rating mutation is explicitly prohibited;
5. the main and alternative outcomes are visually distinguishable;
6. the diagram remains readable at normal SDS page scale;
7. no implementation-complete claim is implied by the design diagram.
