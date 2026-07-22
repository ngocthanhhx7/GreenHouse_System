const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('demo graph validator', () => {
  it('accepts the canonical fixture graph and returns its summary', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const result = validateDemoGraph(DEMO_GRAPH);
    assert.equal(result.valid, true);
    assert.equal(result.counts.orders, 22);
    assert.equal(result.counts.products, 20);
  });

  it('rejects duplicate stable natural identifiers', () => {
    const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const graph = cloneDemoGraph(DEMO_GRAPH);
    graph.products[1].sku = graph.products[0].sku;
    assert.throws(() => validateDemoGraph(graph), /products.*sku.*trùng/i);
  });

  it('rejects broken references and incorrect order totals', () => {
    const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const missingRef = cloneDemoGraph(DEMO_GRAPH);
    missingRef.orderDetails[0].productKey = 'product-khong-ton-tai';
    assert.throws(() => validateDemoGraph(missingRef), /productKey.*không tồn tại/i);

    const wrongTotal = cloneDemoGraph(DEMO_GRAPH);
    wrongTotal.orders[0].totalAmount += 1;
    assert.throws(() => validateDemoGraph(wrongTotal), /tổng tiền/i);
  });

  it('rejects service-incompatible state combinations', () => {
    const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const graph = cloneDemoGraph(DEMO_GRAPH);
    const delivered = graph.orders.find((order) => order.orderStatus === 'Delivered');
    delivered.paymentStatus = 'Pending';
    assert.throws(() => validateDemoGraph(graph), /Delivered.*Paid/i);
  });

  it('rejects reviews not backed by a delivered order detail', () => {
    const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const graph = cloneDemoGraph(DEMO_GRAPH);
    graph.reviews[0].productKey = 'product-20';
    assert.throws(() => validateDemoGraph(graph), /đánh giá.*Delivered/i);
  });

  it('rejects product image paths that drift from the locked asset manifest', () => {
    const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const graph = cloneDemoGraph(DEMO_GRAPH);
    graph.products[0].imageUrl = '/uploads/products/ffffffff-ffff-4fff-8fff-ffffffffffff.webp';
    assert.throws(() => validateDemoGraph(graph), /manifest ảnh/i);
  });
});
