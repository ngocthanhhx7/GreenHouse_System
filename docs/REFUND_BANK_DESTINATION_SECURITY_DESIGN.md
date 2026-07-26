# Refund Bank Destination Security Design

Date: 2026-07-26
Business Approver: Nguyễn Ngọc Thành
Primary owner: Nguyễn Hữu Anh Nhật
Provider/final reviewer: Nguyễn Ngọc Thành

## 1. Problem and security decision

The refund form does not collect a bank PIN. It currently asks the Customer to type a six-digit bank BIN because payOS payout requires a destination bank identifier. This is still an unsafe UX and trust-boundary design:

- Customers can mistake BIN for PIN.
- Customers can submit a syntactically valid but incorrect bank-name/BIN pair.
- A technical routing identifier is being trusted from the browser.

Approved behavior:

- GreenHome never asks for or accepts a bank PIN, OTP, banking password, card PIN, CVV, or passcode.
- Customer selects a bank by public name/code.
- The server resolves the canonical bank name and BIN.
- BIN remains internal payout routing data and is not a Customer input or display field.

## 2. Customer flow

Eligible refund destination form fields:

- Bank selector backed by the server-owned payout bank catalog.
- Bank account number, digits only, 6–24 characters, leading zeroes preserved.
- Account holder name, normalized to uppercase, 2–120 characters.
- Explicit unchecked confirmation.

Security notice:

`GreenHome không bao giờ yêu cầu mã PIN, OTP, mật khẩu ngân hàng hoặc CVV.`

The Customer command sends only:

```json
{
  "bankCode": "MB",
  "accountNumber": "0123456789",
  "accountHolderName": "NGUYEN VAN A",
  "confirmed": true,
  "idempotencyKey": "..."
}
```

The client must:

- use one stable idempotency key across an ambiguous retry;
- synchronously block rapid duplicate submits;
- disable all destination controls while pending;
- clear full account values from React state after authoritative success;
- never put financial values in a URL, local/session storage, analytics, or error logging;
- render field-specific errors and accessible loading/error/empty states for the bank catalog.

## 3. Canonical bank catalog

Expose an authenticated, read-only Customer endpoint:

`GET /api/return-refunds/banks`

Response items contain only `{ code, name }`.

The server owns a versioned allowlist mapping stable bank code to canonical display name and six-digit BIN. The catalog source/version is documented and reviewed when updated. The browser never supplies the canonical name or BIN.

Submission must reject:

- unknown/disabled `bankCode`;
- client-supplied `bankName` or `bankBin`;
- any credential-shaped field including `pin`, `otp`, `password`, `cvv`, `passcode`, case-insensitively;
- invalid account number, account holder name, confirmation, or idempotency key.

Existing persistence continues to snapshot canonical `bankName` and `bankBin` so payOS reconciliation remains deterministic.

## 4. Persistence and privacy

Preserve the current secure boundary:

- account number and account holder are encrypted at rest and `select: false`;
- only last four account digits and a masked holder are present in ordinary projections;
- Customer, queues, notifications, Warehouse, Audit, and outbox never receive full values;
- authorized Staff detail receives the minimum full values needed for destination verification;
- payout evidence stores a destination snapshot hash, not raw account details.

All Customer destination GET/POST responses set `Cache-Control: no-store`. Staff bank UI does not display BIN; backend uses it internally for payOS.

No PIN/OTP/password/CVV field exists, so no credential cleanup migration is required.

## 5. Existing records

Existing immutable destination versions are not rewritten:

- Submitted records with a non-canonical bank pair may be rejected by Staff so the Customer can submit a canonical version.
- Verified historical records retain their snapshot for manual payout/reconciliation.
- A read-only preflight reports historical non-canonical pairs without exposing account details.

The schema need not change because the command can resolve `bankCode` into the existing canonical snapshot fields.

## 6. PayOS boundary

The payOS adapter continues receiving only server-derived:

