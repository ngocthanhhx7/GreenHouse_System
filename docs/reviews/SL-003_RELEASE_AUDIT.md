# SL-003 Release Audit

**Kết luận hiện tại:** `REMEDIATED — READY FOR REVIEW`

Audit ban đầu tại commit `5ef56cf` là docs-only và kết luận `BLOCKED`.
Nhánh closure đã bổ sung acceptance tests trước, sửa code/migration theo B1–B9,
chạy regression đầy đủ và giữ lại phần audit gốc bên dưới để truy vết quyết định.

## Remediation closure — 2026-07-24

| Blocker | Closure evidence |
|---|---|
| B0 | Có `SL-003_G3_TRACEABILITY.md`, `SL-003_HANDOFF.md` và release audit này. |
| B1 | Callback Failed/Cancelled chỉ đóng attempt; Order còn Pending cho retry/expiry. |
| B2 | Late/excess/paid-cancel obligation có `obligationKey` và standalone `ReturnRefundRequest` để đi qua destination/payout workflow. |
| B3 | `moneyObligationsSettled` được tính lại từ toàn bộ obligation bắt buộc. |
| B4 | Migration preflight identity indexes, chuẩn hóa Order/Payment, backfill reservation lineage và repeat-safe dependent repair. |
| B5 | `OrderReservation` sở hữu reservation theo Order + OrderDetail; release/consume dùng conditional claim. |
| B6 | Staff cancel fail-closed khi stock export đang Processing; export chỉ claim reservation chính xác. |
| B7 | Staff UI tạo stable command idempotency key và khóa nút trong lúc submit. |
| B8 | Checkout replay được resolve trước dependency mutable của saved address. |
| B9 | Durable `DomainOutbox` lưu post-commit audit/notification work; atomic lease/claim ngăn hai instance cùng phát và reclaim worker bị treo. |

Fresh verification:

- Server: **566/566 tests passed**, 93 suites.
- Client: **171/171 tests passed**, 49 suites.
- Production client build: **passed**; chỉ còn Vite chunk-size warning đã biết.
- Disposable MongoDB replica-set verification: active deadline/lineage backfill,
  expired Order/Payment/Attempt normalization, exact reservation release và
  inventory reconciliation đều passed; lần chạy thứ hai có **0 write**.
- Disposable `rs0` multi-worker verification: hai service instance chỉ có một
  claim thắng; stale Processing lease được reclaim và hoàn tất.
- `git diff --check`: không có whitespace error.

Review/deployment gates còn lại không chặn code review: actor browser walkthrough
trên môi trường staging và live payOS network/provider evidence.

## Hậu kiểm P1 Customer Order Center — 2026-07-25

P1 `canPay` đã đóng tại `f0b14b6`. Predicate phía client fail-closed khi thiếu
deadline, deadline không hợp lệ/đã hết hạn, payment state đã đóng, hoặc Order
không còn là `Pending` ONLINE; chỉ `Unpaid`, `Pending`, `Failed` với deadline
hợp lệ trong tương lai mới hiển thị thao tác thanh toán.

Bằng chứng focused: **12/12 tests passed** trong
`orderHistoryView.test.js`, `OrderHistoryPage.test.js` và
`orderService.test.js`. Đây không phải kết quả full regression và không thay
thế baseline closure ngày 2026-07-24.

## Phạm vi và bằng chứng

- Worktree audit: `D:\WW\GreenHouse_System\.worktrees\sl-003-audit`
- HEAD audited: `5ef56cf91fc670509d8a7bebeffad30bef6cfcd9`
- SL-002 merge-base: `79c3bf3828cb0d879bc9c9c541e2167d5da53ecd`
- Worktree sạch trước khi tạo report.
- Diff base → HEAD: 136 files, `+11,172/-726`; phạm vi còn chứa thay đổi CI, SL-001 và SL-002, nên cần giữ scope gate rõ khi remediation.
- Hai artifact release được yêu cầu nhưng **không tồn tại**:
  - `docs/reviews/SL-003_G3_TRACEABILITY.md`
  - `docs/reviews/SL-003_HANDOFF.md`
