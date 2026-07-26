# Refund Bank Destination and Manual Payout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Customer-entered BIN, make manual payout usable without PayOS/webhook, and recover unresolved PayOS attempts without permitting double payout.

**Architecture:** A server-owned bank catalog maps safe bank codes to canonical name/BIN. `RefundPending` becomes the authoritative payout projection and claim owner; append-only payout execution/reconciliation evidence supports explicit PayOS or manual paths with CAS/idempotency.

**Tech Stack:** Node.js, Express, Mongoose transactions/indexes, official `@payos/node`, React, native Node tests, Vite.

---

### Task 1: Add a canonical payout bank catalog

**Files:**
- Create: `server/src/config/refundBankCatalog.js`
- Create: `server/src/config/refundBankCatalog.test.js`
- Modify: `server/src/routes/returnRefund.routes.js`
- Modify: `server/src/controller/returnRefund.controller.js`
- Modify: `server/src/controller/returnRefund.controller.test.js`

- [ ] **Step 1: Write failing catalog and endpoint tests**

Assert unique stable codes/BINs, six-digit BINs, safe `{code,name}` Customer response, authenticated Customer-only access, `Cache-Control: no-store`, and no BIN in the public response.

- [ ] **Step 2: Verify RED**

Run: `node --test src/config/refundBankCatalog.test.js src/controller/returnRefund.controller.test.js`
Expected: FAIL because catalog/endpoint do not exist.

- [ ] **Step 3: Implement the reviewed server-owned catalog**

Export immutable `listPublicBanks()` and `resolveBank(code)`. Keep canonical BIN internal. Add `GET /return-refunds/banks`.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Replace browser-trusted bank/BIN input

**Files:**
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `client/src/services/returnRefundService.js`
- Modify: `client/src/services/returnRefundService.test.js`
- Modify: `client/src/pages/customer/ReturnRefundPage.jsx`
- Modify: `client/src/pages/customer/returnRefundUiContract.test.js`

- [ ] **Step 1: Write failing backend/client tests**

Require `bankCode`, canonical resolution, and rejection of unknown code, `bankName`, `bankBin`, or credential-shaped keys (`pin`, `otp`, `password`, `cvv`, `passcode`). Assert exact safe payload, digit/length validation, stable key, rapid-submit lock, sensitive-state clearing, bank loading/error state, and the warning that GreenHome never requests credentials.

- [ ] **Step 2: Verify RED**

Run the exact four test files. Expected: new assertions FAIL.

- [ ] **Step 3: Implement canonical submit and UI selector**

The client sends only:

```js
{ bankCode, accountNumber, accountHolderName, confirmed, idempotencyKey }
```

The service snapshots the catalog's canonical bank name/BIN into the existing encrypted destination flow. Set `no-store` on Customer destination/list responses and stop returning BIN outside internal Staff/payout code.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Make RefundPending the authoritative payout projection

