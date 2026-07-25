import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import ProductCard from '../../components/product/ProductCard.jsx';
import ProductFilter from '../../components/product/ProductFilter.jsx';
import { categoryService } from '../../services/categoryService.js';
import { productService } from '../../services/productService.js';
import { translateApiError } from '../../utils/errorMessages.js';

export default function ProductListingPage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    keyword: searchParams.get('keyword') || '',
    categoryId: searchParams.get('categoryId') || '',
    minPrice: '',
    maxPrice: '',
    availability: '',
    page: 1,
    pageSize: 12,
  });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  async function loadProducts(nextFilters = filters) {
    setLoading(true);
    setError('');
    setFieldErrors({});
    try {
      const result = await productService.listProducts(nextFilters);
      setProducts(result.items || result || []);
      setPagination({
        page: result.page || nextFilters.page || 1,
        pageSize: result.pageSize || nextFilters.pageSize,
        total: result.total || 0,
        totalPages: result.totalPages || 0,
      });
    } catch (err) {
      setError(translateApiError(err));
      setFieldErrors((err.errors || []).reduce((current, item) => ({
        ...current,
        [item.field]: item.message,
      }), {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => setCategories([]));
    const nextFilters = {
      keyword: searchParams.get('keyword') || '',
      categoryId: searchParams.get('categoryId') || '',
      minPrice: '',
      maxPrice: '',
      availability: '',
      page: 1,
      pageSize: 12,
    };
    setFilters(nextFilters);
    loadProducts(nextFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSubmit(event) {
    event.preventDefault();
    const nextFilters = { ...filters, page: 1 };
    setFilters(nextFilters);
    loadProducts(nextFilters);
  }

  function changePage(page) {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    loadProducts(nextFilters);
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
        {Object.entries(fieldErrors).map(([field, message]) => (
          <div className="field-error mt-2" role="alert" key={field}>
            {message}
          </div>
        ))}
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
        {!loading && pagination.totalPages > 1 && (
          <nav className="catalog-pagination" aria-label="Phân trang sản phẩm">
            <button
              className="btn btn-outline-success"
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => changePage(pagination.page - 1)}
            >
              Trang trước
            </button>
            <span>Trang {pagination.page}/{pagination.totalPages} · {pagination.total} sản phẩm</span>
            <button
              className="btn btn-outline-success"
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => changePage(pagination.page + 1)}
            >
              Trang sau
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
