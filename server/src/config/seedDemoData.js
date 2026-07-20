require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('./database');
const { seedRoles } = require('./seedRoles');
const { hashPassword } = require('../utils/password');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const SupportRequest = require('../models/supportRequest.model');
const ProductReview = require('../models/productReview.model');
const SystemSetting = require('../models/systemSetting.model');
const Notification = require('../models/notification.model');
const AuditLog = require('../models/auditLog.model');
const UserAddress = require('../models/userAddress.model');

const DEMO_PASSWORD = 'GreenHome@123';

const DEMO_USERS = [
  {
    roleName: 'Customer',
    fullName: 'Khách hàng Demo',
    email: 'customer@greenhome.test',
    phone: '0900000001',
    address: '12 Nguyễn Trãi, Hà Nội',
  },
  {
    roleName: 'Staff',
    fullName: 'Nhân viên Demo Nguyễn Hữu Anh Nhật',
    email: 'staff@greenhome.test',
    phone: '0900000002',
    address: 'Văn phòng nhân viên GreenHome',
  },
  {
    roleName: 'WarehouseManager',
    fullName: 'Quản lý kho Demo Lê Vũ Cường',
    email: 'warehouse@greenhome.test',
    phone: '0900000003',
    address: 'Kho hàng GreenHome',
  },
  {
    roleName: 'Admin',
    fullName: 'Quản trị viên Demo Nguyễn Ngọc Thành',
    email: 'admin@greenhome.test',
    phone: '0900000004',
    address: 'Văn phòng quản trị GreenHome',
  },
];

const DEMO_USER_ADDRESS_SPECS = [
  {
    label: 'Nhà riêng',
    receiverName: 'Khách hàng Demo',
    phoneNumber: '0900000001',
    province: 'Hà Nội',
    district: 'Thanh Xuân',
    ward: 'Thượng Đình',
    addressLine: '12 Nguyễn Trãi',
    isDefault: true,
  },
  {
    label: 'Văn phòng',
    receiverName: 'Khách hàng Demo',
    phoneNumber: '0900000001',
    province: 'Hà Nội',
    district: 'Cầu Giấy',
    ward: 'Dịch Vọng',
    addressLine: '1 đường Cầu Giấy',
    isDefault: false,
  },
];

const DEMO_CATEGORIES = [
  { name: 'Cookware', description: 'Pots, pans, and daily cooking essentials' },
  { name: 'Tableware', description: 'Bowls, plates, cups, and serving tools' },
  { name: 'Kitchen Tools', description: 'Preparation tools for home cooking' },
  { name: 'Cleaning Supplies', description: 'Safe kitchen cleaning products' },
  { name: 'Smart Storage', description: 'Food storage and kitchen organization' },
];

const DEMO_PRODUCTS = [
  {
    name: 'Green Ceramic Frying Pan',
    categoryName: 'Cookware',
    description: 'Non-stick ceramic pan for daily cooking.',
    imageUrls: ['https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80'],
    price: 32,
    stockQuantity: 25,
    unit: 'piece',
  },
  {
    name: 'Stainless Sauce Pot',
    categoryName: 'Cookware',
    description: 'Durable stainless pot for soups and sauces.',
    imageUrls: ['https://images.unsplash.com/photo-1584990347449-a5d9f800a783?auto=format&fit=crop&w=900&q=80'],
    price: 45,
    stockQuantity: 18,
    unit: 'piece',
  },
  {
    name: 'Minimal Dinner Plate Set',
    categoryName: 'Tableware',
    description: 'Four-piece ceramic plate set.',
    imageUrls: ['https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=900&q=80'],
    price: 28,
    stockQuantity: 40,
    unit: 'set',
  },
  {
    name: 'Glass Storage Jar',
    categoryName: 'Smart Storage',
    description: 'Airtight glass jar for grains and spices.',
    imageUrls: ['https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80'],
    price: 9,
    stockQuantity: 80,
    unit: 'piece',
  },
  {
    name: 'Bamboo Cutting Board',
    categoryName: 'Kitchen Tools',
    description: 'Bamboo board with juice groove.',
    imageUrls: ['https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=900&q=80'],
    price: 16,
    stockQuantity: 35,
    unit: 'piece',
  },
  {
    name: 'Chef Knife 8 Inch',
    categoryName: 'Kitchen Tools',
    description: 'Balanced stainless chef knife.',
    imageUrls: ['https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=900&q=80'],
    price: 38,
    stockQuantity: 22,
    unit: 'piece',
  },
  {
    name: 'Eco Dish Soap',
    categoryName: 'Cleaning Supplies',
    description: 'Plant-based dish soap for kitchen cleaning.',
    imageUrls: ['https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=80'],
    price: 7,
    stockQuantity: 120,
    unit: 'bottle',
  },
  {
    name: 'Stackable Food Container Set',
    categoryName: 'Smart Storage',
    description: 'BPA-free containers for meal prep.',
    imageUrls: ['https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80'],
    price: 24,
    stockQuantity: 30,
    unit: 'set',
  },
];

