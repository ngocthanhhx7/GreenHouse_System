# SL-001 Traceability and Local Closure

**Slice:** `SL-001` — trả toàn bộ đơn hàng và hoàn tiền
**Business baseline:** `docs/superpowers/specs/2026-07-22-sl-001-return-refund-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-07-23-sl-001-return-refund-implementation.md`
**Verification date:** 2026-07-23
**Working tree:** worktree cô lập trên `feature/sl-001-return-refund`, tách từ base commit `1e625cf`; chưa deploy production.

## Scope boundary

SL-001 sở hữu toàn bộ luồng từ Customer tạo yêu cầu cho đến khi Shop đã nhận đủ hàng, chi trả được xác minh, Request thành `Completed`, Order thành `Returned`. SL-002–SL-009 không được triển khai trong gói bàn giao này, ngoại trừ các seam COD/Notification/Inventory mà SL-001 bắt buộc phải gọi.

Ba điều kiện tích hợp/vận hành vẫn phải được xác minh ở môi trường đích:

1. Tài khoản merchant PayOS phải được cấp quyền Payout và có credential thật. Adapter hiện đã khớp official SDK/API và được kiểm thử bằng provider fake, nhưng chưa gọi tiền thật.
2. Khi SL-002 Exchange được triển khai, nó phải dùng chung khóa “một after-sales case đang hoạt động trên mỗi Order”. SL-001 hiện đã khóa trùng Return/Refund; khóa chéo Return/Exchange chỉ có thể hoàn tất khi SL-002 tồn tại.
3. Production phải cấu hình dịch vụ quét mã độc, khóa ký claim bằng chứng và số ngày lưu bằng chứng đã được phê duyệt; sau đó chạy smoke test upload/đọc/xóa theo retention trên môi trường đích.

## Gate status

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 |
|---|---|---|---|---|---|---|---|---|
| SL-001 | passed | passed | passed | passed | passed | passed | passed-local | passed-local |

`passed-local` nghĩa là code, database cục bộ, actor walkthrough và hồ sơ bàn giao đã khép kín; nó không đồng nghĩa với đã deploy production hoặc đã chuyển tiền thật qua PayOS.

## Requirement traceability

| Requirement | Actor/interface | Implementation | Acceptance evidence | Status |
|---|---|---|---|---|
| BR-RR-01–04: owned Delivered Order, 5 ngày, reason/evidence, Staff decision, 3 ngày bàn giao | Customer `POST /api/orders/:id/return-refund`; Customer handoff; Staff decision/expiry | `returnRefund.service.js`, `returnRefundRequest.model.js`, expiry worker, Customer/Staff pages | Service tests: eligibility/deadline/duplicate/rejection/handoff/expiry; live lifecycle | verified |
| BR-RR-05–06, 15: Customer-confirmed destination; Staff verify/reject only; Warehouse sees none | Customer destination API; Staff detail/decision; role-specific response | `refundDestination.model.js`, `refundDestinationCrypto.js`, destination service methods | encrypted-at-rest tests; foreign-owner denial; correction version; Staff queue masked/detail full; Warehouse absence | verified |
| BR-RR-03, 15: evidence is authenticated, owner-bound, scanned and retained by policy | Upload + signed claim + `GET /api/return-refunds/evidence/:filename` | `upload.service.js`, `returnEvidence.service.js`, claim utility, retention worker, protected evidence component | max 5/20 MiB; wrong-owner/tampered claim and EICAR rejected; public path 404; role access and retention cleanup tests pass | verified-local |
| BR-RR-07–08: exact whole-order receipt and atomic Inventory/Refund handoff | Warehouse inspection API | return service transaction, `ReturnItem`, `InventoryTransaction`, `RefundPending` | exact-line/quantity tests, injected rollback, replay test; live Mongo writes two movements | verified |
| BR-RR-02, 09, 12: fixed server-derived amount and readiness join | Staff manual/PayOS payout APIs | payout service and Staff UI | Staff-supplied amount rejected; no amount input/display; receipt-only and destination-only gates tested | verified |
| BR-RR-09–10, 14: append-only/idempotent payout and terminal completion | PayOS start/reconcile; manual evidence; guarded completion | `payos.js`, `refundPayoutEvidence.model.js`, `refundPending.model.js` | Processing/Unknown nonterminal; snapshot mismatch blocked; verified success preserves primary `Paid`; replay creates no second effect | verified-local |
| BR-RR-11: responsibility follows causation | Staff payout-incident API | `refundPayoutIncident.model.js`, correction/recovery transaction | Customer branch blocks automatic second payout; Shop/provider branch corrects false completion and resolves only with new evidence | verified |
| BR-RR-13: one active case and idempotency | Request unique partial index and command identities | request/destination/inspection/payout indexes and claims | duplicate/concurrent/replay tests; Return/Exchange cross-lock remains the declared SL-002 seam | verified-conditional |
| BR-RR-16: notification failure cannot roll back business facts | transition notifications | idempotent event identity includes request and evidence/incident identity | tests prove recovery completion has a distinct final event; notifications remain outside business transaction | verified |

