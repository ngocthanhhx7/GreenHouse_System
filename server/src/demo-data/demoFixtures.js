const { DEMO_IMAGE_MANIFEST } = require('./demoImageManifest');

const BASE_DATE = Date.parse('2026-06-01T02:00:00.000Z');
const day = (offset) => new Date(BASE_DATE + offset * 86400000).toISOString();
const hour = (offset) => new Date(BASE_DATE + offset * 3600000).toISOString();
const two = (value) => String(value).padStart(2, '0');

const roles = [
  { key: 'role-customer', roleName: 'Customer', description: 'Khách hàng mua sắm và theo dõi đơn hàng.' },
  { key: 'role-staff', roleName: 'Staff', description: 'Nhân viên xử lý đơn hàng, hỗ trợ và đổi trả.' },
  { key: 'role-warehouse', roleName: 'WarehouseManager', description: 'Quản lý tồn kho, xuất kho và bổ sung hàng.' },
  { key: 'role-admin', roleName: 'Admin', description: 'Quản trị hệ thống, danh mục và báo cáo.' },
];

const customerNames = [
  'Nguyễn Minh Anh', 'Trần Gia Hân', 'Lê Hoàng Nam', 'Phạm Thuỳ Linh', 'Võ Quốc Bảo',
  'Đặng Ngọc Mai', 'Bùi Đức Anh', 'Đỗ Khánh Vy', 'Huỳnh Thanh Tùng', 'Ngô Bảo Trâm',
];

const users = [
  { key: 'user-admin', roleName: 'Admin', fullName: 'Nguyễn Ngọc Thành', email: 'admin@greenhome.test', phone: '0901000001', address: 'Văn phòng GreenHome, Hà Nội' },
  { key: 'user-staff', roleName: 'Staff', fullName: 'Nguyễn Hữu Anh Nhật', email: 'staff@greenhome.test', phone: '0901000002', address: 'Trung tâm vận hành GreenHome, Hà Nội' },
  { key: 'user-warehouse', roleName: 'WarehouseManager', fullName: 'Lê Vũ Cường', email: 'warehouse@greenhome.test', phone: '0901000003', address: 'Kho GreenHome, Long Biên, Hà Nội' },
  ...customerNames.map((fullName, index) => ({
    key: `user-customer-${two(index + 1)}`,
    roleName: 'Customer',
    fullName,
    email: `customer${two(index + 1)}@greenhome.test`,
    phone: `09120000${two(index + 1)}`,
    address: `${index + 12} phố Xanh, Hà Nội`,
  })),
];

const provinces = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ'];
const addresses = customerNames.flatMap((fullName, index) => [
  {
    key: `address-${two(index + 1)}-home`, customerKey: `user-customer-${two(index + 1)}`, label: 'Nhà riêng',
    receiverName: fullName, phoneNumber: `09120000${two(index + 1)}`, province: provinces[index % provinces.length],
    district: `Quận ${index + 1}`, ward: `Phường Xanh ${index + 1}`, addressLine: `${12 + index} đường Bếp Việt`, isDefault: true,
  },
  {
    key: `address-${two(index + 1)}-office`, customerKey: `user-customer-${two(index + 1)}`, label: 'Văn phòng',
    receiverName: fullName, phoneNumber: `09120000${two(index + 1)}`, province: provinces[index % provinces.length],
    district: `Quận ${index + 1}`, ward: `Phường Mộc ${index + 1}`, addressLine: `${101 + index} đường Sống Xanh`, isDefault: false,
  },
]);

const categories = [
  { key: 'category-cookware', name: 'Nồi chảo', description: 'Nồi, chảo bền đẹp và an toàn cho căn bếp gia đình Việt.' },
  { key: 'category-tableware', name: 'Bàn ăn và phục vụ', description: 'Đồ dùng bàn ăn thủ công, hài hòa và tiện dụng.' },
  { key: 'category-preparation', name: 'Dụng cụ sơ chế', description: 'Dao, thớt và dụng cụ chuẩn bị thực phẩm chính xác.' },
  { key: 'category-cleaning', name: 'Vệ sinh nhà bếp', description: 'Giải pháp vệ sinh có nguồn gốc lành tính và bền vững.' },
  { key: 'category-storage', name: 'Lưu trữ thông minh', description: 'Sắp xếp thực phẩm và dụng cụ gọn gàng, khoa học.' },
];