**Files:**
- Modify: `server/src/models/refundPending.model.js`
- Modify: `server/src/models/refundPending.model.test.js`
- Modify: `server/src/models/refundPayoutEvidence.model.js`
- Modify: `server/src/models/refundPayoutEvidence.model.test.js`
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/returnRefund.service.test.js`

- [ ] **Step 1: Write failing state/projection tests**

Add `payoutMethod`, `payoutStartedAt`, evidence `evidenceKind`, and `reconcilesOperationKey`. Prove projection uses RefundPending even with no evidence and exposes only server-derived capability/action booleans.

- [ ] **Step 2: Verify RED**

Run the four model/service test files. Expected: FAIL.

- [ ] **Step 3: Implement schema and projection**

Return:

```js
{
  payout: {
    status, method, operationKey, startedAt, evidence,
    canStartPayOS, canRecordManualSuccess,
    canReconcilePayOS, requiresManualPayOSResolution
  },
  capabilities: { payOSConfigured, manualPayout: true }
}
```

Add a partial unique index allowing at most one Succeeded evidence per refund obligation.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 4: Fix provider-error claims and add manual reconciliation

**Files:**
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `server/src/routes/returnRefund.routes.js`
- Modify: `server/src/controller/returnRefund.controller.js`
- Modify: `server/src/controller/returnRefund.controller.test.js`

- [ ] **Step 1: Write failing command/race tests**

Cover configuration failure before claim, provider throw after claim producing visible Unknown, same-key PayOS retry, unresolved operation blocking new payouts, reconciliation `Succeeded|Failed|Unknown`, required exact operation key/reference/time/note/confirmation, stale CAS, replay/reuse, PayOS-success race, and at most one successful payout.

- [ ] **Step 2: Verify RED**

Run: `node --test src/services/returnRefund.service.test.js src/controller/returnRefund.controller.test.js`
Expected: new tests FAIL.

- [ ] **Step 3: Implement guarded reconciliation**

Add Staff-only `POST /staff/return-refunds/:id/payout-reconciliation`. Reconciliation never calls PayOS:

- `Succeeded` finalizes from verified existing-operation evidence.
- `Failed` releases the exact operation but does not complete.
- `Unknown` retains the lock.

Every write is transactional, idempotency-bound, CAS-bound to current `payoutOperationKey`, Audit-redacted, and outbox-safe.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 5: Redesign Staff payout UI as one explicit method flow

**Files:**
- Modify: `client/src/pages/staff/ReturnRefundDetailPage.jsx`
- Modify: `client/src/services/returnRefundService.js`
- Modify: `client/src/services/returnRefundService.test.js`
- Create: `client/src/pages/staff/refundPayoutUiContract.test.js`
- Modify: `client/src/styles.css` only for narrowly scoped responsive styles.

- [ ] **Step 1: Write failing UI/service tests**

Assert PayOS/manual are never simultaneously actionable, server capabilities/actions are authoritative, manual works without webhook, PayOS confirmation sends once, manual attestation/reference/time/note validation, Processing/Unknown hides new payout actions, reconciliation sends exact operation key, Completed is read-only, stable keys/synchronous locks, typed 409 guidance, live regions, field associations, and mobile stacking.

- [ ] **Step 2: Verify RED**

Run the exact client files. Expected: FAIL.

- [ ] **Step 3: Implement the minimal method fieldset**

Render one labelled method selector for NotStarted/Failed. Only selected controls mount. For unresolved state show PayOS same-key retry/provider reconcile when allowed and a manual reconciliation form; reload canonical state after every command.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and existing Staff COD/refund UI contract. Expected: PASS.

### Task 6: Migration, runbook, and release evidence

**Files:**
- Create: `server/src/scripts/migrateRefundPayoutReconciliation.js`
- Create: `server/src/scripts/migrateRefundPayoutReconciliation.test.js`
- Modify: `server/package.json`
- Modify: `docs/RETURN_REFUND_RECONCILIATION.md`
- Modify: `docs/member-plans/04_NGUYEN_HUU_ANH_NHAT_PLAN.md`
- Modify or create the Return/Refund traceability, handoff, release-audit addendum under `docs/reviews/`.

- [ ] **Step 1: Write failing migration/preflight tests**

Prove dry-run lists unresolved obligations and noncanonical historical bank pairs without private values, apply creates exact repeat-safe indexes/default compatibility only, never invents evidence or changes payout outcome, verify checks schema/indexes, and second run performs zero business writes.

- [ ] **Step 2: Verify RED**

Run: `node --test src/scripts/migrateRefundPayoutReconciliation.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement migration/runbook and update factual docs**

Document the Staff recovery sequence: inspect current operation, reconcile Succeeded/Failed/Unknown, and create a new manual payout only after Failed. Do not record predicted test counts.

- [ ] **Step 4: Verify targeted gates**

### Task 6 implementation addendum (2026-07-26)

- [x] Migration supports explicit `preflight`, default `dry-run`, `apply`, and `verify`.
- [x] Dry-run has no writes and disables Mongoose automatic collection/index creation.
- [x] Apply creates only repeat-safe reviewed indexes; it never changes payout outcomes,
  invents evidence, or rewrites customer bank destinations.
- [x] Runbook documents exact unresolved-operation recovery and manual payout only after
  verified `Failed` reconciliation.
- [x] Task 4/Task 5 integration uses the exact
  `transferReference/transferredAt/note/confirmed` boundary and makes Completed read-only.
- [x] A later incident cannot reopen or repay a terminal successful obligation; a late
  PayOS result is rejected by exact-operation CAS.
- [x] Combined local verification after integrating current `origin/main`: server
  `1236/1236`, client `378/378`, focused PayOS/migration/real-Mongo persistence `13/13`,
  and production client build PASS (172 modules). The known chunk-size warning remains.

Run all changed test files, payOS config tests, `git diff --check`, forbidden-file scan, and secret scan. Expected: PASS with no `.env`, credential, upload, output, or prohibited documentation path.
