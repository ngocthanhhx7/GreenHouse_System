# Warehouse/Admin Reconciliation - Le Vu Cuong

## Closed contracts

- Inventory exposes `stockQuantity`, `reservedQuantity`, `availableQuantity`, and `damagedQuantity`. `availableQuantity` is derived as `stockQuantity - reservedQuantity`; persisted quantities are non-negative integers and reservation cannot exceed stock.
- Stock export transitions `Approved -> Processing -> Exported` inside one MongoDB transaction. A conditional claim prevents a second export. Each order line conditionally captures its reservation while reducing stock and writes one `STOCK_EXPORT` transaction.
- Replenishment transitions `PendingApproval -> Approved|Rejected -> Receiving -> Received`. Admin approval never changes inventory. Receipt conditionally claims the approved request, accepts only the exact requested quantity, and writes one `REPLENISHMENT_RECEIVE` transaction.
- Low-stock is calculated from `availableQuantity <= lowStockThreshold` and is included in API response state for Warehouse pages.
- Warehouse business events call the existing notification service after the committed claim. Notification failures are swallowed so operational transactions remain durable. The business operation is idempotent; notification retry/delivery policy remains with the Notification owner contract.
- Revenue reports count only `Delivered + Paid` orders in the requested period. Refunds use only completed return/refund records in the requested period. Net sales equal gross sales minus refunds.
- System settings use canonical keys `PAYMENT_TIMEOUT_MINUTES`, `RETURN_WINDOW_DAYS`, and `LOW_STOCK_DEFAULT_THRESHOLD`; legacy camelCase request/response aliases remain compatible.

## Damage-report API contract

Staff creates a `PendingWarehouseConfirmation` record through `POST /api/staff/damage-reports` without mutating inventory. Warehouse Manager can list and inspect the queue, then confirm through `POST /api/warehouse/damage-reports/:id/confirm`. Confirmation conditionally claims the report, decreases sellable stock, increases `damagedQuantity`, and appends one related `DAMAGE_CONFIRMED` transaction in the same database transaction.

## Ownership boundary

Warehouse operations emit idempotent business events through the shared Notification service and do not roll back after a notification failure. Shared email delivery/retry and customer read/delete behavior remain owned by Nguyễn Ngọc Thành under the Account/Media/Notification/Address addendum.