const productSource = [
  ['Nồi gang tráng men Forest Green 24cm', 'GH-NC-001', 'category-cookware', 2450000, 'cái', 'Nồi gang giữ nhiệt lâu, màu xanh rừng sang trọng cho món hầm gia đình.'],
  ['Chảo gang sâu lòng 28cm', 'GH-NC-002', 'category-cookware', 1290000, 'cái', 'Chảo gang lòng sâu truyền nhiệt đều, phù hợp chiên xào và áp chảo.'],
  ['Chảo gốm chống dính 26cm', 'GH-NC-003', 'category-cookware', 849000, 'cái', 'Bề mặt phủ gốm chống dính lành tính, nhẹ tay và dễ vệ sinh mỗi ngày.'],
  ['Nồi inox ba đáy 20cm', 'GH-NC-004', 'category-cookware', 1150000, 'cái', 'Nồi inox ba đáy bắt nhiệt nhanh, dùng tốt trên bếp từ và bếp gas.'],
  ['Bộ bát đĩa gốm Mộc 12 món', 'GH-BA-001', 'category-tableware', 1250000, 'bộ', 'Bộ gốm thủ công tông kem mộc, đủ dùng cho bàn ăn gia đình bốn người.'],
  ['Bộ đĩa gốm Earth Tone 4 món', 'GH-BA-002', 'category-tableware', 850000, 'bộ', 'Bốn đĩa gốm men lì sắc đất, tạo điểm nhấn ấm áp cho mỗi bữa ăn.'],
  ['Bộ ly thủy tinh borosilicate 6 chiếc', 'GH-BA-003', 'category-tableware', 450000, 'bộ', 'Ly thủy tinh chịu nhiệt trong sáng, thành mỏng nhưng bền và dễ cầm.'],
  ['Bộ dao nĩa inox 16 món', 'GH-BA-004', 'category-tableware', 980000, 'bộ', 'Dao nĩa inox hoàn thiện mờ, cân bằng tốt cho bốn phần ăn tiêu chuẩn.'],
  ['Thớt gỗ Acacia nguyên khối', 'GH-SC-001', 'category-preparation', 450000, 'cái', 'Thớt Acacia vân gỗ tự nhiên, bề mặt rộng và có rãnh hứng nước tiện lợi.'],
  ['Dao bếp Damascus cán Walnut', 'GH-SC-002', 'category-preparation', 2850000, 'cái', 'Dao Damascus sắc bền với cán Walnut vừa tay, dành cho thao tác cắt chính xác.'],
  ['Bộ muỗng gỗ Walnut 5 món', 'GH-SC-003', 'category-preparation', 450000, 'bộ', 'Năm dụng cụ gỗ Walnut mịn, không làm xước nồi chảo và chịu nhiệt tốt.'],
  ['Kéo bếp đa năng tháo rời', 'GH-SC-004', 'category-preparation', 320000, 'cái', 'Kéo bếp lưỡi inox tháo rời để vệ sinh, tích hợp mở nắp và kẹp hạt.'],
  ['Nước rửa chén sinh học 500ml', 'GH-VS-001', 'category-cleaning', 79000, 'chai', 'Công thức nguồn gốc thực vật làm sạch dầu mỡ và dịu nhẹ với da tay.'],
  ['Khăn lau bếp linen organic 2 chiếc', 'GH-VS-002', 'category-cleaning', 320000, 'bộ', 'Khăn linen hữu cơ thấm hút tốt, nhanh khô và bền màu qua nhiều lần giặt.'],
  ['Bàn chải xơ dừa cán tre', 'GH-VS-003', 'category-cleaning', 95000, 'cái', 'Sợi xơ dừa chắc vừa đủ để làm sạch mà không làm xước bề mặt dụng cụ.'],
  ['Bộ khăn lau bếp sợi tre 4 chiếc', 'GH-VS-004', 'category-cleaning', 185000, 'bộ', 'Khăn sợi tre mềm, kháng mùi tự nhiên và phù hợp lau dọn hằng ngày.'],
  ['Bộ hũ gia vị thủy tinh 6 lọ', 'GH-LT-001', 'category-storage', 320000, 'bộ', 'Sáu hũ gia vị đồng bộ, nắp kín và nhãn trống để tổ chức kệ bếp.'],
  ['Hũ thủy tinh nắp kín 1L', 'GH-LT-002', 'category-storage', 150000, 'hũ', 'Hũ thủy tinh dày với gioăng kín khí, bảo quản ngũ cốc và thực phẩm khô.'],
  ['Bộ hộp thủy tinh chịu nhiệt 5 món', 'GH-LT-003', 'category-storage', 690000, 'bộ', 'Hộp thủy tinh chịu nhiệt xếp gọn, dùng được trong tủ lạnh và lò vi sóng.'],
  ['Kệ tre lưu trữ ba tầng', 'GH-LT-004', 'category-storage', 890000, 'cái', 'Kệ tre ba tầng chắc chắn giúp tận dụng chiều cao và giữ căn bếp gọn gàng.'],
];

