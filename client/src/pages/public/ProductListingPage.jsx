import { useEffect, useState } from 'react';

import ProductCard from '../../components/product/ProductCard.jsx';
import ProductFilter from '../../components/product/ProductFilter.jsx';
import { categoryService } from '../../services/categoryService.js';
import { productService } from '../../services/productService.js';

export default function ProductListingPage() {
  const [filters, setFilters] = useState({ keyword: '', categoryId: '', minPrice: '', maxPrice: '' });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');

  async function loadProducts(nextFilters = filters) {
    setError('');
    try {
      const result = await productService.listProducts(nextFilters);
      setProducts(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => setCategories([]));
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    loadProducts(filters);
  }

  return (
    <main className="public-page catalog-page">
      <div className="surface">
        <h1>Products</h1>
        <ProductFilter filters={filters} categories={categories} onChange={setFilters} onSubmit={handleSubmit} />
        {error && <div className="alert alert-danger mt-3">{error}</div>}
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {!products.length && !error && <p className="text-secondary mt-3">No products found.</p>}
      </div>
    </main>
  );
}
