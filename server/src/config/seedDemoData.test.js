const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const packageJson = require('../../package.json');
const { DEMO_IMAGE_MANIFEST } = require('../demo-data/demoImageManifest');
const {
  DEMO_AUDIT_SPECS,
  DEMO_CATEGORIES,
  DEMO_NOTIFICATION_SPECS,
  DEMO_ORDER_SPECS,
  DEMO_RETURN_REFUND_SPECS,
  DEMO_PRODUCTS,
  DEMO_REVIEW_SPECS,
  DEMO_SETTING_SPECS,
  DEMO_SUPPORT_SPECS,
  DEMO_USERS,
  DEMO_USER_ADDRESS_SPECS,
} = require('./seedDemoData');

describe('demo data seed config', () => {
  it('provides one runnable npm command for consistent demo data', () => {
    assert.equal(packageJson.scripts['seed:demo'], 'node src/demo-data/demoSeedCli.js');
    const scriptSource = readFileSync(path.join(__dirname, 'seedDemoData.js'), 'utf8');
    assert.match(scriptSource, /seedDemoData/);
  });

  it('includes demo accounts for every application role', () => {
    const roles = DEMO_USERS.map((user) => user.roleName).sort();

    assert.deepEqual(roles, ['Admin', 'Customer', 'Staff', 'WarehouseManager']);
    assert.ok(DEMO_USERS.every((user) => user.email.endsWith('@greenhome.test')));
    assert.ok(DEMO_USER_ADDRESS_SPECS.length >= 2);
    assert.equal(DEMO_USER_ADDRESS_SPECS.filter((address) => address.isDefault).length, 1);
  });

  it('includes catalog and staff order demo records', () => {
    assert.ok(DEMO_CATEGORIES.length >= 4);
    assert.ok(DEMO_PRODUCTS.length >= 8);
    assert.ok(DEMO_PRODUCTS.every((product) => product.initialInventoryQuantity > 0));
    assert.ok(DEMO_PRODUCTS.every((product) => !Object.hasOwn(product, 'stockQuantity')));
    assert.ok(DEMO_PRODUCTS.every((product) => !Object.hasOwn(product, 'imageUrls')));
    assert.equal(new Set(DEMO_PRODUCTS.map((product) => product.sku)).size, DEMO_PRODUCTS.length);
    assert.ok(DEMO_PRODUCTS.every((product) => product.price >= 50000));
    assert.ok(DEMO_PRODUCTS.every((product) => DEMO_CATEGORIES.some((category) => category.name === product.categoryName)));
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'Pending'));
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'Confirmed'));
    assert.ok(
      DEMO_ORDER_SPECS.every((order) => order.orderStatus !== 'StockExportRequested'),
      'SL-004 removed StockExportRequested from the persisted Order lifecycle',
    );
    const pendingExportOrder = DEMO_ORDER_SPECS.find((order) => order.stockExportStatus === 'Pending');
    assert.equal(
      pendingExportOrder?.orderStatus,
      'Confirmed',
      'a Pending export remains a separate fulfillment fact while the Order is Confirmed',
    );
    assert.ok(DEMO_ORDER_SPECS.some((order) => order.orderStatus === 'Delivered'));
    assert.ok(DEMO_RETURN_REFUND_SPECS.some((request) => request.orderCode === 'GH-DEMO-1004'));
    assert.ok(DEMO_SUPPORT_SPECS.some((request) => request.orderCode === 'GH-DEMO-1004'));
    assert.ok(DEMO_REVIEW_SPECS.every((review) => DEMO_PRODUCTS.some((product) => product.name === review.productName)));
    assert.deepEqual(DEMO_SETTING_SPECS.map((setting) => setting.key).sort(), [
      'LOW_STOCK_DEFAULT_THRESHOLD',
      'PAYMENT_TIMEOUT_MINUTES',
    ]);
    const scriptSource = readFileSync(path.join(__dirname, 'seedDemoData.js'), 'utf8');
    assert.doesNotMatch(scriptSource, /requestSpec\.requestCode/);
    assert.match(scriptSource, /DEMO_IMAGE_MANIFEST/);
    assert.doesNotMatch(scriptSource, /images\.unsplash\.com/);
    assert.doesNotMatch(scriptSource, /stockQuantity:\s*product\.stockQuantity/);
    assert.match(scriptSource, /sellableQuantity\s*=\s*Number\(productSpec\.initialInventoryQuantity/);
    assert.ok(DEMO_PRODUCTS.every((product) => DEMO_IMAGE_MANIFEST.some((image) => image.sku === product.sku)));
    assert.match(scriptSource, /let inventory = await Inventory\.findOne/);
    assert.match(scriptSource, /await inventory\.save\(\)/);
  });

  it('writes canonical search and public review fields when reseeding', () => {
    const scriptSource = readFileSync(path.join(__dirname, 'seedDemoData.js'), 'utf8');
    const productWriter = scriptSource.match(
      /async function upsertProducts[\s\S]*?async function materializeProductMedia/,
    )?.[0] || '';
    const reviewWriter = scriptSource.match(
      /async function upsertProductReviews[\s\S]*?async function upsertSystemSettings/,
    )?.[0] || '';

    assert.match(scriptSource, /buildProductSearchText/);
    assert.match(scriptSource, /normalizedName:\s*normalizeCategoryIdentity\(category\.name\)/);
    assert.match(productWriter, /searchTextNormalized:\s*buildProductSearchText\(product\)/);
    assert.match(reviewWriter, /OrderDetail\.findOne/);
    assert.match(reviewWriter, /ProductReview\.collection\.updateOne/);
    assert.match(reviewWriter, /orderDetailId:\s*orderDetail\._id/);
    assert.match(reviewWriter, /publicationStatus:\s*'Published'/);
    assert.match(reviewWriter, /moderationStatus:\s*'Allowed'/);
  });

  it('includes notification demo records for every signed-in role', () => {
    const notificationRoles = DEMO_NOTIFICATION_SPECS.map((notification) => notification.roleName).sort();

    assert.deepEqual(notificationRoles, ['Admin', 'Customer', 'Staff', 'WarehouseManager']);
    assert.ok(DEMO_NOTIFICATION_SPECS.every((notification) => notification.channel === 'InApp'));
    assert.ok(DEMO_NOTIFICATION_SPECS.every((notification) => notification.subject.trim()));
    assert.ok(DEMO_NOTIFICATION_SPECS.every((notification) => Array.isArray(notification.legacySubjects)));
    const lowStock = DEMO_NOTIFICATION_SPECS.find((notification) => notification.type === 'LOW_STOCK_OPENED');
    assert.deepEqual(Object.keys(lowStock.displayValues).sort(), [
      'availableQuantity', 'effectiveThreshold', 'productName',
    ]);
    assert.ok(lowStock.displayValues.productName.trim());
    assert.equal(lowStock.displayValues.availableQuantity, 0);
    const scriptSource = readFileSync(path.join(__dirname, 'seedDemoData.js'), 'utf8');
    const notificationWriter = scriptSource.match(/async function upsertNotifications[\s\S]*?async function upsertAuditLogs/)?.[0] || '';
    assert.match(notificationWriter, /businessEventId/);
    assert.match(notificationWriter, /recipientIdentity/);
    assert.match(notificationWriter, /templateKey/);
    assert.match(notificationWriter, /displayValues/);
    assert.match(notificationWriter, /state/);
    assert.doesNotMatch(notificationWriter, /providerMessageId|deletedAt|subject:|content:/);
  });

  it('includes audit demo records for mentor review', () => {
    const actions = DEMO_AUDIT_SPECS.map((entry) => entry.action);

    assert.ok(actions.includes('AUTH_LOGIN_SUCCESS'));
    assert.ok(actions.includes('ORDER_CREATE'));
    assert.ok(actions.includes('RETURN_REFUND_APPROVED_FOR_INSPECTION'));
    const scriptSource = readFileSync(path.join(__dirname, 'seedDemoData.js'), 'utf8');
    const auditWriter = scriptSource.match(
      /async function upsertAuditLogs[\s\S]*?async function seedDemoData/,
    )?.[0] || '';
    assert.match(auditWriter, /AuditLog\.collection\.updateOne/);
    assert.match(auditWriter, /auditId/);
    assert.match(auditWriter, /actorType:\s*'User'/);
    assert.match(auditWriter, /targetType:\s*auditSpec\.targetEntity/);
    assert.match(auditWriter, /businessEventId/);
    assert.match(auditWriter, /correlationId/);
  });
});
