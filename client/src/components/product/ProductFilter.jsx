export default function ProductFilter({ filters, categories, onChange, onSubmit }) {
  return (
    <form className="catalog-filter" onSubmit={onSubmit}>
      <input
        id="catalog-keyword"
        aria-label="Từ khóa sản phẩm"
        className="form-control"
        placeholder="Tìm sản phẩm"
        value={filters.keyword}
        onChange={(event) => onChange({ ...filters, keyword: event.target.value })}
      />
      <select
        id="catalog-category"
        aria-label="Danh mục sản phẩm"
        className="form-select"
        value={filters.categoryId}
        onChange={(event) => onChange({ ...filters, categoryId: event.target.value })}
      >
        <option value="">Tất cả danh mục</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <input
        id="catalog-min-price"
        aria-label="Giá thấp nhất"
        className="form-control"
        type="number"
        min="0"
        placeholder="Giá từ"
        value={filters.minPrice}
        onChange={(event) => onChange({ ...filters, minPrice: event.target.value })}
      />
      <input
        id="catalog-max-price"
        aria-label="Giá cao nhất"
        className="form-control"
        type="number"
        min="0"
        placeholder="Giá đến"
        value={filters.maxPrice}
        onChange={(event) => onChange({ ...filters, maxPrice: event.target.value })}
      />
      <select
        id="catalog-availability"
        aria-label="Trạng thái còn hàng"
        className="form-select"
        value={filters.availability}
        onChange={(event) => onChange({ ...filters, availability: event.target.value })}
      >
        <option value="">Mọi trạng thái hàng</option>
        <option value="InStock">Còn hàng</option>
        <option value="OutOfStock">Hết hàng</option>
      </select>
      <button className="btn btn-success" type="submit">
        Lọc sản phẩm
      </button>
    </form>
  );
}
