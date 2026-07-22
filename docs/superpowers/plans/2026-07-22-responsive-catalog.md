# Responsive Catalog and Admin Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement responsive P02/P03/P38/P40 while preserving current product, cart, review, media-upload, category and Admin API/RBAC behavior.

**Architecture:** Foundation merges first and owns tokens, shared shell and CSS import order. Chung changes only catalog/admin components plus `modules/catalog.css` and `modules/admin-catalog.css`; existing services and formatters remain authoritative. Stitch controls presentation only, never route, field, state or mutation.

**Tech Stack:** React 19, React Router, Bootstrap utilities, Vite, Node built-in test runner, existing REST wrappers.

---

## Scope, branch and file map

- Owner/identity: Phạm Thành Chung `<chungthanhpham2112@gmail.com>`.
- Branch: `feature/chung-responsive-catalog`, created from Foundation-merged `main`; never use `codex/`.
- Do not modify `client/src/main.jsx`, `client/src/styles.css`, shared layouts, `client/src/App.jsx`, backend files, or service endpoint/payload contracts.
- Foundation must import `client/src/styles/modules/catalog.css` and `client/src/styles/modules/admin-catalog.css` after its base/shell layers. If absent, ask Thành; do not edit a shared import root.
- Create `client/src/styles/modules/catalog.css`: P02/P03 only; selectors begin `.catalog-page`, `.product-detail-page`, `.product-card`, `.product-filter`.
- Create `client/src/styles/modules/admin-catalog.css`: P38/P40/media only; selectors begin `.product-management-page`, `.category-management-page`, `.product-media-manager`.
- Modify P02: `client/src/pages/public/ProductListingPage.jsx`, `client/src/components/product/ProductCard.jsx`, `client/src/components/product/ProductFilter.jsx`.
- Modify P03: `client/src/pages/public/ProductDetailPage.jsx`.
- Modify P38: `client/src/pages/admin/ProductManagementPage.jsx`, `client/src/components/product/ProductMediaManager.jsx`.
- Modify P40: `client/src/pages/admin/CategoryManagementPage.jsx`.
- Create tests: `client/src/components/product/ProductCard.test.js`, `ProductFilter.test.js`, `client/src/pages/public/ProductListingPage.test.js`, `client/src/pages/admin/CategoryManagementPage.test.js`.
- Modify tests: `client/src/pages/public/ProductDetailPage.test.js`, `client/src/pages/admin/ProductManagementPage.test.js`.
- Do not implement wishlist, quick view, static ratings/badges, pagination/sort without API, variants, Buy Now, quantity selector, Category Draft/Delete, or cross-role navigation.

### Task 1: Write P02/P03 failing behavior tests

**Files:**
- Create: `client/src/components/product/ProductCard.test.js`
- Create: `client/src/components/product/ProductFilter.test.js`
- Create: `client/src/pages/public/ProductListingPage.test.js`
- Modify: `client/src/pages/public/ProductDetailPage.test.js`