const DEMO_ORDER_SPECS = [
  {
    orderCode: 'GH-DEMO-1001',
    paymentMethod: 'COD',
    paymentStatus: 'Pending',
    orderStatus: 'Pending',
    shippingAddress: '12 Nguyen Trai, Ha Noi',
    items: [
      { productName: 'Green Ceramic Frying Pan', quantity: 1 },
      { productName: 'Eco Dish Soap', quantity: 2 },
    ],
  },
  {
    orderCode: 'GH-DEMO-1002',
    paymentMethod: 'ONLINE',
    paymentStatus: 'Paid',
    orderStatus: 'Confirmed',
    shippingAddress: '12 Nguyen Trai, Ha Noi',
    transactionId: 'DEMO-TXN-1002',
    items: [
      { productName: 'Chef Knife 8 Inch', quantity: 1 },
      { productName: 'Bamboo Cutting Board', quantity: 1 },
    ],
  },
  {
    orderCode: 'GH-DEMO-1003',
    paymentMethod: 'ONLINE',
    paymentStatus: 'Paid',
    orderStatus: 'StockExportRequested',
    shippingAddress: '12 Nguyen Trai, Ha Noi',
    transactionId: 'DEMO-TXN-1003',
    stockExportStatus: 'Pending',
    items: [
      { productName: 'Stackable Food Container Set', quantity: 1 },
      { productName: 'Glass Storage Jar', quantity: 4 },
    ],
  },
  {
    orderCode: 'GH-DEMO-1004',
    paymentMethod: 'COD',
    paymentStatus: 'Paid',
    orderStatus: 'Delivered',
    shippingAddress: '12 Nguyen Trai, Ha Noi',
    items: [
      { productName: 'Minimal Dinner Plate Set', quantity: 1 },
    ],
  },
];

const DEMO_RETURN_REFUND_SPECS = [
  {
    orderCode: 'GH-DEMO-1004',
    requestCode: 'RET-DEMO-1004',
    reason: 'Demo request: plate set arrived with one broken item.',
    status: 'Pending',
  },
];

const DEMO_SUPPORT_SPECS = [
  {
    orderCode: 'GH-DEMO-1004',
    subject: 'Demo support: damaged packaging',
    content: 'The delivered package was open and needs staff follow-up.',
    status: 'New',
  },
];

const DEMO_REVIEW_SPECS = [
  {
    orderCode: 'GH-DEMO-1004',
    productName: 'Minimal Dinner Plate Set',
    rating: 5,
    content: 'Clean design and good quality for daily meals.',
  },
];

const DEMO_SETTING_SPECS = [
  {
    key: 'lowStockDefaultThreshold',
    value: 5,
    description: 'Default low-stock threshold for new inventory records',
  },
  {
    key: 'returnWindowDays',
    value: 7,
    description: 'Allowed customer return/refund window in days',
  },
];

const DEMO_NOTIFICATION_SPECS = [
  {
    roleName: 'Customer',
    type: 'ORDER_STATUS',
    channel: 'InApp',
    subject: 'Đơn hàng mẫu đã sẵn sàng theo dõi',
    legacySubjects: ['Demo order is ready to track'],
    content: 'Đơn hàng GH-DEMO-1002 đã được xác nhận và đang chờ yêu cầu xuất kho.',
    deliveryStatus: 'Sent',
    isRead: false,
    targetOrderCode: 'GH-DEMO-1002',
  },
  {
    roleName: 'Staff',
    type: 'STAFF_QUEUE',
    channel: 'InApp',
    subject: 'Hàng đợi nhân viên có đơn cần xử lý',
    legacySubjects: ['Demo staff queue has pending work'],
    content: 'Vui lòng kiểm tra các đơn chờ xác nhận và yêu cầu xuất kho trước khi chuyển sang kho.',
    deliveryStatus: 'Sent',
    isRead: false,
  },
  {
    roleName: 'WarehouseManager',
    type: 'LOW_STOCK',
    channel: 'InApp',
    subject: 'Kho có phiếu xuất đang chờ duyệt',
    legacySubjects: ['Demo warehouse stock export waiting'],
    content: 'Đơn hàng GH-DEMO-1003 có yêu cầu xuất kho đang chờ xác nhận.',
    deliveryStatus: 'Sent',
    isRead: false,
  },
  {
    roleName: 'Admin',
    type: 'REPORT_READY',
    channel: 'InApp',
    subject: 'Dữ liệu báo cáo quản trị đã sẵn sàng',
    legacySubjects: ['Demo admin report data is available'],
    content: 'Báo cáo và cấu hình hệ thống đã có dữ liệu mẫu để trình bày với mentor.',
    deliveryStatus: 'Sent',
    isRead: true,
  },
];

