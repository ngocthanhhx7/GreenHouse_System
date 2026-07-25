import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const detailPage = readFileSync(join(process.cwd(), 'src/pages/public/ProductDetailPage.jsx'), 'utf8');
const listingPage = readFileSync(join(process.cwd(), 'src/pages/public/ProductListingPage.jsx'), 'utf8');
const reviewPanel = readFileSync(join(process.cwd(), 'src/components/review/ProductReviewPanel.jsx'), 'utf8');

describe('product detail catalog contract', () => {
  it('renders the SKU label through the product SKU formatter', () => {
    assert.match(detailPage, /className="product-sku"/);
    assert.match(detailPage, /formatProductSku\(product\.sku\)/);
  });

  it('formats product price from API currency with a VND fallback', () => {
    assert.match(detailPage, /formatProductCurrency\(product\)/);
  });

  it('keeps product reviews public-only and moves customer mutations elsewhere', () => {
    assert.match(reviewPanel, /PublicReviewList/);
    assert.doesNotMatch(reviewPanel, /createReview|updateReview|setPublication|listEligibility|<form/);
  });

  it('renders explicit loading and error states instead of a blank public page', () => {
    assert.match(detailPage, /if \(error\)[\s\S]*role=|"alert alert-danger"/);
    assert.match(detailPage, /Đang tải sản phẩm/);
    assert.match(detailPage, /Quay lại danh sách sản phẩm/);
    assert.match(listingPage, /loading &&[\s\S]*Đang tải sản phẩm/);
    assert.match(listingPage, /error &&[\s\S]*alert alert-danger/);
    assert.match(listingPage, /!products\.length && !error/);
  });
});
