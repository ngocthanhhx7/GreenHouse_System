export default function ProductFilter({ filters, categories, onChange, onSubmit }) {
  return (
    <form className="catalog-filter" onSubmit={onSubmit}>
      <input
        className="form-control"
        placeholder="Search products"
        value={filters.keyword}
        onChange={(event) => onChange({ ...filters, keyword: event.target.value })}
      />
      <select className="form-select" value={filters.categoryId} onChange={(event) => onChange({ ...filters, categoryId: event.target.value })}>
        <option value="">All categories</option>
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
        placeholder="Min price"
        value={filters.minPrice}
        onChange={(event) => onChange({ ...filters, minPrice: event.target.value })}
      />
      <input
        className="form-control"
        type="number"
        min="0"
        placeholder="Max price"
        value={filters.maxPrice}
        onChange={(event) => onChange({ ...filters, maxPrice: event.target.value })}
      />
      <button className="btn btn-success" type="submit">
        Filter
      </button>
    </form>
  );
}
