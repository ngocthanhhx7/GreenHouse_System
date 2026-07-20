# Return/Refund Reconciliation Boundary

## Owner boundaries

| Action | Allowed role | Reason |
| --- | --- | --- |
| Approve or reject a customer request | `Staff` | Staff validates policy, evidence, and eligible refund amount. Approval only moves the request to `AwaitingInspection`. |
| Inspect returned items | `WarehouseManager` | Warehouse records received, sellable, and damaged quantities. This action does not change inventory; it creates the hand-off for the warehouse inventory owner. |
| Complete a refund | `Staff` | Staff is the least-privileged existing operations role that owns payment reconciliation. Completion is accepted only from `ReadyForRefund`, after inspection. |

## State flow

`Pending` -> `AwaitingInspection` -> `ReadyForRefund` -> `Completed`

`Pending` -> `Rejected`

There is no route from approval directly to `Completed`, and no route mutates inventory during return inspection. Inventory transactions and restocking remain with the warehouse/inventory slice owned by Lê Vũ Cường.