## Acceptance map

| Acceptance | Primary automated evidence |
|---|---|
| AT-001–AT-006 | `server/src/services/returnRefund.service.test.js`: create, ownership/status/deadline, duplicate, approve/reject, handoff and expiry cases |
| AT-007–AT-010 | destination encryption/model/service tests, Staff redaction tests, Warehouse no-destination response |
| AT-011–AT-012 | complete-line receipt, atomic inventory/refund commit, rollback and replay tests |
| AT-013–AT-015 | manual + PayOS payout tests, server-derived amount rejection, provider reconciliation and completion tests |
| AT-016–AT-017 | Customer-responsibility and Shop/provider recovery tests |
| AT-018 | completion/idempotency/notification tests plus live Mongo recovery lifecycle |
| Actor/UI | `client/scripts/verify_sl001_ui.py`: Customer, Staff, WarehouseManager and denied Customer→Staff route |

## Gate evidence

### G4 — intended red tests

The added acceptance tests were observed failing for the intended gaps before implementation, including private evidence access, distinct notification identity after corrective payout, and server-only payout amount derivation. Setup/syntax failures were corrected separately and were not counted as business red evidence.

### G5 — green implementation

- Server: `368/368` tests passed across `72` suites.
- Client: `123/123` tests passed across `40` suites.
- Production build: passed; Vite transformed `134` modules. The existing bundle-size warning remains non-blocking.
- Migration: `npm run migrate:cod-reconciliation` passed twice; the second run reported zero backfills and no index replacement/drop.

### G6 — actor and data acceptance

- Browser walkthrough: Customer, Staff and WarehouseManager passed; Customer was redirected away from the Staff route.
- UI assertions: `refundAmountInputs=0`, `warehouseDestinationVisible=false`, `consoleErrors=0`.
- Live transaction lifecycle: `New → Approved → Received → Completed`.
- False-completion recovery: `Completed → Received → Completed`.
- Final invariants: two inventory movements, two payout-evidence records, incident `Resolved`, Refund `Refunded`, Order `Returned`, primary Payment `Paid`.
- Cleanup: temporary Order/Request/Category counts are all zero.
- Incident indexes: `_id_`, `refund_payout_incident_evidence_cause`, `refund_payout_incident_key`, `refund_payout_incident_request_status_created`.

### G7 — local release closure

- [x] Business decisions, actor boundaries and state invariants are preserved.
- [x] Requirement-to-code-to-test mapping is complete for SL-001.
- [x] API/UI/database behavior is locally verified.
- [x] Sensitive destination and evidence access is role scoped and non-cacheable.
- [x] Evidence uploads are size-limited, owner-bound by signed claim, scanned before storage, and covered by retention/disposal tests.
- [x] Handoff document records commands, files, known conditions and ownership.
- [ ] Production PayOS entitlement/credential and one low-value controlled payout must be verified by the deployment owner.
- [ ] Shared Return/Exchange lock must be consumed and tested when SL-002 is implemented.
- [ ] Production evidence scanner, claim secret and approved retention period must be configured and smoke-tested by the deployment owner.

The three unchecked items are explicit external/cross-slice conditions; they do not authorize claiming a production payout test, production evidence pipeline, or SL-002 completion.
