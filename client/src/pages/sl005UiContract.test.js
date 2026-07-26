import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../components/layout/Sidebar.jsx', import.meta.url), 'utf8');
const inventorySource = readFileSync(new URL('./warehouse/InventoryListPage.jsx', import.meta.url), 'utf8');
const replenishmentSource = readFileSync(new URL('./warehouse/ReplenishmentPage.jsx', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('./admin/ReplenishmentAdminPage.jsx', import.meta.url), 'utf8');
const staffDamageSource = readFileSync(new URL('./staff/DamageReportsPage.jsx', import.meta.url), 'utf8');
const warehouseDamageSource = readFileSync(new URL('./warehouse/DamageReportsPage.jsx', import.meta.url), 'utf8');

describe('SL-005 inventory, damage, and replenishment UI contract', () => {
  it('gives Staff and Warehouse separate, role-protected damage workspaces', () => {
    assert.match(appSource, /path="staff\/damage-reports"/);
    assert.match(appSource, /path="warehouse\/damage-reports"/);
    assert.match(sidebarSource, /to: '\/staff\/damage-reports'/);
    assert.match(sidebarSource, /to: '\/warehouse\/damage-reports'/);
    assert.match(staffDamageSource, /createStaffReport/);
    assert.match(staffDamageSource, /listStaffReports/);
    assert.match(staffDamageSource, /withdrawStaffReport/);
    assert.match(staffDamageSource, /Trang trước/);
    assert.match(staffDamageSource, /Trang sau/);
    assert.match(staffDamageSource, /idempotencyKey/);
    assert.match(staffDamageSource, /result\.replay/);
    assert.match(warehouseDamageSource, /decideWarehouseReport/);
    assert.match(warehouseDamageSource, /confirmedQuantity/);
    assert.match(warehouseDamageSource, /decisionReason/);
  });

  it('makes count and threshold evidence explicit while showing the four inventory dimensions and reconciliation state', () => {
    assert.match(inventorySource, /sellableQuantity/);
    assert.match(inventorySource, /reservedQuantity/);
    assert.match(inventorySource, /quarantinedQuantity/);
    assert.match(inventorySource, /damagedQuantity/);
    assert.match(inventorySource, /inventoryHealth/);
    assert.match(inventorySource, /setThresholdOverride/);
    assert.match(inventorySource, /OperationalEvidenceUploader/);
    assert.match(inventorySource, /Lý do kiểm kê/);
    assert.match(inventorySource, /Lý do đổi ngưỡng/);
    assert.doesNotMatch(inventorySource, /Evidence reference|Count reason|Threshold reason/);
    assert.doesNotMatch(inventorySource, /Physical cycle count|warehouse-count/);
  });

  it('supports partial/rejected receipts, short closure, correction, and mandatory Admin decisions', () => {
    assert.match(replenishmentSource, /acceptedSellableQuantity/);
    assert.match(replenishmentSource, /rejectedQuantity/);
    assert.match(replenishmentSource, /requestShortClosure/);
    assert.match(replenishmentSource, /correctReceipt/);
    assert.match(adminSource, /decisionReason/);
    assert.match(adminSource, /decideShortClosure/);
    assert.match(adminSource, /request\.evidence/);
    assert.match(adminSource, /resolveMediaUrl/);
    assert.match(adminSource, /required/);
    assert.match(replenishmentSource, /OperationalEvidenceUploader/);
    assert.match(replenishmentSource, /\[`withdraw-\$\{request\.id\}`\]/);
    assert.match(replenishmentSource, /\[`short-\$\{request\.id\}`\]/);
    assert.match(replenishmentSource, /\[`correction-\$\{request\.id\}`\]/);
    assert.doesNotMatch(replenishmentSource, /Evidence reference|Receipt evidence reference|Short-closure evidence|Correction evidence reference/);
    assert.doesNotMatch(replenishmentSource, />Replenishment<|>Product<|>Status<|Warehouse actions|No replenishment requests|Loading replenishment requests/);
    assert.doesNotMatch(adminSource, /Replenishment decisions|Approve or reject|Admin decision reason|No Admin action available/);
    assert.doesNotMatch(replenishmentSource, /external-supplier|warehouse-delivery-inspection|Low stock replenishment/);
    assert.doesNotMatch(adminSource, /bởi quản trị viên/);
  });
});
