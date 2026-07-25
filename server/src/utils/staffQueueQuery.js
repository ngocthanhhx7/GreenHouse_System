const ApiError = require('./apiError');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 100000;
const MAX_SEARCH_LENGTH = 80;

function readScalar(value, fieldName) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value) || typeof value === 'object') {
    throw new ApiError(400, `${fieldName} must contain exactly one value`);
  }
  return String(value).trim();
}

function parsePositiveInteger(value, fieldName, fallback, maximum) {
  const normalized = readScalar(value, fieldName);
  if (!normalized) return fallback;
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new ApiError(400, `${fieldName} exceeds the allowed limit`);
  }
  return parsed;
}

function parseStaffQueueQuery(
  query = {},
  {
    allowedStatuses = null,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    maxPageSize = MAX_PAGE_SIZE,
  } = {},
) {
  const page = parsePositiveInteger(query.page, 'page', 1, MAX_PAGE);
  const pageSize = parsePositiveInteger(
    query.pageSize,
    'pageSize',
    defaultPageSize,
    maxPageSize,
  );
  const status = readScalar(query.status, 'status');
  if (status && allowedStatuses && !allowedStatuses.has(status)) {
    throw new ApiError(400, 'Invalid Staff queue status');
  }
  const search = readScalar(query.search, 'search');
  if (search.length > MAX_SEARCH_LENGTH || /[\u0000-\u001f\u007f]/.test(search)) {
    throw new ApiError(400, 'Staff queue search is invalid');
  }
  return {
    page,
    pageSize,
    search,
    status,
    skip: (page - 1) * pageSize,
  };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildStaffQueuePage(items, total, paging) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeTotal = Number.isSafeInteger(Number(total)) && Number(total) >= 0
    ? Number(total)
    : safeItems.length;
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / paging.pageSize);
  return {
    items: safeItems,
    total: safeTotal,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages,
    hasPreviousPage: paging.page > 1,
    hasNextPage: paging.page < totalPages,
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildStaffQueuePage,
  escapeRegex,
  parseStaffQueueQuery,
};
