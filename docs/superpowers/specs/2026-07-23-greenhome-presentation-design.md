# GreenHome Council Presentation Design

**Date:** 2026-07-23  
**Audience:** Project evaluation council  
**Duration:** 10–15 minutes  
**Presenter:** One team representative presenting the whole project  
**Deliverable:** 16:9 PowerPoint deck, 11 slides, Vietnamese audience-facing copy

## Communication job

By the end, the council should understand how GreenHome connects customer purchase, staff processing, warehouse operations, and administration in one web platform, because the project is best evaluated as an end-to-end business flow rather than as isolated feature screens.

## Source of truth

The primary requirements source is the latest Drive document `WDP301_Group4_SE1917NJ_SRS` (document status: `Text Baseline Candidate`, updated 2026-07-22). Local repository documents and implementation evidence are supporting sources only.

The deck must preserve the SRS boundary: kitchen-product commerce, account/RBAC, catalog, cart, order, COD and online payment, staff processing, inventory/warehouse, replenishment, review, support, return/refund, notifications, audit logging, and summary reporting. It must not present real-time delivery tracking, shipper management, a native mobile app, AI recommendations, advanced accounting, complex logistics optimization, or voucher/promotion management as in scope.

The deck must also respect Appendix A implementation alignment. Claims are grouped as `Implemented core`, `Partially implemented`, or `Planned next increment`; requirements are not silently relabeled as completed features.

## Narrative arc

The central takeaway is: **GreenHome turns a fragmented kitchen-product sales process into one traceable journey from browsing to after-sales operations.**

The sequence is cumulative:

1. Establish the product and the operational problem.
2. Define the solution boundary and the actors who use it.
3. Follow one order through customer, staff, warehouse, and post-purchase states.
4. Explain the architecture and the rules that keep the flow safe.
5. Show the real system, separate current evidence from remaining work, and close with the next increment.

## Slide plan

| # | Takeaway title | Audience-facing content | Visual composition |
|---|---|---|---|
| 1 | GreenHome Kitchen System | Web platform for kitchen-product commerce; team name and members | Warm kitchen banner on the right, logo and title on the left |
| 2 | One purchase currently touches too many manual handoffs | Scattered customer, order, stock, and management information creates coordination risk | Editorial split: problem statement with a sparse fragmented-flow motif |
| 3 | GreenHome centralizes the journey without expanding the scope | Catalog → Cart/Checkout → Payment → Order → Inventory → After-sales/Reports | One horizontal system spine with six labeled stages |
| 4 | Each role sees only the work it owns | Guest/Customer, Staff, Warehouse Manager, Admin, plus Payment Gateway and Email Service | Role-to-responsibility map with external services separated |
| 5 | A single order moves through guarded business states | Browse → cart → checkout → payment/COD → confirm → stock export → packed → shipped → delivered → review/support/return | Timeline/state flow; show guards such as payment eligibility, reservation, and stock export |
| 6 | The product covers both buying and operating | Catalog/search, account/RBAC, cart/order/payment, inventory/replenishment, review/support/return-refund, notification/audit | Six flat capability bands rather than dense cards |
| 7 | The system separates experience, business rules, and data | React/Vite client, Express/Node API, service layer, MongoDB/Mongoose, JWT/RBAC, external providers | Layered architecture; use the repo architecture diagram as supporting evidence and simplify for legibility |
| 8 | Reliability comes from explicit rules, not status labels | Server-side validation, state-transition guards, idempotent checkout/callbacks, reservations/stock export, audit trail | Four technical pillars around a restrained rules flow |
| 9 | The demo follows the same order journey | Catalog, checkout/order, staff queue/detail, warehouse export, review/support/notification/audit screens | Three to five real UI screenshots with a single highlighted path |
| 10 | Current evidence is honest about what is ready | Implemented core; partially implemented; planned next increment | Three-column status matrix grounded in SRS Appendix A and verified repo/test evidence |
| 11 | GreenHome closes the loop and has a clear next increment | End-to-end value, current boundary, and next work on payment/refund/email/report/account-management gaps | Green closing slide with logo/banner crop and a short next-step line |

## Visual system

- Canvas: warm ivory/white; ink: deep green/charcoal.
- Accents: GreenHome green, sage, and terracotta sampled from the existing logo/banner.
- Typography: a Vietnamese-capable sans-serif with large takeaway titles; minimum 50 pt deck titles, 35 pt slide titles, 24 pt subheads, and 16 pt body copy.
- Composition: presentation-native whitespace, thin rules, flat bands, timelines, and layers; avoid dashboard-like card grids and decorative gradients.
- Assets: reuse the repository logo, kitchen banner, and existing architecture/state-flow diagrams where they improve understanding. Do not reuse one image repeatedly unless it is the closing background.
- Diagram connectors are created behind nodes; any unintended overlap, clipping, wrapping, or unreadable crop is a release blocker.

## Evidence and content rules

- Visible copy is written for the council, not as production notes or speaker instructions.
- No invented metrics, completion percentages, or performance results. Slide 10 receives exact test/build evidence after verification.
- “Payment online”, “return/refund”, “email”, and “detailed reports” use the SRS coverage labels unless current implementation evidence proves a narrower claim.
- Demo screenshots come from the current local application, not mockups.
- The closing slide resolves the opening problem by stating the end-to-end value and the next increment; it is not a generic “Thank you” slide.

## Acceptance criteria

1. The deck contains 11 slides and fits a 10–15 minute presentation without shrinking body type below 16 pt.
2. Every slide has one clear narrative job and a takeaway-style title.
3. The end-to-end order story is understandable without reading source code.
4. The roles, scope exclusions, business-rule highlights, and implementation-status labels match the SRS and current repo evidence.
5. At least one real architecture/state visual and three real application screenshots are included where available.
6. Every slide is rendered and inspected individually; unintended overlap, clipping, text wrapping, broken connectors, and low-resolution crops are fixed before delivery.
7. The final `.pptx` is delivered as a distinct file under the repository `outputs/` directory and is accompanied by a concise presenter handoff.

## Open decisions resolved by this design

- The deck is balanced rather than architecture-first or feature-list-first.
- The presenter represents the full team; individual ownership can appear as a compact footer, not as the main story.
- SRS Appendix A determines readiness wording; a green traceability label alone is not evidence of completion.
