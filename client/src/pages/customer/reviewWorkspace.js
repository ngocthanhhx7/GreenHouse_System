function valueId(value) {
  if (!value || typeof value !== 'object') return value;
  return value.id ?? value._id;
}

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function normalizeDetail(order, detail) {
  return {
    orderId: valueId(order),
    orderCode: order.orderCode || 'Đơn đã giao',
    deliveredAt: order.deliveredAt || order.completedSaleAt || order.createdAt || null,
    orderDetailId: valueId(detail),
    productId: valueId(detail.productId),
    productName: detail.productNameSnapshot || detail.productName || detail.name || 'Sản phẩm GreenHome',
    productImage: detail.productImageSnapshot || detail.productImage || '',
    sku: detail.productSkuSnapshot || detail.skuSnapshot || detail.sku || '',
  };
}

function snapshotError() {
  const error = new Error('Kh\u00f4ng th\u1ec3 \u0111\u1ed3ng b\u1ed9 danh s\u00e1ch \u0111\u00e1nh gi\u00e1. Vui l\u00f2ng th\u1eed l\u1ea1i.');
  error.code = 'REVIEW_SNAPSHOT_UNSTABLE';
  return error;
}

async function loadOwnReviewSnapshot(fetchPage, { pageSize, maxPages }) {
  const first = await fetchPage({ page: 1, pageSize });
  const firstItems = first?.items || [];
  const reportedPages = Number(first?.totalPages)
    || Math.ceil((Number(first?.total) || firstItems.length) / pageSize)
    || 1;
  const totalPages = Math.max(1, Math.floor(reportedPages));
  if (totalPages > maxPages) throw snapshotError();

  const expectedTotal = Number(first?.total);
  const pages = [first];
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(await fetchPage({ page, pageSize }));
  }

  const metadataStable = pages.every((result) => (
    Number(result?.total) === expectedTotal
    && Math.max(1, Math.floor(Number(result?.totalPages) || 1)) === totalPages
  ));
  const unique = new Map();
  let identitiesValid = true;
  for (const review of pages.flatMap((result) => result?.items || [])) {
    const id = valueId(review);
    if (!id || unique.has(String(id))) identitiesValid = false;
    else unique.set(String(id), review);
  }
  const countStable = Number.isInteger(expectedTotal)
    && expectedTotal >= 0
    && unique.size === expectedTotal;
  if (!metadataStable || !identitiesValid || !countStable) return null;

  return {
    identities: [...unique.keys()],
    items: [...unique.values()],
  };
}

export async function loadAllOwnReviews(
  fetchPage,
  { maxPages = 100, maxAttempts = 3 } = {},
) {
  const pageSize = 50;
  const boundedMaxPages = Math.min(100, Math.max(1, Math.floor(Number(maxPages) || 1)));
  const boundedAttempts = Math.min(5, Math.max(2, Math.floor(Number(maxAttempts) || 2)));
  let previous = null;

  for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
    const snapshot = await loadOwnReviewSnapshot(fetchPage, {
      pageSize,
      maxPages: boundedMaxPages,
    });
    if (
      snapshot
      && previous
      && snapshot.identities.length === previous.identities.length
      && snapshot.identities.every((id, index) => id === previous.identities[index])
    ) {
      return snapshot.items;
    }
    previous = snapshot;
  }
  throw snapshotError();
}

export function buildReviewWorkspace(orders = [], ownReviews = []) {
  const deliveredLines = orders
    .filter((order) => order?.orderStatus === 'Delivered')
    .flatMap((order) => (order.details || []).map((detail) => normalizeDetail(order, detail)))
    .filter((item) => item.orderDetailId && item.productId)
    .sort((left, right) => toTime(right.deliveredAt) - toTime(left.deliveredAt));

  const latestByProduct = new Map();
  deliveredLines.forEach((item) => {
    const key = String(item.productId);
    if (!latestByProduct.has(key)) latestByProduct.set(key, item);
  });

  const reviewedProducts = new Set(ownReviews.map((review) => String(valueId(review.productId))));
  const pending = [...latestByProduct.values()]
    .filter((item) => !reviewedProducts.has(String(item.productId)));
  const completed = ownReviews.map((review) => ({
    ...review,
    ...(latestByProduct.get(String(valueId(review.productId))) || {
      productId: valueId(review.productId),
      productName: 'Sản phẩm đã đánh giá',
      productImage: '',
      sku: '',
      orderCode: '',
      deliveredAt: null,
    }),
  }));

  return { pending, completed };
}
