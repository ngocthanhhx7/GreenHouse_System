const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createPaymentService } = require('./payment.service');

function createPaymentRepository() {
  const orders = [
    {
      _id: 'order-online',
      customerId: 'customer-1',
      orderCode: 'ORD-ONLINE',
      totalAmount: 50,
      paymentMethod: 'ONLINE',
      paymentStatus: 'Pending',
      orderStatus: 'WaitingForPayment',
    },
  ];
  const payments = [
    {
      _id: 'payment-1',
      orderId: 'order-online',
      paymentMethod: 'ONLINE',
      amount: 50,
      paymentStatus: 'Pending',
      transactionId: '',
    },
  ];

  return {
    orders,
    payments,
    async findOrderById(id) {
      return orders.find((order) => order._id === id) || null;
    },
    async findPaymentByOrder(id) {
      return payments.find((payment) => payment.orderId === id) || null;
    },
    async updatePayment(id, data) {
      const payment = payments.find((entry) => entry._id === id);
      Object.assign(payment, data);
      return payment;
    },
    async updateOrder(id, data) {
      const order = orders.find((entry) => entry._id === id);
      Object.assign(order, data);
      return order;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

function createNotificationService() {
  const notifications = [];
  return {
    notifications,
    async notifyPaymentStatus(input) {
      notifications.push(input);
    },
  };
}

describe('payment service', () => {
  let paymentRepository;
  let auditLogger;
  let notificationService;
  let paymentService;

  beforeEach(() => {
    paymentRepository = createPaymentRepository();
    auditLogger = createAuditLogger();
    notificationService = createNotificationService();
    paymentService = createPaymentService({
      paymentRepository,
      auditLogger,
      notificationService,
    });
  });

  it('creates an online payment request for a waiting order', async () => {
    const result = await paymentService.createOnlinePaymentRequest('customer-1', 'order-online');

    assert.equal(result.orderId, 'order-online');
    assert.equal(result.amount, 50);
    assert.equal(result.paymentStatus, 'Pending');
    assert.match(result.mockPaymentUrl, /payments\/mock/);
  });

  it('marks order and payment paid when callback succeeds', async () => {
    const result = await paymentService.handlePaymentCallback({
      orderId: 'order-online',
      transactionId: 'TXN-1',
      amount: 50,
      status: 'Paid',
    });

    assert.equal(result.paymentStatus, 'Paid');
    assert.equal(paymentRepository.orders[0].paymentStatus, 'Paid');
    assert.equal(paymentRepository.orders[0].orderStatus, 'Pending');
    assert.equal(auditLogger.entries[0].action, 'PAYMENT_CALLBACK_PAID');
    assert.equal(notificationService.notifications[0].paymentStatus, 'Paid');
  });

  it('rejects callback amount mismatch', async () => {
    await assert.rejects(
      () =>
        paymentService.handlePaymentCallback({
          orderId: 'order-online',
          transactionId: 'TXN-2',
          amount: 51,
          status: 'Paid',
        }),
      /Payment amount does not match order total/
    );
  });
});
