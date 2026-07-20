function canonicalizeSku(sku) {
  return sku === undefined || sku === null ? '' : String(sku).trim().toUpperCase();
}

module.exports = {
  canonicalizeSku,
};
