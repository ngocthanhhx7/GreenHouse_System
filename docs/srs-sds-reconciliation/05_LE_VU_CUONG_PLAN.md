# Plan - Lê Vũ Cường

## Owner

- Họ tên: Lê Vũ Cường
- Mã sinh viên: `HE187396`
- Email commit: `levucuong0319@gmail.com`
- Vai trò: Warehouse Inventory, Stock Export, Replenishment, Notification, Reports và System Settings owner.

## Goal

Đồng bộ warehouse/admin closure với SRS: reservation và stock export atomic, damage report có Warehouse confirmation, replenishment đúng Admin approval, notification idempotent và report dùng dữ liệu completed sale/refund chuẩn.

## Phạm vi discrepancy cần sửa

- SDS chưa có InventoryReservation, DamageReport, ReplenishmentItem và receipt lifecycle đầy đủ.
- SDS dùng low-stock quantity `< threshold`; SRS dùng AvailableQuantity `<= threshold`.
- SDS giao approve restock cho Warehouse Manager, SRS giao Admin.
- SDS chưa có notification retry/idempotency và report derivation rule.
- SystemSetting, AuditLog và report mới ở mức tên entity, chưa có detailed design.

## File cần kiểm tra/cập nhật ở phase triển khai

- `server/src/models/inventory.model.js`
- `server/src/models/inventoryTransaction.model.js`
- `server/src/models/stockExportRequest.model.js`
- `server/src/models/replenishmentRequest.model.js`
- `server/src/models/notification.model.js`
- `server/src/models/systemSetting.model.js`
- `server/src/services/inventory.service.js`
- `server/src/services/replenishment.service.js`
- `server/src/services/notification.service.js`
- `server/src/services/report.service.js`
- `server/src/services/systemSetting.service.js`
- `client/src/pages/warehouse/InventoryListPage.jsx`
- `client/src/pages/warehouse/StockExportQueuePage.jsx`
- `client/src/pages/warehouse/ReplenishmentPage.jsx`
- `client/src/pages/admin/ReplenishmentAdminPage.jsx`
- `client/src/pages/admin/AdminDashboardPage.jsx`
- `client/src/pages/admin/SystemSettingsPage.jsx`

## Chi tiết thực hiện

1. Chốt invariant: `AvailableQuantity = StockQuantity - ReservedQuantity`; mọi quantity là non-negative integer; reservation không vượt stock.
2. Stock export chỉ xử lý Confirmed order có reservation đầy đủ; complete atomic một lần và tạo đúng một OUT transaction.
3. Damage report do Staff tạo không đổi tồn; Warehouse confirm mới giảm sellable stock, tăng DamagedQuantity và tạo transaction.
4. Replenishment flow: Warehouse tạo `PendingApproval`, Admin approve/reject, Warehouse ghi nhận đúng một receipt đầy đủ; không cộng tồn khi approve.
5. Low-stock alert dùng `AvailableQuantity <= LowStockThreshold`, có refresh/clear state.
6. Notification phải có recipient, type, related target, delivery status, failure info và không tạo duplicate cùng business event.
7. Report dùng Delivered + Paid cho gross sales, Refund completed trong kỳ cho refund, net = gross - refund; không tính pending/cancelled.
8. System settings phải validate `PAYMENT_TIMEOUT_MINUTES`, `RETURN_WINDOW_DAYS`, low-stock threshold và audit thay đổi.
9. Cập nhật SDS schema/sequence/query cho inventory, stock export, replenishment, notification, report và settings.

## Acceptance checklist

- [ ] Stock export duplicate không trừ kho hai lần.
- [ ] Inventory transaction ghi before/after, actor, reason, related entity và timestamp.
- [ ] Admin là actor duyệt replenishment; Warehouse là actor receipt.
- [ ] Partial/excess/duplicate receipt bị từ chối.
- [ ] Email failure không rollback business operation và có retry evidence.
- [ ] Report không tính unpaid/cancelled/failed payment.
- [ ] Setting invalid không ghi đè giá trị hiện hành.

## Verification

```powershell
cd server
npm test -- --runInBand src/services/inventory.service.test.js src/services/replenishment.service.test.js src/services/notification.service.test.js src/services/report.service.test.js src/services/systemSetting.service.test.js
cd ..\client
npm test -- --runInBand src/services/inventoryService.test.js src/services/replenishmentService.test.js src/services/notificationService.test.js
npm run build
```

## Branch/commit

```text
feature/cuong-warehouse-admin-reconciliation
docs: align warehouse admin reconciliation scope
```