const selectedProductSource = productSource.filter((_, index) => index % 4 < 3);
const imageBySku = new Map(DEMO_IMAGE_MANIFEST.map((image) => [image.sku, image]));
const products = selectedProductSource.map(([name, sku, categoryKey, price, unit, shortDescription], index) => ({
  key: `product-${two(index + 1)}`, name, sku, categoryKey, price, unit, shortDescription,
  description: `${shortDescription} Sản phẩm được tuyển chọn theo tiêu chuẩn GreenHome, ưu tiên vật liệu an toàn, độ bền lâu dài và thiết kế tối giản phù hợp với nhịp sống của gia đình Việt hiện đại. Hướng dẫn sử dụng và bảo quản được cung cấp rõ ràng để duy trì chất lượng tốt nhất.`,
  currency: 'VND', status: 'Active', imageUrl: imageBySku.get(sku).destination, stockQuantity: 0,
}));

const inventories = products.map((product, index) => ({
  key: `inventory-${two(index + 1)}`, productKey: product.key, stockQuantity: 0,
  reservedQuantity: 0, damagedQuantity: 0, lowStockThreshold: 5, lastUpdatedByKey: 'user-warehouse',
}));

const carts = Array.from({ length: 12 }, (_, index) => ({
  key: `cart-${two(index + 1)}`, customerKey: `user-customer-${two((index % 10) + 1)}`, status: index < 10 ? 'Active' : 'CheckedOut',
  createdAt: day(index + 1),
}));
const cartItems = Array.from({ length: 20 }, (_, index) => ({
  key: `cart-item-${two(index + 1)}`, cartKey: `cart-${two((index % 10) + 1)}`, productKey: `product-${two((index % products.length) + 1)}`,
  productName: products[index % products.length].name, quantity: (index % 3) + 1, unitPrice: products[index % products.length].price,
}));

const orderStates = [
  ['Pending', 'Unpaid', 'COD'], ['WaitingForPayment', 'Pending', 'ONLINE'], ['Pending', 'Paid', 'ONLINE'],
  ['Confirmed', 'Paid', 'ONLINE'], ['Confirmed', 'Unpaid', 'COD'], ['StockExportRequested', 'Paid', 'ONLINE'],
  ['StockExportRequested', 'Unpaid', 'COD'], ['Packed', 'Paid', 'ONLINE'], ['Packed', 'Unpaid', 'COD'],
  ['Shipped', 'Paid', 'ONLINE'], ['Delivered', 'Paid', 'COD'], ['Delivered', 'Paid', 'ONLINE'],
  ...Array.from({ length: 6 }, () => ['Delivered', 'Paid', 'COD']),
  ['Returned', 'Refunded', 'ONLINE'], ['Cancelled', 'Unpaid', 'COD'], ['Cancelled', 'RefundPending', 'ONLINE'],
  ['Expired', 'Failed', 'ONLINE'],
];

