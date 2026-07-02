import { useEffect, useState } from 'react';

import { categoryService } from '../../services/categoryService.js';
import { productService } from '../../services/productService.js';
import { formatCurrency, translateRequestStatus } from '../../utils/formatters.js';

const emptyProduct = { name: '', description: '', imageUrls: '', price: '', stockQuantity: '', unit: 'cái', categoryId: '', status: 'Active' };

export default function ProductManagementPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [error, setError] = useState('');

  async function loadData() {
    const [productData, categoryData] = await Promise.all([productService.listAdminProducts(), categoryService.listAdminCategories()]);
    setProducts(productData);
    setCategories(categoryData.filter((category) => category.status === 'Active'));
  }

  useEffect(() => {
    loadData().catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await productService.createProduct({
        ...form,
        price: Number(form.price),
        stockQuantity: Number(form.stockQuantity || 0),
        imageUrls: form.imageUrls ? [form.imageUrls] : [],
      });
      setForm(emptyProduct);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="surface">
      <h1>Quản lý sản phẩm</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="admin-form" onSubmit={handleSubmit}>
        <input className="form-control" placeholder="Tên sản phẩm" value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
        <input className="form-control" placeholder="URL hình ảnh" value={form.imageUrls} onChange={(event) => updateField('imageUrls', event.target.value)} />
        <input className="form-control" type="number" min="0" placeholder="Giá bán" value={form.price} onChange={(event) => updateField('price', event.target.value)} required />
        <input className="form-control" type="number" min="0" placeholder="Số lượng tồn" value={form.stockQuantity} onChange={(event) => updateField('stockQuantity', event.target.value)} required />
        <input className="form-control" placeholder="Đơn vị" value={form.unit} onChange={(event) => updateField('unit', event.target.value)} required />
        <select className="form-select" value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)} required>
          <option value="">Chọn danh mục</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <textarea className="form-control" placeholder="Mô tả" value={form.description} onChange={(event) => updateField('description', event.target.value)} />
        <button className="btn btn-success" type="submit">
          Tạo sản phẩm
        </button>
      </form>
      <div className="table-responsive mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Giá</th>
              <th>Tồn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{formatCurrency(product.price)}</td>
                <td>{Number(product.stockQuantity || 0)}</td>
                <td>{translateRequestStatus(product.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
