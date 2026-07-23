const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('demo graph validator', () => {
  it('accepts the canonical fixture graph and returns its summary', () => {
    const { DEMO_GRAPH } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const result = validateDemoGraph(DEMO_GRAPH);
    assert.equal(result.valid, true);
    assert.equal(result.counts.orders, 22);
    assert.equal(result.counts.products, 15);
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
    const review = graph.reviews[0];
    review.productKey = graph.products.find((product) => !graph.orderDetails.some((detail) => detail.orderKey === review.orderKey && detail.productKey === product.key)).key;
    assert.throws(() => validateDemoGraph(graph), /đánh giá.*Delivered/i);
  });

  it('rejects product image paths that drift from the locked asset manifest', () => {
    const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
    const { validateDemoGraph } = require('./demoGraphValidator');
    const graph = cloneDemoGraph(DEMO_GRAPH);
    graph.products[0].imageUrl = '/uploads/products/ffffffff-ffff-4fff-8fff-ffffffffffff.webp';
    assert.throws(() => validateDemoGraph(graph), /manifest ảnh/i);
  });

  for (const [label, mutate, expected] of [
    ['COD callback', (graph) => { graph.paymentCallbacks[0].orderKey = 'order-01'; }, /callback.*ONLINE/i],
    ['callback lifecycle drift', (graph) => { const item = graph.paymentCallbacks.find((callback) => callback.eventStatus === 'Received'); item.processingResult = { accepted: true }; }, /callback.*Received/i],
    ['illegal warehouse reference', (graph) => { graph.inventoryTransactions.find((item) => item.transactionType === 'STOCK_EXPORT').relatedKey = 'stock-export-01'; }, /STOCK_EXPORT.*Exported/i],
    ['completed return mismatch', (graph) => {
      const request = graph.returnRequests.find((item) => item.status === 'Completed');
      const order = graph.orders.find((item) => item.key === request.orderKey);
      order.orderStatus = 'Delivered'; order.paymentStatus = 'Paid';
      graph.payments.find((item) => item.orderKey === order.key).paymentStatus = 'Paid';
      graph.paymentAttempts.find((item) => item.orderKey === order.key).paymentStatus = 'Paid';
    }, /Completed.*Returned/i],
    ['completed return actor missing', (graph) => { graph.returnRequests.find((item) => item.status === 'Completed').completedByKey = null; }, /Completed.*actor/i],
    ['product stock drift', (graph) => { graph.products[0].stockQuantity += 1; }, /tồn kho product/i],
    ['future timestamp', (graph) => { graph.auditLogs[0].timestamp = '2026-07-23T00:00:00.000Z'; }, /thời gian.*tương lai/i],
    ['invalid support actor', (graph) => { const item = graph.supportRequests.find((support) => support.status === 'New'); item.handledByKey = 'user-staff'; }, /support.*New/i],
    ['awaiting return without refund amount', (graph) => { graph.returnRequests.find((item) => item.status === 'AwaitingInspection').refundAmount = 0; }, /AwaitingInspection.*số tiền hoàn/i],
    ['unsupported durable refund state', (graph) => { graph.refundPendings[0].status = 'Refunded'; }, /RefundPending.*không khớp hand-off/i],
    ['missing low-stock scenarios', (graph) => { for (const inventory of graph.inventories) inventory.lowStockThreshold = 0; }, /ít nhất hai sản phẩm sắp hết/i],
    ['incomplete invoice detail snapshot', (graph) => { graph.invoices[0].orderDetailKeys.pop(); graph.invoices[0].items.pop(); }, /đầy đủ chính xác.*dòng hàng/i],
    ['invoice item drift', (graph) => { graph.invoices[0].items[0].subtotal += 1; }, /invoice item snapshot/i],
    ['unsupported damage state', (graph) => { graph.damageReports[0].status = 'Rejected'; }, /trạng thái không thể sinh/i],
    ['invalid notification target', (graph) => { graph.notifications[0].targetKey = 'support-khong-ton-tai'; }, /targetCollection\/targetKey/i],
    ['duplicate export ledger mapping', (graph) => {
      const startingByProduct = new Map(graph.products.map((product) => {
        const transactions = graph.inventoryTransactions
          .filter((item) => item.productKey === product.key)
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.key.localeCompare(right.key));
        return [product.key, transactions[0]?.beforeQuantity ?? graph.inventories.find((item) => item.productKey === product.key).stockQuantity];
      }));
      const transaction = graph.inventoryTransactions.find((item) => item.transactionType === 'STOCK_EXPORT');
      const sameRequest = graph.inventoryTransactions.find((item) => item.transactionType === 'STOCK_EXPORT' && item.relatedKey === transaction.relatedKey && item.key !== transaction.key);
      sameRequest.productKey = transaction.productKey;
      sameRequest.quantity = transaction.quantity;
      for (const product of graph.products) {
        let quantity = startingByProduct.get(product.key);
        const transactions = graph.inventoryTransactions
          .filter((item) => item.productKey === product.key)
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.key.localeCompare(right.key));
        for (const item of transactions) {
          item.beforeQuantity = quantity;
          item.afterQuantity = quantity + item.quantity;
          quantity = item.afterQuantity;
        }
        product.stockQuantity = quantity;
        graph.inventories.find((item) => item.productKey === product.key).stockQuantity = quantity;
      }
    }, /thiếu hoặc trùng STOCK_EXPORT/i],
  ]) {
    it(`rejects ${label}`, () => {
      const { DEMO_GRAPH, cloneDemoGraph } = require('./demoFixtures');
      const { validateDemoGraph } = require('./demoGraphValidator');
      const graph = cloneDemoGraph(DEMO_GRAPH);
      mutate(graph);
      assert.throws(() => validateDemoGraph(graph), expected);
    });
  }
});
