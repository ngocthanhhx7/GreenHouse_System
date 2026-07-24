export default function ProductFilter({ filters, categories, onChange, onSubmit }) {
  return (
    <form className="catalog-filter" onSubmit={onSubmit}>
      <input
        className="form-control"
        placeholder="Tìm sản phẩm"
        value={filters.keyword}
        onChange={(event) => onChange({ ...filters, keyword: event.target.value })}
      />
      <select className="form-select" value={filters.categoryId} onChange={(event) => onChange({ ...filters, categoryId: event.target.value })}>
        <option value="">Tất cả danh mục</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <input
        className="form-control"
        type="number"
        min="0"
        placeholder="Giá từ"
        value={filters.minPrice}
        onChange={(event) => onChange({ ...filters, minPrice: event.target.value })}
      />
      <input
        className="form-control"
        type="number"
        min="0"
        placeholder="Giá đến"
        value={filters.maxPrice}
        onChange={(event) => onChange({ ...filters, maxPrice: event.target.value })}
      />
      <select
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
