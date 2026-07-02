import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import ProductCard from '../../components/product/ProductCard.jsx';
import ProductFilter from '../../components/product/ProductFilter.jsx';
import { categoryService } from '../../services/categoryService.js';
import { productService } from '../../services/productService.js';

export default function ProductListingPage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    keyword: searchParams.get('keyword') || '',
    categoryId: '',
    minPrice: '',
    maxPrice: '',
  });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadProducts(nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const result = await productService.listProducts(nextFilters);
      setProducts(result.items || result || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => setCategories([]));
    loadProducts({
      keyword: searchParams.get('keyword') || '',
      categoryId: '',
      minPrice: '',
      maxPrice: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSubmit(event) {
    event.preventDefault();
    loadProducts(filters);
  }

  return (
    <main className="public-page catalog-page">
      <div className="catalog-shell">
        <div className="catalog-heading">
          <span className="eyebrow">Catalog GreenHome</span>
          <h1>Sản phẩm nhà bếp</h1>
          <p>Tìm theo tên, danh mục hoặc khoảng giá để nhanh chóng chọn món phù hợp căn bếp của bạn.</p>
        </div>
        <ProductFilter filters={filters} categories={categories} onChange={setFilters} onSubmit={handleSubmit} />
        {error && <div className="alert alert-danger mt-3">{error}</div>}
        {loading && <p className="text-secondary mt-3">Đang tải sản phẩm...</p>}
        {!loading && (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id || product._id} product={product} />
            ))}
          </div>
        )}
        {!loading && !products.length && !error && (
          <div className="empty-state mt-3">
            <h2>Không tìm thấy sản phẩm phù hợp</h2>
            <p>Thử bỏ bớt bộ lọc hoặc tìm bằng từ khóa ngắn hơn.</p>
          </div>
        )}
      </div>
    </main>
  );
}
