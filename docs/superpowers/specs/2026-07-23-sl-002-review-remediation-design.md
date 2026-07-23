# SL-002 Review Remediation Design

**Status:** approved for implementation by the Project Business Approver through the instruction to fix the reviewed PR
**Normative sources:** `2026-07-22-sl-002-exchange-design.md` and `2026-07-23-cr-001-cross-slice-business-closure-v2.md`
**Scope:** correctness and security remediation for PR #7; no new Exchange money policy

## 1. Chosen Approach

Harden the current SL-002 architecture instead of patching isolated symptoms or replacing the whole service. State transitions become compare-and-set operations inside the existing transaction boundary. Physical-unit claims become explicit and exclusive across cases. Shipment incidents remain shipment facts and the case state is derived without allowing one line to hide another unresolved incident.

## 2. State and Concurrency

- Every competing transition claims the case from an explicit allowed status before releasing stock, transferring the after-sales lock, or creating dependent records.
- A failed claim returns `409` and commits no reservation, lock, conversion, handoff, or cancellation side effect.
- Customer may choose `WAIT` and later use a fresh command identity to choose `CONVERT_TO_RETURN`.
- Retry reservation is an idempotent Staff command. The same key returns the same effect; a different attempt uses a new key.
- Terminal Exchange cases reject new delivery/loss/damage facts while retaining append-only dispute and correction evidence.

## 3. Physical Unit Lineage

- Each source physical unit receives a stable exclusive claim key:
  - original unit: Order + OrderDetail + purchased ordinal;
  - replacement unit: delivered lineage record ID.
- A unique database index prevents two cases from claiming the same source unit.
- Rejected, Customer-cancelled, and expired pre-handoff cases release unit claims as allowed by CR-001.
- Completed Exchange, closed-no-exchange, and conversion retain the claim so an already consumed physical source cannot start another cycle.
- For a multi-quantity original Order line, the server allocates only unclaimed purchased ordinals.

## 4. Shipment Incidents and Carrier Boundary

- Creating another outbound shipment never overwrites an unresolved `DeliveryIncident`.
- A replacement loss/damage remains Shop responsibility and may use the existing exact-SKU resend path.
- A rejected-original loss/damage remains open for evidence-based operational reconciliation; the system does not invent a Refund, replacement, or compensation rule that the approved SRS does not define.
- Completion requires every shipment obligation to be delivered or resolved by a delivered resend.
- Carrier webhook signatures cover timestamp, HTTP method, request path, and raw body. Stale timestamps are rejected.
- Carrier responses expose only an acknowledgement identity and replay result, never Customer/Staff/Warehouse case projections.

## 5. COD Recovery

- Zero Customer collection closes the held request after complete goods recovery because no payout is required.
- Positive Customer collection creates the fixed server-derived `COD_RECOVERY` obligation and keeps the held request in `CODRecoveryInProgress`.
- `ClosedByCODRecovery` and `recoveryCompletedAt` are forbidden until the recovery Refund is verified `Refunded`.

## 6. UI Contracts

- Quantity-one lines use a checkbox; quantity-many lines use a bounded `<select>` from zero through purchased quantity.
- Staff must enter the evidence-backed shipment event time; the UI must not substitute button-click time.
- Successful stock choice, reservation retry, shipment event, and resend actions rotate their idempotency keys. Failed retries keep the same key.

## 7. Verification

Regression tests must first fail against the reviewed implementation, then pass after each minimal fix. Completion requires the full server test suite, full client test suite, production client build, security audit, script safety test, and a conflict-free merge-tree against current `origin/main`.