- Spec vẫn ghi rõ G3 chỉ `ready`, chưa `passed`; G4/G5/G6/G7 chưa bắt đầu (`CR-001` lines 274–278), và “exact G3 interface/code/test mapping” phải có trước G4 red tests (`CR-001` lines 243, 282; SL-003 design lines 220–231, 261).

## Release blockers

| ID / mức | Bằng chứng code và requirement | Tác động | Test-first remediation |
|---|---|---|---|
| **B0 P0** — gate artifact thiếu | Không có `SL-003_G3_TRACEABILITY.md` hoặc `SL-003_HANDOFF.md`. Spec chỉ có preliminary matrix (SL-003 design lines 220–231; CR-001 lines 229–243). | Không có mapping có thể kiểm toán từ BR/AT → API/model/service/UI → red test → release evidence; không thể chứng minh G3/G7 closure. | Tạo matrix/handoff trước: mỗi AT-040…058 và CR AT-215…217 phải có contract, file/line, red test, evidence và residual risk; ghi owner/order remediation. |
| **B1 P0** — failure callback làm sai Order state và bỏ qua deadline | `payment.service.js:503–569` ghi `nextStatus` vào cả Payment/Order, dù AF-003-04 yêu cầu “mark that attempt Failed … Order and reservation remain” (spec lines 159, 174–176). `orderPaymentExpiry.service.js:33–53` chỉ quét/claim `paymentStatus: 'Pending'`. UI chỉ hiện link trả tiền ở `OrderDetailPage.jsx:295–297` khi Order là Pending. | Attempt Failed/Cancelled trước deadline có thể làm Order `Failed/Cancelled` ở projection; retry/expiry không còn cùng state machine, reservation có thể bị giữ vô hạn. Vi phạm AT-045, AT-048 và invariant Order pre-confirmation. | Viết red tests: callback Failed/Cancelled chỉ terminalize attempt; retry tạo attempt mới và giữ lịch sử; deadline sau failed attempt vẫn cancel/release đúng một lần; UI retry trước deadline và ẩn sau cancel/deadline. Sau đó sửa projection/worker/UI. |
| **B2 P0** — late/excess refund không có case/destination/payout path | PayOS callback tạo `RefundPending` không có `returnRefundRequestId` ở `payment.service.js:404–445, 475–489`. Các payout/destination routes đều bắt buộc `:id` của `ReturnRefundRequest` (`server/src/routes/returnRefund.routes.js:8–25`), còn `findRequestRefundObligation` chỉ tìm obligation gắn request (`returnRefund.service.js:629–635`). Staff cancellation cũng chỉ gọi `buildRefundHandoff` (`staffOrder.service.js:220–233, 391–393`). | Late payment, duplicate payment và Staff-paid-cancel có record nhưng không có secure destination form, payout command hay actionable customer/staff case. AT-050, AT-053–055 và CR AT-215–217 chưa đóng. | Red integration test cho: paid cancel, late paid callback, second successful transaction, Staff paid cancel; mỗi trigger phải tạo một case/obligation có source event, destination workflow, payout evidence và replay identity; Customer/Staff list/detail phải thấy case. |
| **B3 P0** — aggregate settlement bị set `true` quá sớm | `returnRefund.service.js:638–674`, cụ thể `:666–672`, set `moneyObligationsSettled: true` sau **một** payout. CR BR-115/AT-216 yêu cầu false khi bất kỳ obligation nào còn non-terminal. | Hoàn tất một refund trong order có cancellation + excess/late/COD obligation có thể báo đã thanh toán hết tiền dù obligation khác còn mở. | Red test tạo ≥2 RefundPending khác obligationKey, complete một obligation, assert aggregate vẫn false; chỉ true khi repository query thấy mọi obligation terminal; duplicate completion không đổi aggregate. |
| **B4 P0** — migration không đưa dữ liệu legacy về invariant mới | `migrateSl003OrderPaymentCancellation.js:41–47` chỉ đổi `WaitingForPayment→Pending`, `Expired→Cancelled`; test còn xác nhận `Expired` payment `Failed` giữ nguyên (`migrate...test.js:168–172`). Script chỉ đảm bảo stock-export index (`:128–168`), không kiểm tra/tạo checkout idempotency, pending PayOS/provider-order-code, refund obligation indexes hoặc legacy refund/payment states. | Expired orders có thể còn reservation, Payment/Attempt không nhất quán; duplicate legacy data sẽ làm unique indexes fail hoặc tạo nghĩa vụ không truy hồi được. “Repeat-safe” hiện chỉ là không ghi lần hai, chưa phải business-safe. | Red migration fixture đầy đủ Order/Detail/Inventory/Payment/Attempt/Refund: preflight toàn bộ duplicate/index/state, transaction per order; Expired phải release đúng once, retire attempt/link, set projections/audit intent; dry-run không ghi; rerun zero writes và zero residual violations. |
| **B5 P0** — reservation không có lineage theo Order | Checkout reserve/release chỉ tăng/giảm counter aggregate (`order.service.js:218–246`); Staff “exact” chỉ kiểm tra `inventory.reservedQuantity >= quantity` (`staffOrder.service.js:203–217`). Không có reservation identity gắn Order/OrderDetail. | Hai order cùng SKU có thể dùng lẫn reserved counter; cancel/confirm order A có thể release/claim phần của B. Không chứng minh được “exact reservation” của AT-040/045/049/051/058. | Red concurrency/invariant test với hai order cùng SKU, release/corrupt một order rồi confirm/cancel order còn lại; assert reservation ownership and exactly-once release. Thêm Order-scoped reservation ledger/identity và migrate/reconcile counter từ ledger. |
| **B6 P1** — Staff cancel race để lại export `Processing` | Open request lookup gồm `Pending/Approved/Processing` (`staffOrder.service.js:150–154`), nhưng cancel update chỉ đổi `Pending/Approved` (`:156–161`). Cancel order vẫn tiếp tục release reservation (`:384–399`). | Có thể có Order `Cancelled` + reservation released nhưng StockExportRequest vẫn `Processing`; downstream Warehouse có thể xuất hàng cho order đã hủy. Vi phạm BR-028/AT-051/052. | Red race test: Processing export + Staff cancel phải atomic reject hoặc cancel/stop downstream request; assert no orphan open export and no release on rejected transition. |
| **B7 P1** — Staff UI không gửi idempotency và không khóa submit | `StaffOrderDetailPage.jsx:26–35` không có submitting lock; confirm/cancel gọi service không có key (`:59, :115`). `staffOrderService.js:35–37, 54–56` chỉ gửi header khi input có key. | Double-click trả 409 hoặc tạo kết quả không replay rõ ràng; AT-056/058 và BR-033 chưa được đảm bảo ở actor surface dù service test có nhánh key. | Red browser/component test double-click confirm/cancel; assert one command key, disabled pending button, replayed result/message. Service/API nên require/derive stable key theo command instance, UI truyền key. |
| **B8 P1** — checkout replay phụ thuộc resource mutable | `order.service.js:532–564` resolve `savedAddressId` trước khi `loadExisting`; hash chỉ chứa ID (`:141–165`). Nếu saved address bị sửa/xóa sau checkout, cùng completed key có thể 404 trước khi replay, trái AT-042. | Retry sau mạng chập chờn không trả Order đã commit; khách có thể tưởng checkout thất bại và tạo key mới. | Red test: checkout với saved address, mutate/delete address/cart, replay cùng key trả đúng Order; cùng key với facts khác vẫn 409. Replay lookup phải xảy ra trước dependency resolution hoặc hash/command identity phải tách khỏi immutable snapshot. |
| **B9 P1** — audit/notification sau commit không có retry work item | Expiry commit xong rồi `await auditLogger.log`/`notificationPublisher.publish` trực tiếp (`orderPaymentExpiry.service.js:156–170`); worker chỉ catch/log (`orderPaymentExpiry.worker.js:9–19`). Customer cancel cũng gọi audit trực tiếp sau commit (`order.service.js:825–831`). | Side-effect lỗi trả lỗi sau khi state đã commit; candidate query chỉ còn Pending nên lần chạy sau không thấy lại. Vi phạm AF-003-15/AT-057 và audit traceability. | Red test inject audit/notification failure after commit, rerun worker/command, assert exactly one business transition plus retried outbox/audit. Persist durable post-commit event/outbox in transaction and consume idempotently. |

