# SL-002 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the correctness and security blockers found while reviewing PR #7 without changing the approved SL-002 business policy.

**Architecture:** Keep the existing service/model/controller boundaries. Add compare-and-set transitions and exclusive physical-unit claims at the repository layer, derive case progress from shipment obligations, and expose a minimal signed Carrier webhook contract.

**Tech Stack:** Node.js, Express, Mongoose, React, Node test runner

## Global Constraints

- Exchange contains no Refund amount, bank account, payout, payOS, different-SKU, price-difference, or shipping-charge input.
- Customer cancellation is allowed only before Carrier handoff.
- Every accepted replacement and rejected-original outbound obligation must be delivered before completion.
- Positive COD recovery cannot close before its fixed server-derived payout is verified.
- All behavioral fixes follow RED-GREEN-REFACTOR.

---

### Task 1: Atomic transitions

**Files:**
- Modify: `server/src/services/exchange.service.js`
- Test: `server/src/services/exchange.service.test.js`

**Interfaces:**
- Consumes: repository `claimCase(id, statuses, data, session)`
- Produces: atomic handoff, cancel, wait, conversion, expiry, approval-failure, and incident transitions

- [ ] Add regression tests that simulate a failed case claim and assert no lock, reservation, conversion, or terminal-state side effect.
- [ ] Run `node --test src/services/exchange.service.test.js` from `server`; confirm the new tests fail on blind updates.
- [ ] Replace competing blind updates with `claimCase` inside their transaction boundaries.
- [ ] Re-run the focused tests and confirm all pass.

### Task 2: Exclusive physical-unit lineage

**Files:**
- Modify: `server/src/models/exchangeUnitLineage.model.js`
- Modify: `server/src/services/exchange.service.js`
- Modify: `server/src/scripts/migrateSl002Exchange.js`
- Test: `server/src/models/exchangeModels.model.test.js`
- Test: `server/src/services/exchange.service.test.js`

**Interfaces:**
- Produces: `exclusivePhysicalClaimKey`, `listClaimedOriginalUnitOrdinals`, and `releaseUnitClaims`

- [ ] Add failing model/service tests for stable unique claims, duplicate replacement-unit submission, and allocation of the next unclaimed original ordinal.
- [ ] Run the focused model and service tests and confirm the failures.
- [ ] Add the indexed claim field, repository queries, release operation, and server-side ordinal allocation.
- [ ] Release claims only for Rejected, Cancelled, and Expired cases.
- [ ] Re-run the focused tests and confirm all pass.

### Task 3: Shipment incident reconciliation

**Files:**
- Modify: `server/src/services/exchange.service.js`
- Test: `server/src/services/exchange.service.test.js`

**Interfaces:**
- Produces: unresolved-incident derivation and terminal-event guards

- [ ] Add failing tests for multi-line incident preservation, rejected-original incident classification, and a late loss event after completion.
- [ ] Run the focused service tests and confirm the failures.
- [ ] Preserve `DeliveryIncident` while any shipment incident lacks a delivered resend or correction.
- [ ] Reject new delivery/loss/damage facts against terminal cases and prevent duplicate completion notification.
- [ ] Re-run the focused tests and confirm all pass.

### Task 4: Carrier webhook security and privacy

**Files:**
- Modify: `server/src/middlewares/carrierSignature.middleware.js`
- Modify: `server/src/services/exchange.service.js`
- Test: `server/src/middlewares/carrierSignature.middleware.test.js`
- Test: `server/src/services/exchange.service.test.js`

**Interfaces:**
- Consumes: `x-carrier-timestamp`, request method, `originalUrl`, and raw body
- Produces: HMAC verification and `{ eventId, eventType, idempotentReplay }` Carrier ACK

- [ ] Add failing tests for cross-path replay, stale timestamp, valid canonical signature, and absence of case data in Carrier responses.
- [ ] Run focused tests and confirm the failures.
- [ ] Implement canonical signed input and five-minute timestamp tolerance.
- [ ] Return the minimal Carrier acknowledgement on new and replayed events.
- [ ] Re-run focused tests and confirm all pass.

### Task 5: COD recovery closure

**Files:**
- Modify: `server/src/services/codReconciliation.service.js`
- Test: `server/src/services/codReconciliation.service.test.js`

**Interfaces:**
- Produces: pending positive-payout hold and immediate zero-collection closure

- [ ] Change the positive-collection test to require `CODRecoveryInProgress`, no `recoveryCompletedAt`, and a linked pending Refund.
- [ ] Run the focused test and confirm it fails.
- [ ] Keep positive recovery open; close only zero-collection or already-Refunded recovery.
- [ ] Re-run focused tests and confirm all pass.

### Task 6: UI and command idempotency

**Files:**
- Modify: `client/src/pages/customer/OrderDetailPage.jsx`
- Modify: `client/src/pages/customer/ExchangeDetailPage.jsx`
- Modify: `client/src/pages/staff/ExchangeDetailPage.jsx`
- Test: `client/src/pages/exchangeUiContract.test.js`
- Test: `client/src/services/exchangeService.test.js`

**Interfaces:**
- Produces: bounded quantity selector, evidence timestamp input, and per-success command-key rotation

- [ ] Add failing source-contract tests for `<select>` quantity, explicit event time, and command-key rotation.
- [ ] Run focused client tests and confirm the failures.
- [ ] Implement the bounded selector, explicit time field, and key rotation after successful commands.
- [ ] Pass an idempotency key to reservation retry.
- [ ] Re-run focused client tests and confirm all pass.

### Task 7: Verification-script safety

**Files:**
- Modify: `server/src/scripts/verifySl002Exchange.js`
- Test: `server/src/scripts/verifySl002Exchange.test.js`

**Interfaces:**
- Produces: `assertSafeTarget(uri)` local-only guard

- [ ] Add failing tests for production, remote MongoDB, and allowed localhost targets.
- [ ] Run the focused test and confirm it fails.
- [ ] Export and invoke the guard before database connection or mutation.
- [ ] Re-run the focused test and confirm all pass.

### Task 8: Full verification and PR update

**Files:**
- Verify all changed files

- [ ] Run `npm test` in `server`.
- [ ] Run `npm test` in `client`.
- [ ] Run `npm run build` in `client`.
- [ ] Run `npm audit --omit=dev` in `server` and `npm audit` in `client`.
- [ ] Run `git diff --check`.
- [ ] Fetch `origin/main` and run `git merge-tree --write-tree HEAD origin/main`.
- [ ] Commit only scoped files, push `feature/sl-002-exchange`, and re-check PR #7 status.