const orders = [];
const orderDetails = [];
for (let index = 0; index < 22; index += 1) {
  const orderKey = `order-${two(index + 1)}`;
  const customerNumber = (index % 10) + 1;
  const [orderStatus] = orderStates[index];
  const reservesInventory = ['Pending', 'WaitingForPayment', 'Confirmed', 'StockExportRequested'].includes(orderStatus);
  const orderProductPool = reservesInventory ? products.slice(0, -2) : products;
  const lineProducts = [
    orderProductPool[(index * 2) % orderProductPool.length],
    orderProductPool[(index * 2 + 1) % orderProductPool.length],
  ];
  const lines = lineProducts.map((product, lineIndex) => {
    const quantity = lineIndex + 1;
    return {
      key: `order-detail-${two(index + 1)}-${lineIndex + 1}`, orderKey, productKey: product.key,
      productNameSnapshot: product.name, productSkuSnapshot: product.sku, productImageSnapshot: product.imageUrl,
      unitSnapshot: product.unit, priceSnapshot: product.price, quantity, subtotal: product.price * quantity,
    };
  });
  orderDetails.push(...lines);
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const [, paymentStatus, paymentMethod] = orderStates[index];
  orders.push({
    key: orderKey, orderCode: `GH-DEMO-20${two(index + 1)}`, customerKey: `user-customer-${two(customerNumber)}`,
    idempotencyKey: `demo-checkout-${two(index + 1)}`, subtotal, shippingFee: 30000, totalAmount: subtotal + 30000,
    currency: 'VND', paymentMethod, paymentStatus, orderStatus,
    receiverName: customerNames[customerNumber - 1], receiverPhone: `09120000${two(customerNumber)}`,
    shippingAddress: `${12 + customerNumber} đường Bếp Việt, ${provinces[(customerNumber - 1) % provinces.length]}`,
    cancelReason: orderStatus === 'Cancelled' ? (paymentStatus === 'RefundPending' ? 'Khách đổi nhu cầu sau khi đã thanh toán.' : 'Khách chủ động hủy trước khi xuất kho.') : orderStatus === 'Expired' ? 'Phiên thanh toán đã hết hạn.' : '',
    createdAt: day(index * 2), confirmedAt: ['Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered', 'Returned'].includes(orderStatus) ? day(index * 2 + 1) : null,
    packedAt: ['Packed', 'Shipped', 'Delivered', 'Returned'].includes(orderStatus) ? day(index * 2 + 2) : null,
    shippedAt: ['Shipped', 'Delivered', 'Returned'].includes(orderStatus) ? day(index * 2 + 3) : null,
    deliveredAt: ['Delivered', 'Returned'].includes(orderStatus) ? day(index * 2 + 4) : null,
  });
}

const payments = orders.map((order, index) => ({
  key: `payment-${two(index + 1)}`, orderKey: order.key, transactionId: order.paymentMethod === 'ONLINE' ? `GH-TXN-20${two(index + 1)}` : '',
  paymentMethod: order.paymentMethod, paymentProvider: order.paymentMethod === 'ONLINE' ? 'GreenPayDemo' : 'COD', amount: order.totalAmount,
  currency: 'VND', paymentStatus: order.paymentStatus, paidAt: ['Paid', 'RefundPending', 'Refunded'].includes(order.paymentStatus) ? day(index * 2 + 1) : null,
}));
const paymentAttempts = payments.map((payment, index) => ({
  key: `payment-attempt-${two(index + 1)}`, attemptCode: `PAY-DEMO-20${two(index + 1)}`, orderKey: payment.orderKey,
  paymentMethod: payment.paymentMethod, paymentProvider: payment.paymentProvider, amount: payment.amount, currency: 'VND',
  paymentStatus: payment.paymentStatus, transactionId: payment.transactionId, paidAt: payment.paidAt,
}));
const callbackOrderNumbers = [2, 3, 4, 6, 8, 10, 12, 19, 21, 22];
const paymentCallbacks = callbackOrderNumbers.map((number, index) => {
  const order = orders[number - 1];
  const isReceivedOnly = order.paymentStatus === 'Pending';
  const gatewayStatus = order.paymentStatus === 'Failed' ? 'Failed' : 'Paid';
  return {
    key: `payment-callback-${two(index + 1)}`, orderKey: `order-${two(number)}`, paymentAttemptKey: `payment-attempt-${two(number)}`,
    paymentProvider: 'GreenPayDemo', providerMessageId: `greenpay-message-${two(index + 1)}`,
    eventStatus: isReceivedOnly ? 'Received' : 'Processed', processingStartedAt: isReceivedOnly ? null : day(number * 2 - 1),
    rawPayload: { demo: true, orderCode: order.orderCode, paymentStatus: gatewayStatus },
    processingResult: isReceivedOnly ? null : { accepted: gatewayStatus === 'Paid' },
  };
});

