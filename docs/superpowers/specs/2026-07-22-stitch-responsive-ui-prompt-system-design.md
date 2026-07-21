# GreenHome Kitchen Stitch responsive UI prompt system

## 1. Outcome

Create a reusable prompt pack that can generate a coherent desktop and mobile design for every current GreenHome Kitchen frontend route. The generated designs will be returned to the engineering team as visual references for the final React frontend implementation.

The pack covers 42 concrete routes. Home and About remain the approved visual anchors; their prompts preserve and harmonize them rather than replacing their composition.

## 2. Product and users

GreenHome Kitchen is a Vietnamese kitchenware commerce system with five user contexts:

- Guest: discover products, understand the brand, authenticate.
- Customer: purchase, pay, track orders, request after-sales support, manage an account.
- Staff: process orders, invoices, return/refund requests, and support requests.
- Warehouse manager: manage inventory, exports, replenishment, and return inspection.
- Admin: monitor reports, catalog data, approvals, audit logs, and system settings.

The memorable impression is: **a trustworthy premium Vietnamese kitchen brand on customer-facing pages, paired with fast and disciplined operational workspaces for internal roles.**

## 3. Chosen prompt strategy

Use a layered prompt pack inside one Stitch project:

1. Run the Master Design DNA prompt once.
2. Run the Shared Responsive Shell prompt once.
3. Generate each route with its numbered screen prompt.

This is preferred over one mega-prompt because a 42-screen request loses screen-specific states and responsive detail. It is preferred over 42 unrelated prompts because the Master and Shell prompts keep typography, color, navigation, and component behavior consistent.

## 4. Visual direction

### Customer-facing experience

- Premium organic/editorial commerce, continuing the current Home and About direction.
- Warm ivory surfaces, forest green typography and actions, restrained warm-gold accents.
- Real kitchen and product imagery, generous whitespace, confident hierarchy.
- Fraunces for expressive brand headings; Outfit for UI, forms, prices, and body copy.

### Internal operations

- Same brand DNA, but denser and grid-disciplined.
- Desktop sidebar and operational topbar; mobile navigation drawer.
- Tables on desktop become readable cards or stacked rows on mobile.
- Status, queue priority, and next action must be scannable without decorative noise.
- Outfit with tabular numerals is the dominant internal type treatment; Fraunces is limited to rare brand-level moments.

### Core tokens

- Forest: `#173E31`
- Deep forest: `#12392D`
- Leaf: `#2F6B42`
- Ivory: `#F7F3E8`
- Paper: `#FFFDF8`
- Warm gold: `#D8A75B`
- Muted text: `#657367`
- Border: `#DCE5D8`
- Error: `#B42318`
- Warning: `#B54708`
- Success: `#237A45`
- Information: `#175CD3`

## 5. Responsive contract

Every route prompt requests exactly two primary frames:

- Desktop: `1440 × 1024`
- Mobile: `390 × 844`

Layouts must also imply a workable tablet transition around 768–1024px. Mobile requirements include 44px minimum touch targets, no horizontal page overflow, forms in one column, drawers instead of fixed sidebars, and tables converted to card/list representations.

## 6. Functional fidelity

The prompts must preserve the routes, fields, actions, roles, and business lifecycles already implemented. Stitch may reorganize presentation but must not invent features, change permissions, or skip operational states.

Every applicable screen covers:

- Loading or skeleton state.
- Empty state with an appropriate next action.
- Error state with retry or recovery.
- Success feedback.
- Validation and disabled controls.
- Confirmation for destructive or irreversible operations.

All interface copy is Vietnamese. Currency is VND. Dates and statuses use clear Vietnamese formatting.

## 7. Accessibility and quality bar

- WCAG AA text contrast.
- Visible keyboard focus.
- Semantic labels and understandable control names.
- Color is never the only status indicator.
- Reduced-motion-safe transitions.
- No purple gradients, generic SaaS dashboards, decorative three-card grids, uniform oversized rounding, fake analytics, or English placeholder UI.

## 8. Prompt pack structure

- `docs/ui-prompts/stitch/README.md`: execution order, route index, and handoff checklist.
- `docs/ui-prompts/stitch/01-master-design-and-shell.md`: Master Design DNA and shared shell prompts.
- `docs/ui-prompts/stitch/02-public-auth-account.md`: P01–P12.
- `docs/ui-prompts/stitch/03-customer-staff.md`: P13–P28.
- `docs/ui-prompts/stitch/04-warehouse-admin.md`: P29–P42.

## 9. Acceptance criteria

- All 42 concrete routes appear exactly once in the route prompt index.
- Every route has a desktop and mobile frame requirement.
- Home and About are explicitly preserved.
- Every prompt names the correct shell and role.
- Screen actions and states match the current React implementation.
- Prompts share one coherent design DNA and avoid prohibited visual patterns.
- The handoff checklist makes it possible to map every returned Stitch frame back to its route.