## Actor/RBAC and PayOS review

Các boundary chính hiện có bằng chứng tích cực:

- Payment-link route yêu cầu Customer; PayOS webhook là public nhưng signature middleware; route tests pass.
- Staff order/refund routes yêu cầu `Staff`; Customer cancellation/destination dùng owner check; Warehouse endpoints tách role.
- Webhook kiểm tra secret/signature, order code, amount và provider identity; callback event có unique provider/message identity và lease/retry handling.
- `createPayOSGateway` dùng official SDK surface và payout idempotency key; link expiry được bind vào immutable Order deadline.

Các điểm tích cực trên không bù được B1–B3: signature/idempotency của provider chỉ bảo vệ callback/provider call, không tự tạo refund case, destination workflow hay aggregate settlement. Actor acceptance cũng chưa có walkthrough artifact; CR G6 vẫn `not-started`.

## Acceptance coverage snapshot

| Acceptance | Audit status | Ghi chú |
|---|---|---|
| AT-040/041 | Partial | Checkout transaction/rollback unit tests pass; chưa có reservation lineage (B5). |
| AT-042 | Partial/Fail edge | Happy replay pass; saved-address mutation/deletion replay fail (B8). |
| AT-043/044 | Covered | Model/deadline tests pass. |
| AT-045 | Fail edge | Pending happy path pass; Failed/Cancelled attempt no longer reaches expiry (B1). |
| AT-046/047 | Covered/Partial | Signature/provider matching and browser provisional behavior have tests; no full actor walkthrough. |
| AT-048 | Fail edge | New attempt path exists, nhưng callback projection/UI/deadline combination violates retry invariant (B1). |
| AT-049/050 | Partial | Customer cancellation happy path pass; Staff paid handoff and actionable late/excess cases fail (B2). |
| AT-051/052 | Fail edge | Processing export race leaves orphan request (B6); completed export guard passes. |
| AT-053/054/055 | Fail | Standalone late/excess obligations lack request/destination/payout path (B2). |
| AT-056 | Partial/Fail | Service idempotency tests pass with supplied key; Staff UI does not supply/lock key (B7), migration/side-effect replay gaps remain. |
| AT-057 | Partial/Fail | RBAC tests pass; notification/audit retry after committed expiry/cancel is missing (B9). |
| AT-058 | Partial/Fail | Atomic confirm happy path pass; aggregate reservation ownership and UI replay gaps remain (B5, B7). |
| CR AT-215 | Partial | Distinct `RefundPending` records are created; no actionable case for late/excess flows (B2). |
| CR AT-216 | Fail | One payout unconditionally sets aggregate settled (`returnRefund.service.js:666–672`, B3). |
| CR AT-217 | Partial | Callback/event dedupe exists; payout/refund case replay cannot cover standalone obligations (B2). |

