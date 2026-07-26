const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const mongoose = require('mongoose');

const { createModelRepository } = require('./inventoryExport.service');
const {
  cleanupDisposableMongo,
  resolveMongodBinary,
  startDisposableMongo,
} = require('../testUtils/disposableMongo');

const mongodBinary = resolveMongodBinary();

describe('exact export legacy Inventory persistence', {
  skip: mongodBinary ? false : 'Disposable MongoDB binary is unavailable',
}, () => {
  let mongo;

  before(async () => {
    mongo = await startDisposableMongo({ binary: mongodBinary });
    await mongoose.connect(`mongodb://127.0.0.1:${mongo.port}/export-legacy-test`, {
      autoCreate: false,
      autoIndex: false,
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await cleanupDisposableMongo(mongo);
  });

  it('captures coherent legacy stock but fails closed for reserved stock above derived sellable stock', async () => {
    const coherentProductId = new mongoose.Types.ObjectId();
    const inconsistentProductId = new mongoose.Types.ObjectId();
    const fractionalProductId = new mongoose.Types.ObjectId();
    const infiniteProductId = new mongoose.Types.ObjectId();
    const actorId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('inventories').insertMany([
      {
        productId: coherentProductId,
        stockQuantity: 10,
        reservedQuantity: 2,
      },
      {
        productId: inconsistentProductId,
        stockQuantity: 10,
        reservedQuantity: 12,
      },
      {
        productId: fractionalProductId,
        stockQuantity: 10.5,
        reservedQuantity: 2,
      },
      {
        productId: infiniteProductId,
        stockQuantity: Number.POSITIVE_INFINITY,
        reservedQuantity: 2,
      },
    ]);

    const repository = createModelRepository();
    const captured = await repository.captureReservation(coherentProductId, 2, actorId);
    const rejected = await repository.captureReservation(inconsistentProductId, 2, actorId);
    const fractional = await repository.captureReservation(fractionalProductId, 2, actorId);
    const infinite = await repository.captureReservation(infiniteProductId, 2, actorId);

    assert.equal(captured.stockQuantity, 8);
    assert.equal(captured.sellableQuantity, 8);
    assert.equal(captured.reservedQuantity, 0);
    assert.equal(captured.inventoryHealth, 'Normal');
    assert.equal(rejected, null);
    assert.equal(fractional, null);
    assert.equal(infinite, null);

    const inconsistent = await mongoose.connection.collection('inventories')
      .findOne({ productId: inconsistentProductId });
    assert.equal(inconsistent.stockQuantity, 10);
    assert.equal(inconsistent.reservedQuantity, 12);
    assert.equal(inconsistent.sellableQuantity, undefined);
    assert.equal(inconsistent.inventoryHealth, undefined);
    const infiniteInventory = await mongoose.connection.collection('inventories')
      .findOne({ productId: infiniteProductId });
    assert.equal(infiniteInventory.stockQuantity, Number.POSITIVE_INFINITY);
    assert.equal(infiniteInventory.reservedQuantity, 2);
    assert.equal(infiniteInventory.sellableQuantity, undefined);
    assert.equal(infiniteInventory.inventoryHealth, undefined);
  });
});