const invoices = orders.slice(3, 13).map((order, index) => {
  const details = orderDetails.filter((line) => line.orderKey === order.key);
  return {
    key: `invoice-${two(index + 1)}`, invoiceCode: `INV-DEMO-20${two(index + 1)}`, orderKey: order.key, issuedByKey: 'user-staff',
    issuedAt: day(index * 2 + 8), currency: 'VND', subtotal: order.subtotal, shippingFee: order.shippingFee,
    totalAmount: order.totalAmount, receiverName: order.receiverName, receiverPhone: order.receiverPhone,
    shippingAddress: order.shippingAddress, orderDetailKeys: details.map((line) => line.key),
    items: details.map((line) => ({
      orderDetailKey: line.key,
      productKey: line.productKey,
      productNameSnapshot: line.productNameSnapshot,
      productSkuSnapshot: line.productSkuSnapshot,
      unitSnapshot: line.unitSnapshot,
      productImageSnapshot: line.productImageSnapshot,
      priceSnapshot: line.priceSnapshot,
      quantity: line.quantity,
      subtotal: line.subtotal,
    })),
  };
});

const stockExports = orders.slice(3, 18).map((order, index) => ({
  key: `stock-export-${two(index + 1)}`, orderKey: order.key, requestedByKey: 'user-staff',
  processedByKey: index === 2 ? null : 'user-warehouse',
  status: index < 2 ? 'Rejected' : index === 2 ? 'Pending' : index === 3 ? 'Approved' : 'Exported',
  note: index < 2 ? `Kho từ chối phiếu của ${order.orderCode} và trả đơn về Confirmed.` : `Phiếu xuất kho demo cho ${order.orderCode}`,
  createdAt: order.confirmedAt || order.createdAt,
  updatedAt: index >= 4 ? order.packedAt : day(Number(order.createdAt.slice(8, 10))),
  exportedAt: index >= 4 ? order.packedAt : null,
}));

const replenishmentStatuses = ['PendingApproval', 'Approved', 'Rejected', 'Approved', 'Received', 'Received'];
const replenishments = replenishmentStatuses.map((status, index) => ({
  key: `replenishment-${two(index + 1)}`, productKey: `product-${two(index + 1)}`, inventoryKey: `inventory-${two(index + 1)}`,
  requestedByKey: 'user-warehouse', approvedByKey: status === 'PendingApproval' ? null : 'user-admin', quantity: 20 + index * 5,
  receivedQuantity: status === 'Received' ? 20 + index * 5 : 0, receivedByKey: status === 'Received' ? 'user-warehouse' : null,
  status, reason: 'Bổ sung tồn kho phục vụ nhu cầu demo', adminNote: status === 'Rejected' ? 'Tồn kho hiện tại vẫn đủ.' : '',
  receivedAt: status === 'Received' ? day(34 + index) : null,
}));

const damageStatuses = ['PendingWarehouseConfirmation', 'Confirmed', 'PendingWarehouseConfirmation'];
const damageReports = damageStatuses.map((status, index) => ({
  key: `damage-report-${two(index + 1)}`, inventoryKey: `inventory-${two(index + 7)}`, productKey: `product-${two(index + 7)}`,
  reportedByKey: 'user-staff', confirmedByKey: status === 'Confirmed' ? 'user-warehouse' : null, quantity: index + 1,
  reason: ['Bao bì móp khi nhận hàng', 'Sản phẩm nứt trong quá trình kiểm kho', 'Sai lệch mẫu đang chờ kho kiểm tra'][index], status,
  confirmedAt: status === 'Confirmed' ? day(40 + index) : null,
}));

