import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCartService } from '../services/cartService.js';
import { createOrderService } from '../services/orderService.js';
import { createProductService } from '../services/productService.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const readClientSource = (relativePath) => readFileSync(path.join(dirname, '..', relativePath), 'utf8');
const successfulResponse = (data) => ({
  ok: true,
  json: async () => ({ success: true, data }),
});

describe('SL-006 UI and client contract acceptance', () => {
  it('AT-105 exposes Admin-only managed-media identities rather than mutable image URLs', () => {
    const mediaManager = readClientSource('components/product/ProductMediaManager.jsx');
    const productService = readClientSource('services/productService.js');

    assert.match(mediaManager, /assetId|uploadId/);
    assert.match(mediaManager, /expiresAt|temporary/i);
    assert.match(productService, /assetId|uploadId/);
    assert.doesNotMatch(productService, /deleteImage\(url\)/);
  });

  it('AT-108/109 displays only derived availability and never raw inventory fields in public product UI', () => {
    const card = readClientSource('components/product/ProductCard.jsx');
    const detail = readClientSource('pages/public/ProductDetailPage.jsx');

    assert.match(card, /availabilityStatus/);
    assert.match(card, /OutOfStock/);
    assert.doesNotMatch(card, /stockQuantity|availableQuantity|inventoryHealth/i);
    assert.match(detail, /availabilityStatus/);
    assert.doesNotMatch(detail, /stockQuantity|availableQuantity|inventoryHealth/i);
  });

  it('AT-110/111/112 sends availability and bounded pagination filters, then renders server field errors and page state', () => {
    const filter = readClientSource('components/product/ProductFilter.jsx');
    const listing = readClientSource('pages/public/ProductListingPage.jsx');

    assert.match(filter, /availability/);
    assert.match(listing, /pageSize/);
    assert.match(listing, /totalPages/);
    assert.match(listing, /fieldErrors/);
    assert.match(listing, /page:\s*\d/);
  });

  it('AT-114 and CR AT-218/219 load live Categories and best-seller projection while leaving Home layout data-free', async () => {
    const home = readClientSource('pages/public/HomePage.jsx');
    const service = createProductService({ baseUrl: 'http://api.test/api', fetcher: async () => successfulResponse({}) });

    assert.match(home, /categoryService\.listCategories/);
    assert.match(home, /listBestSellers/);
    assert.match(home, /bestSeller.*label|ranking.*label|sectionLabel/i);
    assert.match(home, /categoryId=\$?\{/);
    assert.doesNotMatch(home, /const categories\s*=\s*\[/);
    assert.equal(typeof service.listBestSellers, 'function');
  });

  it('AT-115 gives Guests an authentication path instead of a guest cart action', () => {
    const card = readClientSource('components/product/ProductCard.jsx');
    const detail = readClientSource('pages/public/ProductDetailPage.jsx');

    assert.match(card, /if \(!user\)[\s\S]*?navigate\('\/login'\)/);
    assert.match(detail, /user\?\.role === 'Customer'/);
    assert.match(detail, /to="\/login"/);
  });

  it('AT-116/117/119 sends a Cart command idempotency key and expected version exactly once', async () => {
    let request;
    const service = createCartService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        request = { url, options };
        return successfulResponse({ id: 'cart-1', version: 8, commandStatus: 'Applied' });
      },
    });

    await service.addItem(
      { productId: 'product-1', quantity: 2, expectedVersion: 7 },
      { idempotencyKey: 'cart-add-001' }
    );

    assert.equal(request.url, 'http://api.test/api/cart/items');
    assert.equal(request.options.headers['Idempotency-Key'], 'cart-add-001');
    assert.deepEqual(JSON.parse(request.options.body), {
      productId: 'product-1', quantity: 2, expectedVersion: 7,
    });
  });

  it('retains one Cart command key and its original facts through an ambiguous UI retry', () => {
    const card = readClientSource('components/product/ProductCard.jsx');
    const detail = readClientSource('pages/public/ProductDetailPage.jsx');
    const cart = readClientSource('pages/customer/CartPage.jsx');

    for (const source of [card, detail, cart]) {
      assert.match(source, /createCartCommandRetryStore/);
      assert.match(source, /\.acquire\(/);
      assert.match(source, /\.confirm\(/);
      assert.match(source, /idempotencyKey/);
    }
  });

  it('AT-120/121/122 keeps retained Cart lines visible with current price and independent issue messages', () => {
    const cart = readClientSource('pages/customer/CartPage.jsx');

    assert.match(cart, /PriceChanged/);
    assert.match(cart, /Unavailable/);
    assert.match(cart, /InsufficientStock/);
    assert.match(cart, /InventoryReconciliation/);
    assert.match(cart, /oldPrice|previousPrice/);
    assert.match(cart, /unitPrice\s*\*\s*item\.quantity|item\.subtotal/);
    assert.match(cart, /shippingFee/);
  });

  it('AT-120/121/122 disables Cart mutations while pending and blocks checkout for every blocking issue', () => {
    const cart = readClientSource('pages/customer/CartPage.jsx');

    assert.match(cart, /pending|isPending/i);
    assert.match(cart, /disabled=\{[^}]*pending/i);
    assert.match(cart, /canCheckout/);
    assert.match(cart, /PriceChanged[\s\S]*Unavailable[\s\S]*InsufficientStock[\s\S]*InventoryReconciliation/);
  });

  it('AT-123/124 sends exact Cart/version and displayed price versions to checkout with an idempotency key', async () => {
    let request;
    const service = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        request = { url, options };
        return successfulResponse({ id: 'order-1', shippingFee: 0 });
      },
    });
    const expectedItems = [{ productId: 'product-1', quantity: 2, unitPrice: 125000, priceVersion: 4 }];

    await service.placeOrder({
      cartId: 'cart-1',
      cartVersion: 8,
      expectedItems,
      paymentMethod: 'COD',
      deliveryAddress: { receiverName: 'Customer', phoneNumber: '0900000000' },
    }, { idempotencyKey: 'checkout-001' });

    assert.equal(request.url, 'http://api.test/api/orders');
    assert.equal(request.options.headers['Idempotency-Key'], 'checkout-001');
    assert.deepEqual(JSON.parse(request.options.body).expectedItems, expectedItems);
    assert.equal(JSON.parse(request.options.body).cartId, 'cart-1');
    assert.equal(JSON.parse(request.options.body).cartVersion, 8);
  });

  it('AT-123/124 shows ShippingFee zero and cannot submit checkout while current Cart issues exist', () => {
    const checkout = readClientSource('pages/customer/CheckoutPage.jsx');

    assert.match(checkout, /shippingFee/);
    assert.match(checkout, /Phí vận chuyển:\s*0\s*₫/u);
    assert.match(checkout, /canCheckout/);
    assert.match(checkout, /disabled=\{[^}]*canCheckout/);
    assert.match(checkout, /PriceChanged|Unavailable|InsufficientStock|InventoryReconciliation/);
  });

  it('Admin Product UI removes stock authority, saves new Products Inactive, and separates guarded activation', () => {
    const productAdmin = readClientSource('pages/admin/ProductManagementPage.jsx');

    assert.doesNotMatch(productAdmin, /stockQuantity/);
    assert.match(productAdmin, /status:\s*'Inactive'/);
    assert.match(productAdmin, /updateProductStatus/);
    assert.match(productAdmin, /Kích hoạt/);
  });

  it('Category lifecycle UI supports edit, activate/deactivate, and the Active-Product blocking prerequisite', () => {
    const categoryAdmin = readClientSource('pages/admin/CategoryManagementPage.jsx');

    assert.match(categoryAdmin, /editingCategoryId/);
    assert.match(categoryAdmin, /updateCategory/);
    assert.match(categoryAdmin, /updateCategoryStatus|status/);
    assert.match(categoryAdmin, /activeProductIds|CATEGORY_ACTIVE_PRODUCTS|Active Products/i);
  });
});