- `toBin`
- decrypted `toAccountNumber`
- immutable refund amount/reference/idempotency facts

The adapter never receives browser-supplied BIN. Provider responses remain classified and compared with the immutable destination snapshot before payout completion.

## 7. Payout method and manual reconciliation

The Staff payout surface must make the two supported methods explicit:

- `Chuyển khoản thủ công`
- `Chi trả online qua PayOS`

Manual transfer is a first-class path and does not require a payOS webhook. Before any payout attempt, Staff may choose manual transfer, enter the bank transaction/reference, actual transfer time, and a bounded reconciliation note, then explicitly confirm the evidence. The refund amount remains server-derived and non-editable. A verified `MANUAL / Succeeded` evidence record atomically completes the refund exactly as the existing invariant requires.

The payOS path uses direct create/get payout APIs. A changing local webhook URL must not be presented as a prerequisite for manual transfer. No live payout test is performed without explicit financial authorization and valid provider credentials.

### Authoritative payout projection and claim

The existing projection incorrectly derives `payoutStatus` from the latest evidence record. `RefundPending` is the authority and may already be `Processing` even when provider failure prevented evidence persistence. The response must expose a safe server-derived payout projection:

```json
{
  "payout": {
    "status": "NotStarted",
    "method": "",
    "operationKey": "",
    "startedAt": null,
    "evidence": null,
    "canStartPayOS": true,
    "canRecordManualSuccess": true,
    "canReconcilePayOS": false,
    "requiresManualPayOSResolution": false
  },
  "capabilities": {
    "payOSConfigured": true,
    "manualPayout": true
  }
}
```

Add bounded `payoutMethod` and `payoutStartedAt` facts to `RefundPending`. Every payout path must claim the obligation by compare-and-set before a provider call or evidence write. Add a unique partial index that permits at most one `Succeeded` payout evidence per `refundPendingId`.

If payOS configuration is missing, fail before claiming. If the provider call throws after a claim, append or project a durable `Unknown` attempt bound to the operation key and return a typed unknown-result failure. The obligation must never be left in invisible `Processing`.

The UI consumes only server action booleans and capabilities. It must not infer authority from the latest evidence or `import.meta.env`.

### Unresolved payOS attempt

An existing `Processing` or `Unknown` payOS attempt must continue blocking a second payout. The UI must show:

1. `Đối soát lại PayOS`, which uses the provider read API; and
2. `Xác nhận PayOS chưa chi`, a guarded manual reconciliation command for Staff who has checked the payOS dashboard/bank statement.

`Xác nhận PayOS chưa chi` requires:

- exact current `reconcilesOperationKey`;
- prior provider reference when one exists;
- reconciliation time not before the prior attempt and not in the future;
- a 20–1000 character reconciliation note;
- explicit acknowledgement of the selected reconciliation outcome;
- a stable idempotency key.

The reconciliation command accepts only:

- `Succeeded`: Staff verified that the current operation already paid the exact destination and amount; complete from that evidence without creating another payout.
- `Failed`: Staff verified that the current operation did not pay; release the obligation to `Failed`, after which a new manual transfer is permitted.
- `Unknown`: retain the lock and record the latest investigation result.

Add immutable `evidenceKind = PAYOUT_EXECUTION | OPERATION_RECONCILIATION` and optional `reconcilesOperationKey` to payout evidence so the proof chain is auditable even when a provider response was lost before an evidence ID existed. The transaction must compare-and-set the exact current RefundPending operation, append evidence and Audit, update the payout state, and emit a safe operational outbox event. Same-key replay returns the original result; stale or mismatched operation/evidence returns a typed conflict.

If the original PayOS response was lost before a provider reference existed, the UI may retry only the same PayOS operation with the same operation/idempotency key. It must never mint a new key for that retry.

The UI must never silently switch from payOS to manual or automatically retry a transfer.

### Staff method UX