const ledger = new Map(products.map((product, index) => {
  if (index === products.length - 2) return [product.key, 6];
  if (index === products.length - 1) return [product.key, 7];
  return [product.key, 80 + index * 3];
}));
const inventoryTransactions = [];
const transactionSpecs = [];
function appendInventoryTransaction({ productKey, orderKey = null, relatedCollection, relatedKey, transactionType, quantity, reason, createdAt }) {
  const beforeQuantity = ledger.get(productKey);
  const afterQuantity = beforeQuantity + quantity;
  ledger.set(productKey, afterQuantity);
  inventoryTransactions.push({
    key: `inventory-transaction-${two(inventoryTransactions.length + 1)}`, productKey, orderKey, relatedCollection,
    relatedKey, performedByKey: 'user-warehouse', transactionType, quantity, beforeQuantity, afterQuantity, reason, createdAt,
  });
}

for (let index = 0; index < 12; index += 1) {
  transactionSpecs.push({
    productKey: `product-${two(index + 1)}`, relatedCollection: 'Inventory', relatedKey: `inventory-${two(index + 1)}`,
    transactionType: 'ADJUSTMENT', quantity: index % 2 === 0 ? 5 : -2,
    reason: `Kiểm kê điều chỉnh sản phẩm demo ${index + 1}.`, createdAt: day(5 + index),
  });
}
for (const request of replenishments.filter((item) => item.status === 'Received')) {
  transactionSpecs.push({
    productKey: request.productKey, relatedCollection: 'ReplenishmentRequest', relatedKey: request.key,
    transactionType: 'REPLENISHMENT_RECEIVE', quantity: request.receivedQuantity,
    reason: `Nhận đủ yêu cầu bổ sung ${request.key}.`, createdAt: request.receivedAt,
  });
}
const confirmedDamage = damageReports.find((item) => item.status === 'Confirmed');
transactionSpecs.push({
  productKey: confirmedDamage.productKey, relatedCollection: 'DamageReport', relatedKey: confirmedDamage.key,
  transactionType: 'DAMAGE_CONFIRMED', quantity: -confirmedDamage.quantity,
  reason: `Xác nhận hư hỏng ${confirmedDamage.key}.`, createdAt: confirmedDamage.confirmedAt,
});
for (const request of stockExports.filter((item) => item.status === 'Exported')) {
  for (const detail of orderDetails.filter((item) => item.orderKey === request.orderKey)) {
    transactionSpecs.push({
      productKey: detail.productKey, orderKey: request.orderKey, relatedCollection: 'StockExportRequest', relatedKey: request.key,
      transactionType: 'STOCK_EXPORT', quantity: -detail.quantity,
      reason: `Xuất kho cho ${orders.find((order) => order.key === request.orderKey).orderCode}.`, createdAt: request.exportedAt,
    });
  }
}
transactionSpecs
  .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.relatedKey.localeCompare(right.relatedKey))
  .forEach(appendInventoryTransaction);

for (const inventory of inventories) {
  inventory.stockQuantity = ledger.get(inventory.productKey);
  inventory.reservedQuantity = orders
    .filter((order) => ['Pending', 'WaitingForPayment', 'Confirmed', 'StockExportRequested'].includes(order.orderStatus))
    .flatMap((order) => orderDetails.filter((detail) => detail.orderKey === order.key && detail.productKey === inventory.productKey))
    .reduce((sum, detail) => sum + detail.quantity, 0);
  inventory.damagedQuantity = confirmedDamage.productKey === inventory.productKey ? confirmedDamage.quantity : 0;
  products.find((product) => product.key === inventory.productKey).stockQuantity = inventory.stockQuantity;
}

