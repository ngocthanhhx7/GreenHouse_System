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

export async function loadAllOwnReviews(fetchPage, { maxPages = 100 } = {}) {
  const pageSize = 50;
  const boundedMaxPages = Math.max(1, Math.floor(Number(maxPages) || 1));
  const first = await fetchPage({ page: 1, pageSize });
  const reviews = [...(first?.items || [])];
  const reportedPages = Number(first?.totalPages)
    || Math.ceil((Number(first?.total) || reviews.length) / pageSize)
    || 1;
  const totalPages = Math.max(1, Math.floor(reportedPages));
  if (totalPages > boundedMaxPages) {
    throw new Error(`Review page bound exceeded (${totalPages} > ${boundedMaxPages})`);
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await fetchPage({ page, pageSize });
    reviews.push(...(result?.items || []));
  }
  return reviews;
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
