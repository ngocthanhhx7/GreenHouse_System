export const STAFF_QUEUE_PAGE_SIZE = 20;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createStaffQueueParams({
  status = '',
  search = '',
  page = 1,
  pageSize = STAFF_QUEUE_PAGE_SIZE,
} = {}) {
  const params = {
    page: positiveInteger(page, 1),
    pageSize: positiveInteger(pageSize, STAFF_QUEUE_PAGE_SIZE),
  };
  const normalizedStatus = String(status || '').trim();
  const normalizedSearch = String(search || '').trim();

  if (normalizedStatus) params.status = normalizedStatus;
  if (normalizedSearch) params.search = normalizedSearch;

  return {
    ...(params.status ? { status: params.status } : {}),
    ...(params.search ? { search: params.search } : {}),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export function normalizeStaffQueuePage(
  response = {},
  requestedPage = 1,
  requestedPageSize = STAFF_QUEUE_PAGE_SIZE,
) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const page = positiveInteger(response?.page, positiveInteger(requestedPage, 1));
  const pageSize = positiveInteger(
    response?.pageSize,
    positiveInteger(requestedPageSize, STAFF_QUEUE_PAGE_SIZE),
  );
  const total = nonNegativeInteger(response?.total, items.length);
  const totalPages = nonNegativeInteger(
    response?.totalPages,
    total === 0 ? 0 : Math.ceil(total / pageSize),
  );

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasPreviousPage: typeof response?.hasPreviousPage === 'boolean'
      ? response.hasPreviousPage
      : page > 1,
    hasNextPage: typeof response?.hasNextPage === 'boolean'
      ? response.hasNextPage
      : page < totalPages,
  };
}
