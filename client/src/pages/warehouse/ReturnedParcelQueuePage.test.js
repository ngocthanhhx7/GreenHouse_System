import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../../components/layout/Sidebar.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('./ReturnedParcelQueuePage.jsx', import.meta.url), 'utf8');

describe('Warehouse returned parcel queue contract', () => {
  it('routes only Warehouse to exact returned-parcel classification work', () => {
    assert.match(app, /warehouse\/returned-parcels/);
    assert.match(app, /allowedRoles=\{\['WarehouseManager'\]\}/);
    assert.match(sidebar, /\/warehouse\/returned-parcels/);
    assert.match(page, /listReturnedParcels/);
    assert.match(page, /recordReturnedParcelReceipt/);
  });

  it('classifies every physical line into sellable or damaged without finance controls', () => {
    assert.match(page, /receivedQuantity/);
    assert.match(page, /sellableQuantity/);
    assert.match(page, /damagedQuantity/);
    assert.match(page, /evidenceReference/);
    assert.match(page, /receivedAt/);
    assert.doesNotMatch(page, /refundAmount|payout|paymentStatus|destinationReference/i);
  });
});