When the authoritative state is `NotStarted` or `Failed`, render one labelled `Phương thức chi trả` fieldset:

- PayOS is disabled with a safe explanation when not configured.
- Manual transfer is selectable without PayOS/webhook and may be the default in local operation.
- Only the selected method's controls are rendered.
- PayOS requires a confirmation dialog explaining that a real payout attempt will be created.
- Manual requires the checkbox:
  `Tôi đã kiểm tra giao dịch này đã thành công cho đúng tài khoản đã xác minh và chưa có lệnh PayOS đang xử lý.`

When the state is `Processing` or `Unknown`, hide all new-payout controls. Show only reconciliation/recovery actions. `Succeeded`/Completed is read-only.

Both commands use synchronous client locks and stable idempotency keys retained through uncertain retries. A structured unresolved-attempt 409 reloads the authoritative projection and focuses the reconciliation action.

## 8. Acceptance evidence

Tests must prove:

1. No Customer/Staff UI input asks for BIN, PIN, OTP, password, passcode, or CVV.
2. Bank catalog returns only safe canonical code/name values.
3. A valid bank code maps to the exact canonical bank name/BIN before persistence.
4. Unknown code or browser-supplied bank/BIN/credential field fails before any write.
5. The payOS gateway receives the server-derived BIN.
6. Customer/queue/Warehouse/notification/audit DTOs contain neither full account data nor BIN.
7. Staff detail remains the only authorized decrypting projection and its responses are `no-store`.
8. Same idempotency key/facts replay; changed facts conflict.
9. Rapid duplicate UI submit makes one request; uncertain retry retains its key.
10. Full form values are erased from client memory after success and only the masked projection remains.
11. Existing verified destinations still support payout and reconciliation.
12. Staff can complete a refund through manual transfer without payOS/webhook when no payout is unresolved.
13. A `Processing/Unknown` payOS attempt blocks manual payout until explicitly reconciled.
14. Manual reconciliation appends only an allowed result for the exact current payOS operation and requires confirmation/note/time.
15. Reconciliation never sends a payout; `Succeeded` completes from verified existing-operation evidence, `Failed` only releases the lock, and `Unknown` retains it.
16. After a verified Failed reconciliation, one idempotent manual Succeeded payout evidence may complete the refund.
17. Stale/mismatched/replayed reconciliation cannot release another payout operation.
18. Staff UI presents the two methods clearly, shows the unresolved-attempt recovery actions, and never exposes an amount input.
19. A provider exception after a claimed PayOS attempt yields a visible durable Unknown projection rather than an evidence-less Processing lock.
20. Payout action booleans come from `RefundPending`, and PayOS/manual are never simultaneously actionable.
21. Concurrent PayOS/manual attempts have one claim winner and at most one Succeeded evidence record.
22. A completed Succeeded obligation is immutable: an incident may be recorded, but no
    corrective PayOS/manual payout is available and no provider result may overwrite a
    later exact-operation reconciliation.

## 9. Documentation

## 10. Migration boundary

`migrateRefundPayoutReconciliation.js` is an index-only safety migration. It offers
`preflight`, `dry-run`, `apply`, and `verify`; dry-run is the default and connects with
Mongoose `autoIndex` and `autoCreate` disabled. Its bounded aggregate diagnostics expose
only safe IDs/statuses for unresolved obligations, invalid payout correlations,
noncanonical historical bank snapshots, and duplicate successful payout evidence. It
never reads or prints full account/holder values, BIN, or reason.

Apply adds only reviewed payout-state and payout-evidence indexes after fail-closed
preflight. It never manufactures evidence, changes a payout outcome, or rewrites a bank
destination. A second apply must be business-write-free; verify confirms exact indexes.

Update `RETURN_REFUND_RECONCILIATION.md`, Nguyễn Hữu Anh Nhật's member plan, Return/Refund traceability/handoff/release audit, environment documentation for the existing refund encryption key, and deployment walkthrough evidence.
