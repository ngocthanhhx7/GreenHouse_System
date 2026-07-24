function collapseWhitespace(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function normalizeCategoryIdentity(value) {
  return collapseWhitespace(value).toLocaleLowerCase('vi');
}

function normalizeSearchText(value) {
  return collapseWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi');
}

function buildProductSearchText({ name = '', sku = '', description = '' } = {}) {
  return normalizeSearchText(`${name} ${sku} ${description}`);
}

module.exports = {
  collapseWhitespace,
  normalizeCategoryIdentity,
  normalizeSearchText,
  buildProductSearchText,
};