const DEMO_AUDIT_SPECS = [
  {
    roleName: 'Admin',
    action: 'AUTH_LOGIN_SUCCESS',
    targetEntity: 'User',
    description: 'Demo admin logged in for mentor audit walkthrough',
  },
  {
    roleName: 'Customer',
    action: 'ORDER_CREATE',
    targetEntity: 'Order',
    targetId: 'GH-DEMO-1004',
    description: 'Demo customer created delivered order GH-DEMO-1004',
  },
  {
    roleName: 'Staff',
    action: 'RETURN_REFUND_APPROVED_FOR_INSPECTION',
    targetEntity: 'ReturnRefundRequest',
    targetId: 'GH-DEMO-1004',
    description: 'Demo staff approved a return/refund request',
  },
];

async function upsertUsers(roleMap) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = {};

  for (const user of DEMO_USERS) {
    const role = roleMap[user.roleName];
    const saved = await User.findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          phoneNumber: user.phone,
          address: user.address,
          passwordHash,
          roleId: role._id,
          status: 'Active',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    users[user.roleName] = saved;
  }

  return users;
}

async function upsertUserAddresses(userMap) {
  const customer = userMap.Customer;
  await UserAddress.updateMany({ userId: customer._id }, { $set: { isDefault: false } });
  const addresses = [];
  for (const addressSpec of DEMO_USER_ADDRESS_SPECS) {
    const address = await UserAddress.findOneAndUpdate(
      { userId: customer._id, label: addressSpec.label },
      { $set: { userId: customer._id, ...addressSpec } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    addresses.push(address);
  }
  return addresses;
}

async function upsertCategories() {
  const categories = {};
  for (const category of DEMO_CATEGORIES) {
    const saved = await Category.findOneAndUpdate(
      { name: category.name },
      { $set: { ...category, status: 'Active' } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    categories[category.name] = saved;
  }
  return categories;
}

async function upsertProducts(categoryMap) {
  const products = {};
  for (const product of DEMO_PRODUCTS) {
    const saved = await Product.findOneAndUpdate(
      { name: product.name },
      {
        $set: {
          name: product.name,
          description: product.description,
          imageUrls: product.imageUrls,
          price: product.price,
          stockQuantity: product.stockQuantity,
          unit: product.unit,
          categoryId: categoryMap[product.categoryName]._id,
          status: 'Active',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    products[product.name] = saved;
  }
  return products;
}

async function upsertInventories(productMap) {
  const inventories = {};
  for (const product of Object.values(productMap)) {
    let inventory = await Inventory.findOne({ productId: product._id });
    if (!inventory) inventory = new Inventory({ productId: product._id });
    inventory.stockQuantity = Number(product.stockQuantity || 0);
    inventory.reservedQuantity = 0;
    inventory.damagedQuantity = 0;
    inventory.lowStockThreshold = 5;
    await inventory.save();
    inventories[product.name] = inventory;
  }
  return inventories;
}

function buildOrderLines(orderSpec, productMap) {
  return orderSpec.items.map((item) => {
    const product = productMap[item.productName];
    const subtotal = product.price * item.quantity;
    return {
      productId: product._id,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku || '',
      unitSnapshot: product.unit || '',
      productImageSnapshot: Array.isArray(product.imageUrls) ? product.imageUrls[0] || '' : '',
      priceSnapshot: product.price,
      quantity: item.quantity,
      subtotal,
    };
  });
}

async function upsertDemoOrders(userMap, productMap) {
  const orders = [];
  const customer = userMap.Customer;
  const staff = userMap.Staff;

  for (const orderSpec of DEMO_ORDER_SPECS) {
    const lines = buildOrderLines(orderSpec, productMap);
    const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const order = await Order.findOneAndUpdate(
      { orderCode: orderSpec.orderCode },
      {
        $set: {
          orderCode: orderSpec.orderCode,
          customerId: customer._id,
          totalAmount,
          paymentMethod: orderSpec.paymentMethod,
          paymentStatus: orderSpec.paymentStatus,
          orderStatus: orderSpec.orderStatus,
          shippingAddress: orderSpec.shippingAddress,
          cancelReason: '',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await OrderDetail.deleteMany({ orderId: order._id });
    await OrderDetail.insertMany(lines.map((line) => ({ orderId: order._id, ...line })));

    await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          orderId: order._id,
          requestCode: orderSpec.requestCode || '',
          transactionId: orderSpec.transactionId || '',
          paymentMethod: orderSpec.paymentMethod,
          amount: totalAmount,
          paymentStatus: orderSpec.paymentStatus,
          paidAt: orderSpec.paymentStatus === 'Paid' ? new Date() : null,
          rawResponse: { source: 'demo-seed', orderCode: orderSpec.orderCode },
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    if (orderSpec.stockExportStatus) {
      await StockExportRequest.findOneAndUpdate(
        { orderId: order._id },
        {
          $set: {
            orderId: order._id,
            requestedBy: staff._id,
            status: orderSpec.stockExportStatus,
            note: `Demo stock export for ${order.orderCode}`,
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } else {
      await StockExportRequest.deleteMany({ orderId: order._id });
    }

    orders.push(order);
  }

  return orders;
}

async function upsertReturnRefundRequests(userMap, orderMap) {
  const customer = userMap.Customer;
  const requests = [];

  for (const requestSpec of DEMO_RETURN_REFUND_SPECS) {
    const order = orderMap[requestSpec.orderCode];
    if (!order) continue;
    const request = await ReturnRefundRequest.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          orderId: order._id,
          customerId: customer._id,
          reason: requestSpec.reason,
          status: requestSpec.status,
          refundAmount: 0,
          resolvedBy: null,
          resolvedAt: null,
          staffNote: '',
          inspectionNote: '',
          completedBy: null,
          completedAt: null,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    requests.push(request);
  }

  return requests;
}

async function upsertSupportRequests(userMap, orderMap) {
  const customer = userMap.Customer;
  const requests = [];

  for (const requestSpec of DEMO_SUPPORT_SPECS) {
    const order = orderMap[requestSpec.orderCode];
    const request = await SupportRequest.findOneAndUpdate(
      { customerId: customer._id, subject: requestSpec.subject },
      {
        $set: {
          customerId: customer._id,
          orderId: order ? order._id : null,
          subject: requestSpec.subject,
          content: requestSpec.content,
          status: requestSpec.status,
          handledBy: null,
          response: '',
          respondedAt: null,
          closedAt: null,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    requests.push(request);
  }

  return requests;
}

async function upsertProductReviews(userMap, orderMap, productMap) {
  const customer = userMap.Customer;
  const reviews = [];

  for (const reviewSpec of DEMO_REVIEW_SPECS) {
    const order = orderMap[reviewSpec.orderCode];
    const product = productMap[reviewSpec.productName];
    if (!order || !product) continue;
    const review = await ProductReview.findOneAndUpdate(
      { customerId: customer._id, orderId: order._id, productId: product._id },
      {
        $set: {
          customerId: customer._id,
          orderId: order._id,
          productId: product._id,
          rating: reviewSpec.rating,
          content: reviewSpec.content,
          status: 'Visible',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    reviews.push(review);
  }

  return reviews;
}

async function upsertSystemSettings(userMap) {
  const admin = userMap.Admin;
  const settings = [];

  for (const settingSpec of DEMO_SETTING_SPECS) {
    const setting = await SystemSetting.findOneAndUpdate(
      { key: settingSpec.key },
      {
        $set: {
          ...settingSpec,
          updatedBy: admin._id,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    settings.push(setting);
  }

  return settings;
}

async function upsertNotifications(userMap, orderMap) {
  const notifications = [];

  for (const notificationSpec of DEMO_NOTIFICATION_SPECS) {
    const user = userMap[notificationSpec.roleName];
    const providerMessageId = `demo-seed:${notificationSpec.roleName}:${notificationSpec.type}`;

    await Notification.deleteMany({
      userId: user._id,
      subject: { $in: [notificationSpec.subject, ...(notificationSpec.legacySubjects || [])] },
      providerMessageId: { $ne: providerMessageId },
    });

    const notification = await Notification.findOneAndUpdate(
      { userId: user._id, providerMessageId },
      {
        $set: {
          userId: user._id,
          type: notificationSpec.type,
          channel: notificationSpec.channel,
          subject: notificationSpec.subject,
          content: notificationSpec.content,
          deliveryStatus: notificationSpec.deliveryStatus,
          providerMessageId,
          isRead: notificationSpec.isRead,
          readAt: notificationSpec.isRead ? new Date() : null,
          deletedAt: null,
          targetCollection: notificationSpec.targetOrderCode ? 'Order' : '',
          targetId: notificationSpec.targetOrderCode ? orderMap[notificationSpec.targetOrderCode]?._id || null : null,
          sentAt: new Date(),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    notifications.push(notification);
  }

  return notifications;
}

async function upsertAuditLogs(userMap) {
  const auditLogs = [];

  for (const auditSpec of DEMO_AUDIT_SPECS) {
    const user = userMap[auditSpec.roleName];
    const auditLog = await AuditLog.findOneAndUpdate(
      {
        userId: user._id,
        action: auditSpec.action,
        targetId: auditSpec.targetId || '',
      },
      {
        $set: {
          userId: user._id,
          action: auditSpec.action,
          targetEntity: auditSpec.targetEntity,
          targetId: auditSpec.targetId || '',
          description: auditSpec.description,
          ip: '127.0.0.1',
          userAgent: 'GreenHome demo seed',
          timestamp: new Date(),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    auditLogs.push(auditLog);
  }

  return auditLogs;
}

async function seedDemoData() {
  await seedRoles();
  const roles = await Role.find({ roleName: { $in: DEMO_USERS.map((user) => user.roleName) } }).lean();
  const roleMap = Object.fromEntries(roles.map((role) => [role.roleName, role]));
  const missingRole = DEMO_USERS.find((user) => !roleMap[user.roleName]);
  if (missingRole) throw new Error(`Missing role: ${missingRole.roleName}`);

  const userMap = await upsertUsers(roleMap);
  const userAddresses = await upsertUserAddresses(userMap);
  const categoryMap = await upsertCategories();
  const productMap = await upsertProducts(categoryMap);
  const inventoryMap = await upsertInventories(productMap);
  const orders = await upsertDemoOrders(userMap, productMap);
  const orderMap = Object.fromEntries(orders.map((order) => [order.orderCode, order]));
  const returnRefunds = await upsertReturnRefundRequests(userMap, orderMap);
  const supportRequests = await upsertSupportRequests(userMap, orderMap);
  const productReviews = await upsertProductReviews(userMap, orderMap, productMap);
  const systemSettings = await upsertSystemSettings(userMap);
  const notifications = await upsertNotifications(userMap, orderMap);
  const auditLogs = await upsertAuditLogs(userMap);

  return {
    users: DEMO_USERS.length,
    userAddresses: userAddresses.length,
    categories: DEMO_CATEGORIES.length,
    products: DEMO_PRODUCTS.length,
    inventories: Object.keys(inventoryMap).length,
    orders: orders.length,
    returnRefunds: returnRefunds.length,
    supportRequests: supportRequests.length,
    productReviews: productReviews.length,
    systemSettings: systemSettings.length,
    notifications: notifications.length,
    auditLogs: auditLogs.length,
    demoPassword: DEMO_PASSWORD,
  };
}

async function runCli() {
  await connectDatabase();
  const result = await seedDemoData();
  console.log('GreenHome demo data seeded successfully.');
  console.table([
    { type: 'Users', count: result.users },
    { type: 'UserAddresses', count: result.userAddresses },
    { type: 'Categories', count: result.categories },
    { type: 'Products', count: result.products },
    { type: 'Inventories', count: result.inventories },
    { type: 'Orders', count: result.orders },
    { type: 'ReturnRefunds', count: result.returnRefunds },
    { type: 'SupportRequests', count: result.supportRequests },
    { type: 'ProductReviews', count: result.productReviews },
    { type: 'SystemSettings', count: result.systemSettings },
    { type: 'Notifications', count: result.notifications },
    { type: 'AuditLogs', count: result.auditLogs },
  ]);
  console.log(`Demo password for all accounts: ${result.demoPassword}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  runCli().catch(async (error) => {
    console.error('Failed to seed demo data:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  DEMO_AUDIT_SPECS,
  DEMO_CATEGORIES,
  DEMO_NOTIFICATION_SPECS,
  DEMO_ORDER_SPECS,
  DEMO_RETURN_REFUND_SPECS,
  DEMO_PASSWORD,
  DEMO_PRODUCTS,
  DEMO_REVIEW_SPECS,
  DEMO_SETTING_SPECS,
  DEMO_SUPPORT_SPECS,
  DEMO_USERS,
  DEMO_USER_ADDRESS_SPECS,
  seedDemoData,
};