const returnStatuses = ['Pending', 'AwaitingInspection', 'Rejected', 'ReadyForRefund', 'Completed'];
const returnOrders = [14, 15, 16, 17, 19];
const returnRequests = returnStatuses.map((status, index) => ({
  key: `return-request-${two(index + 1)}`, requestCode: `RET-DEMO-20${two(index + 1)}`, orderKey: `order-${two(returnOrders[index])}`,
  customerKey: orders[returnOrders[index] - 1].customerKey, paymentKey: `payment-${two(returnOrders[index])}`,
  reason: ['Muốn đổi kích thước phù hợp hơn', 'Sản phẩm có vết xước nhẹ', 'Không đủ điều kiện đổi trả', 'Kho đã kiểm hàng, chờ hoàn tiền', 'Yêu cầu đã hoàn tất'][index],
  status, refundAmount: ['AwaitingInspection', 'ReadyForRefund', 'Completed'].includes(status) ? orders[returnOrders[index] - 1].totalAmount : 0,
  resolvedByKey: status === 'Pending' ? null : 'user-staff', requestedAt: day(37 + index), handledAt: status === 'Pending' ? null : day(38 + index),
  resolvedAt: status === 'Pending' ? null : day(38 + index),
  staffNote: status === 'Rejected' ? 'Yêu cầu ngoài điều kiện đổi trả.' : 'Đã tiếp nhận theo quy trình.',
  inspectionNote: ['ReadyForRefund', 'Completed'].includes(status) ? 'Kho đã kiểm đủ số lượng và phân loại từng sản phẩm.' : '',
  completedByKey: status === 'Completed' ? 'user-staff' : null,
  completedAt: status === 'Completed' ? day(44) : null,
}));
const returnItems = returnRequests.filter((request) => ['ReadyForRefund', 'Completed'].includes(request.status)).flatMap((request) =>
  orderDetails.filter((detail) => detail.orderKey === request.orderKey).map((detail, lineIndex) => ({
    key: `return-item-${two(returnRequests.indexOf(request) + 1)}-${lineIndex + 1}`, returnRequestKey: request.key,
    orderDetailKey: detail.key, productKey: detail.productKey, requestedQuantity: detail.quantity, receivedQuantity: 1,
    sellableQuantity: request.status === 'ReadyForRefund' && lineIndex === 0 ? 1 : 0,
    damagedQuantity: request.status === 'Completed' || lineIndex === 1 ? 1 : 0,
    warehouseNote: 'Biên bản kiểm hàng demo có ảnh và ghi chú rõ ràng.', inspectedByKey: 'user-warehouse', inspectedAt: day(42 + lineIndex),
  }))
);
const refundPendings = [
  { key: 'refund-pending-01', orderKey: 'order-17', paymentAttemptKey: 'payment-attempt-17', status: 'RefundPending' },
  { key: 'refund-pending-02', orderKey: 'order-19', paymentAttemptKey: 'payment-attempt-19', status: 'RefundPending' },
  { key: 'refund-pending-03', orderKey: 'order-21', paymentAttemptKey: 'payment-attempt-21', status: 'RefundPending' },
].map((entry) => ({ ...entry, customerKey: orders[Number(entry.orderKey.slice(-2)) - 1].customerKey, amount: orders[Number(entry.orderKey.slice(-2)) - 1].totalAmount, currency: 'VND', reason: 'Bàn giao hoàn tiền theo kịch bản demo.' }));

const supportTypes = ['Order', 'Product', 'Payment', 'ReturnRefund', 'Other'];
const supportStatuses = ['New', 'InProgress', 'Resolved'];
const supportRequests = customerNames.map((_, index) => ({
  key: `support-${two(index + 1)}`, ticketCode: `SUP-DEMO-${two(index + 1)}`, customerKey: `user-customer-${two(index + 1)}`,
  orderKey: `order-${two(index + 1)}`, productKey: `product-${two((index % products.length) + 1)}`, requestType: supportTypes[index % supportTypes.length],
  priority: ['Low', 'Normal', 'High', 'Urgent'][index % 4], subject: `Yêu cầu hỗ trợ demo ${index + 1}`,
  content: 'Khách hàng cần được hướng dẫn rõ ràng về sản phẩm, thanh toán hoặc tiến độ xử lý đơn hàng.',
  status: supportStatuses[index % supportStatuses.length], handledByKey: index % supportStatuses.length === 0 ? null : 'user-staff',
  response: index % supportStatuses.length === 0 ? '' : 'GreenHome đã kiểm tra và phản hồi theo đúng nội dung yêu cầu.',
  createdAt: day(12 + index), respondedAt: index % supportStatuses.length === 0 ? null : day(13 + index),
  closedAt: index % supportStatuses.length === 2 ? day(14 + index) : null,
}));

