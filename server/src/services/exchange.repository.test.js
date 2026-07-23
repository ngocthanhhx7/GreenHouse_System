const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createModelRepository } = require('./exchange.service');
const ExchangeUnitLineage = require('../models/exchangeUnitLineage.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ExchangeShipment = require('../models/exchangeShipment.model');

test('maps each inspected physical unit to exactly one matching Inventory movement', async () => {
  const originalFind = ExchangeUnitLineage.find;
  const originalFindByIdAndUpdate = ExchangeUnitLineage.findByIdAndUpdate;
  const updates = [];

  ExchangeUnitLineage.find = (filter) => {
    assert.deepEqual(filter, { exchangeCaseId: 'case-1', exchangeLineId: 'line-1' });
    return {
      sort(sort) {
        assert.deepEqual(sort, { originalUnitOrdinal: 1 });
        return {
          async lean() {
            return [
              { _id: 'unit-1', originalUnitOrdinal: 1 },
              { _id: 'unit-2', originalUnitOrdinal: 2 },
              { _id: 'unit-3', originalUnitOrdinal: 3 },
            ];
          },
        };
      },
    };
  };
  ExchangeUnitLineage.findByIdAndUpdate = async (id, update, options) => {
    updates.push({ id, update, options });
    return {};
  };

  try {
    const repository = createModelRepository();
    await repository.updateUnitsForInspection('case-1', 'line-1', {
      sellableQuantity: 1,
      damagedQuantity: 1,
      sellableMovementKey: 'sellable-movement',
      damagedMovementKey: 'damaged-movement',
    });

    assert.deepEqual(updates, [
      {
        id: 'unit-1',
        update: { $set: { outcome: 'Accepted', inventoryMovementKeys: ['sellable-movement'] } },
        options: { new: true, runValidators: true },
      },
      {
        id: 'unit-2',
        update: { $set: { outcome: 'Accepted', inventoryMovementKeys: ['damaged-movement'] } },
        options: { new: true, runValidators: true },
      },
      {
        id: 'unit-3',
        update: { $set: { outcome: 'Rejected', inventoryMovementKeys: [] } },
        options: { new: true, runValidators: true },
      },
    ]);
  } finally {
    ExchangeUnitLineage.find = originalFind;
    ExchangeUnitLineage.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('serializes Shipment outcomes through the Exchange case and claims only an InTransit Shipment', async () => {
  const originalCaseUpdate = ExchangeCase.findOneAndUpdate;
  const originalShipmentUpdate = ExchangeShipment.findOneAndUpdate;
  const calls = [];
  ExchangeCase.findOneAndUpdate = (filter, update, options) => {
    calls.push({ model: 'case', filter, update, options });
    return { async lean() { return { _id: 'case-1', shipmentOutcomeVersion: 4 }; } };
  };
  ExchangeShipment.findOneAndUpdate = (filter, update, options) => {
    calls.push({ model: 'shipment', filter, update, options });
    return { async lean() { return { _id: 'shipment-1', status: 'Delivered' }; } };
  };

  try {
    const repository = createModelRepository();
    await repository.touchShipmentOutcome('case-1', ['ReplacementShipped', 'DeliveryIncident']);
    await repository.claimShipmentOutcome('shipment-1', 'InTransit', {
      status: 'Delivered',
      deliveredAt: new Date('2026-07-23T10:00:00.000Z'),
    });
  } finally {
    ExchangeCase.findOneAndUpdate = originalCaseUpdate;
    ExchangeShipment.findOneAndUpdate = originalShipmentUpdate;
  }

  assert.deepEqual(calls, [
    {
      model: 'case',
      filter: {
        _id: 'case-1',
        status: { $in: ['ReplacementShipped', 'DeliveryIncident'] },
      },
      update: { $inc: { shipmentOutcomeVersion: 1 } },
      options: { new: true, runValidators: true },
    },
    {
      model: 'shipment',
      filter: { _id: 'shipment-1', status: 'InTransit' },
      update: {
        $set: {
          status: 'Delivered',
          deliveredAt: new Date('2026-07-23T10:00:00.000Z'),
        },
      },
      options: { new: true, runValidators: true },
    },
  ]);
});