## Tests executed fresh

From this audited HEAD:

- `server`: full `npm test` — **529 passed, 0 failed**.
- Targeted server SL-003/model/route set — **125 passed, 0 failed** (123 service/model/migration/config + 2 route tests).
- `client`: targeted checkout/order/staff service/UI tests — **18 passed, 0 failed**.
- `client`: `npm run build` — **success**; Vite emitted only the existing chunk-size warning (>500 kB).

Green tests therefore confirm the implemented happy paths and security contracts, but the missing red tests listed above explain why the release is not ready.

## Historical verdict and remediation order

1. **BLOCK release now.** Add the missing G3 traceability and handoff artifacts; mark every known gap with owner and evidence requirement.
2. Add the red tests for B1–B9 (especially cross-order reservation, two-obligation aggregate, standalone refund lifecycle, migration preflight/repeat, and Staff double-click).
3. Implement the smallest coherent domain/model/migration fixes until those tests pass.
4. Add actor walkthrough evidence (Customer, Staff/CSKH, Warehouse, Admin, Carrier/payOS) and post-commit outbox retry evidence.
5. Re-run full server/client suites plus release smoke checks; only then reassess G3→G4→G6→G7.

**Historical release decision at `5ef56cf`: `NOT READY`; audit status: `SUPERSEDED BY REMEDIATION CLOSURE ABOVE`.**