const reviewDetails = orderDetails.filter((detail) => {
  const order = orders.find((candidate) => candidate.key === detail.orderKey);
  return order.orderStatus === 'Delivered';
}).slice(0, 16);
const reviews = reviewDetails.map((detail, index) => ({
  key: `review-${two(index + 1)}`, productKey: detail.productKey, orderKey: detail.orderKey,
  customerKey: orders.find((order) => order.key === detail.orderKey).customerKey, rating: 4 + (index % 2),
  content: index % 2 ? 'Thiết kế đẹp, đóng gói chắc chắn và dùng đúng như mô tả. Gia đình tôi rất hài lòng.' : 'Sản phẩm hoàn thiện tốt, chất liệu dễ vệ sinh và giao hàng đúng hẹn.',
  status: index === 15 ? 'Hidden' : 'Visible', createdAt: day(41 + (index % 7)),
}));

const notifications = Array.from({ length: 40 }, (_, index) => {
  const user = users[index % users.length];
  const read = index % 3 === 0;
  return {
    key: `notification-${two(index + 1)}`, eventId: `demo-event-${two(index + 1)}`, userKey: user.key,
    targetCollection: index % 2 ? 'Order' : 'SupportRequest', targetKey: index % 2 ? `order-${two((index % 22) + 1)}` : `support-${two((index % 10) + 1)}`,
    type: index % 2 ? 'ORDER_STATUS' : 'SUPPORT_STATUS', channel: 'InApp', subject: `Thông báo GreenHome số ${index + 1}`,
    content: 'Thông tin demo giúp kiểm tra danh sách, trạng thái đã đọc và liên kết đến tác vụ liên quan.', deliveryStatus: 'Sent',
    isRead: read, readAt: read ? day(20 + (index % 25)) : null, sentAt: day(20 + (index % 25)), createdAt: day(20 + (index % 25)),
  };
});

const systemSettings = [
  { key: 'PAYMENT_TIMEOUT_MINUTES', value: 15, description: 'Số phút tối đa chờ thanh toán trực tuyến.', updatedByKey: 'user-admin' },
  { key: 'RETURN_WINDOW_DAYS', value: 7, description: 'Số ngày khách hàng được gửi yêu cầu đổi trả.', updatedByKey: 'user-admin' },
  { key: 'LOW_STOCK_DEFAULT_THRESHOLD', value: 5, description: 'Ngưỡng cảnh báo sắp hết mặc định.', updatedByKey: 'user-admin' },
];

const auditActions = ['AUTH_LOGIN_SUCCESS', 'ORDER_CREATE', 'ORDER_STATUS_UPDATE', 'PAYMENT_CALLBACK', 'STOCK_EXPORT', 'SUPPORT_UPDATE', 'RETURN_UPDATE', 'SYSTEM_SETTING_UPDATE'];
const auditLogs = Array.from({ length: 60 }, (_, index) => ({
  key: `audit-${two(index + 1)}`, userKey: users[index % users.length].key, action: auditActions[index % auditActions.length],
  targetEntity: ['User', 'Order', 'Payment', 'Inventory', 'SupportRequest', 'ReturnRefundRequest'][index % 6],
  targetId: `demo-target-${two(index + 1)}`, description: `Nhật ký demo có chủ đích số ${index + 1}.`,
  ip: '127.0.0.1', userAgent: 'GreenHome Demo Seed', timestamp: hour(index * 12),
}));

const DEMO_GRAPH = Object.freeze({
  roles, users, addresses, categories, products, inventories, carts, cartItems, orders, orderDetails,
  payments, paymentAttempts, paymentCallbacks, invoices, stockExports, inventoryTransactions,
  replenishments, damageReports, returnRequests, returnItems, refundPendings, supportRequests,
  reviews, notifications, systemSettings, auditLogs,
});

function cloneDemoGraph(graph = DEMO_GRAPH) {
  return structuredClone(graph);
}

module.exports = { BASE_DATE, DEMO_GRAPH, cloneDemoGraph };