- [ ] **Step 1: Add source-contract tests before changing markup.**

    // ProductCard.test.js
    assert.match(source, /if \(!user\) \{[\s\S]*?navigate\('\/login'\)/);
    assert.match(source, /user\.role !== 'Customer'/);
    assert.match(source, /cartService\.addItem\(\{ productId: product\.id \|\| product\._id, quantity: 1 \}\)/);
    assert.match(source, /disabled=\{loading\}/);

    // ProductFilter.test.js
    for (const field of ['keyword', 'categoryId', 'minPrice', 'maxPrice']) assert.match(source, new RegExp(`filters\\.${field}`));
    assert.match(source, /onSubmit=\{onSubmit\}/);

    // ProductListingPage.test.js
    assert.match(source, /useSearchParams/);
    assert.match(source, /productService\.listProducts\(nextFilters\)/);
    assert.match(source, /Không tìm thấy sản phẩm phù hợp/);

- [ ] **Step 2: Run the tests to prove the new files are red.**

    npm test -- src/components/product/ProductCard.test.js src/components/product/ProductFilter.test.js src/pages/public/ProductListingPage.test.js src/pages/public/ProductDetailPage.test.js

Expected: FAIL because the three new test files do not yet exist.

- [ ] **Step 3: Extend detail assertions protecting API data and review permission.**

    assert.match(detailPage, /formatProductCurrency\(product\)/);
    assert.match(detailPage, /formatProductSku\(product\.sku\)/);
    assert.match(detailPage, /user\?\.role === 'Customer'/);
    assert.match(detailPage, /reviewService\.filterReviewableOrders\(detailedOrders, id\)/);
    assert.match(detailPage, /order\.orderStatus === 'Delivered'/);

- [ ] **Step 4: Run the green catalog contract suite.**

    npm test -- src/components/product/ProductCard.test.js src/components/product/ProductFilter.test.js src/pages/public/ProductListingPage.test.js src/pages/public/ProductDetailPage.test.js src/services/productService.test.js src/services/cartService.test.js src/services/reviewService.test.js

Expected: PASS.

- [ ] **Step 5: Commit the test checkpoint.**

    git add client/src/components/product/ProductCard.test.js client/src/components/product/ProductFilter.test.js client/src/pages/public/ProductListingPage.test.js client/src/pages/public/ProductDetailPage.test.js
    git -c user.name="Phạm Thành Chung" -c user.email="chungthanhpham2112@gmail.com" commit -m "test: cover responsive catalog contracts"

### Task 2: Implement P02 catalog/card/filter presentation

**Files:**
- Modify: `client/src/pages/public/ProductListingPage.jsx`
- Modify: `client/src/components/product/ProductFilter.jsx`
- Modify: `client/src/components/product/ProductCard.jsx`
- Modify: `client/src/styles/modules/catalog.css` (replace the Foundation marker; Foundation owns the import)

- [ ] **Step 1: Add semantic regions while retaining all controlled filter props and service calls.**

    <main className="public-page catalog-page">
      <div className="catalog-shell">
        <section className="catalog-filter-region" aria-label="Bộ lọc sản phẩm">
          <ProductFilter filters={filters} categories={categories} onChange={setFilters} onSubmit={handleSubmit} />
        </section>
        {loading && <div className="catalog-state" role="status" aria-live="polite">Đang tải sản phẩm...</div>}
      </div>
    </main>

- [ ] **Step 2: Add scoped desktop/mobile layout CSS.**

    .catalog-page .catalog-shell { margin: 0 auto; max-width: var(--gh-container); padding: 48px 40px; }
    .catalog-page .catalog-filter { display: grid; gap: 12px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .catalog-page .product-grid { display: grid; gap: 20px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    @media (max-width: 768px) { .catalog-page .catalog-shell { padding: 32px 16px; } .catalog-page .catalog-filter { grid-template-columns: 1fr; } .catalog-page .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

- [ ] **Step 3: Keep quick-add pending/success/error accessible.**

    <button className={`quick-add-btn ${added ? 'added' : ''}`} onClick={handleQuickAdd} disabled={loading} aria-label="Thêm nhanh vào giỏ hàng">
      {loading ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> : added ? 'Đã thêm' : '+ Thêm'}
    </button>
    {error && <div className="product-card-error" role="alert">{error}</div>}

- [ ] **Step 4: Verify and commit P02.**

    npm test -- src/components/product/ProductCard.test.js src/components/product/ProductFilter.test.js src/pages/public/ProductListingPage.test.js src/services/productService.test.js src/services/cartService.test.js
    npm run build
    git add client/src/pages/public/ProductListingPage.jsx client/src/components/product/ProductFilter.jsx client/src/components/product/ProductCard.jsx client/src/styles/modules/catalog.css
    git -c user.name="Phạm Thành Chung" -c user.email="chungthanhpham2112@gmail.com" commit -m "feat: refresh responsive product catalog"

Expected: tests PASS, build exits `0`, commit succeeds.

### Task 3: Implement P03 product detail without invented purchase features

**Files:**
- Modify: `client/src/pages/public/ProductDetailPage.jsx`
- Modify: `client/src/styles/modules/catalog.css`
- Modify: `client/src/pages/public/ProductDetailPage.test.js`

- [ ] **Step 1: Add the failing responsive/detail-state assertions.**

    assert.match(detailPage, /className="public-page product-detail-page"/);
    assert.match(detailPage, /aria-label="Chọn ảnh sản phẩm"/);
    assert.match(detailPage, /role="alert"/);
    assert.match(detailPage, /Chưa có đánh giá nào/);

- [ ] **Step 2: Run the focused test.**

    npm test -- src/pages/public/ProductDetailPage.test.js

Expected: FAIL until responsive root/state markup exists.

- [ ] **Step 3: Add visual roots while preserving Customer-only add-cart and gallery/review requests.**

Change the existing root opening tag from `<main className="public-page">` to `<main className="public-page product-detail-page">`. Change the review wrapper opening tag from `<div className="surface mt-4">` to `<section className="surface product-review-panel" aria-label="Đánh giá sản phẩm">` and change only its matching closing `</div>` to `</section>`. Leave the existing gallery, purchase predicates, review list, service calls, and remaining descendants in place.

    .product-detail-page .product-detail { display: grid; gap: 32px; grid-template-columns: minmax(0, .95fr) minmax(0, 1fr); }
    .product-detail-page .product-review-panel { margin: 24px auto 0; max-width: var(--gh-container); }
    @media (max-width: 768px) { .product-detail-page .product-detail { grid-template-columns: 1fr; } }

- [ ] **Step 4: Verify and commit P03.**

    npm test -- src/pages/public/ProductDetailPage.test.js src/services/reviewService.test.js src/services/cartService.test.js
    npm run build
    git add client/src/pages/public/ProductDetailPage.jsx client/src/styles/modules/catalog.css client/src/pages/public/ProductDetailPage.test.js
    git -c user.name="Phạm Thành Chung" -c user.email="chungthanhpham2112@gmail.com" commit -m "feat: refresh responsive product detail"

Expected: PASS and build exits `0`.

### Task 4: Write P38/P40 Admin catalog tests

**Files:**
- Modify: `client/src/pages/admin/ProductManagementPage.test.js`
- Create: `client/src/pages/admin/CategoryManagementPage.test.js`

- [ ] **Step 1: Add Admin status/media contract tests.**

    // CategoryManagementPage.test.js
    assert.match(source, /<option value="Active">Đang hoạt động<\/option>/);
    assert.match(source, /<option value="Inactive">Ngừng hoạt động<\/option>/);
    assert.doesNotMatch(source, /Draft|Xóa danh mục/);

    // ProductManagementPage.test.js
    assert.match(pageSource, /productService\.updateProductStatus/);
    assert.match(mediaSource, /MAX_IMAGES = 5/);
    assert.match(mediaSource, /IMAGE_TYPES/);

- [ ] **Step 2: Run test baseline and commit it.**

    npm test -- src/pages/admin/ProductManagementPage.test.js src/pages/admin/CategoryManagementPage.test.js src/services/productService.test.js src/services/categoryService.test.js
    git add client/src/pages/admin/ProductManagementPage.test.js client/src/pages/admin/CategoryManagementPage.test.js
    git -c user.name="Phạm Thành Chung" -c user.email="chungthanhpham2112@gmail.com" commit -m "test: cover admin catalog responsive contracts"

Expected: tests PASS after the asserted contract is present; commit succeeds.

### Task 5: Implement P38/P40/media responsive presentation

**Files:**
- Modify: `client/src/pages/admin/ProductManagementPage.jsx`
- Modify: `client/src/pages/admin/CategoryManagementPage.jsx`
- Modify: `client/src/components/product/ProductMediaManager.jsx`
- Modify: `client/src/styles/modules/admin-catalog.css` (replace the Foundation marker; Foundation owns the import)

- [ ] **Step 1: Add scoped page roots while keeping form/service handlers.**

In `ProductManagementPage.jsx`, change only these existing opening tags and keep every descendant and matching closing tag intact:

    <div className="product-management-page admin-catalog-page">
    <section className="surface product-editor card-surface">
    <section className="surface product-admin-list card-surface">

Add `category-management-page` to the existing root class in `CategoryManagementPage.jsx`; do not change form fields, status values, or service handlers.

- [ ] **Step 2: Preserve upload limits and actions.**

    <input ref={inputRef} name="productImages" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => uploadFiles(event.target.files)} />
    {index > 0 && <button type="button" onClick={() => makeFeatured(index)}>Đặt làm ảnh chính</button>}
    <button className="danger" type="button" onClick={() => removeImage(index)}>Xóa ảnh</button>

- [ ] **Step 3: Add only scoped mobile form/table CSS.**

    .admin-catalog-page .product-editor, .admin-catalog-page .product-admin-list, .category-management-page .surface { background: var(--gh-paper); border: 1px solid var(--gh-border); }
    @media (max-width: 768px) { .admin-catalog-page .product-fields-grid { grid-template-columns: 1fr; } .admin-catalog-page .table-responsive { overflow: visible; } .admin-catalog-page .table tr { display: grid; gap: 8px; margin-bottom: 16px; padding: 16px; } }

- [ ] **Step 4: Verify and commit P38/P40.**

    npm test -- src/pages/public/ProductListingPage.test.js src/pages/public/ProductDetailPage.test.js src/pages/admin/ProductManagementPage.test.js src/pages/admin/CategoryManagementPage.test.js src/components/product/ProductCard.test.js src/components/product/ProductFilter.test.js src/services/productService.test.js src/services/categoryService.test.js src/services/cartService.test.js src/services/reviewService.test.js
    npm run build
    git add client/src/pages/admin/ProductManagementPage.jsx client/src/pages/admin/CategoryManagementPage.jsx client/src/components/product/ProductMediaManager.jsx client/src/styles/modules/admin-catalog.css
    git -c user.name="Phạm Thành Chung" -c user.email="chungthanhpham2112@gmail.com" commit -m "feat: refresh responsive admin catalog UI"

Expected: all tests PASS, build exits `0`, commit succeeds.

### Task 6: Full verification and handoff

- [ ] **Step 1: Run final checks.**

    npm test
    npm run build
    git diff main...HEAD --check
    git status --short

Expected: all tests PASS, build exits `0`, whitespace check has no output, and status contains only workstream changes.

- [ ] **Step 2: QA `/products` and `/products/:id` at 390/768/1024/1440 as Guest and Customer; QA `/admin/products` and `/admin/categories` at 390/1440 as Admin.** Verify API-derived name, price, SKU, image, stock, category and review values; Guest/non-Customer cart behavior; Active/Inactive only; upload limit/type behavior.

- [ ] **Step 3: Hand off.**

    git log --format=fuller main..HEAD
    git diff --stat main...HEAD

Expected: each commit is `Phạm Thành Chung <chungthanhpham2112@gmail.com>`. Nguyễn Ngọc Thành reviews, merges `--no-ff`, runs regression, pushes `main`, and deletes `feature/chung-responsive-catalog`.
