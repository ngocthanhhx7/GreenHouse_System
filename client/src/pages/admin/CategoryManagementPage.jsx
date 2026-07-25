import { useEffect, useState } from 'react';

import { categoryService } from '../../services/categoryService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', status: 'Active' });
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [activeProductIds, setActiveProductIds] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadCategories() {
    setCategories(await categoryService.listAdminCategories());
  }

  useEffect(() => {
    loadCategories().catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setActiveProductIds([]);
    setActiveProducts([]);
    try {
      if (editingCategoryId) {
        await categoryService.updateCategory(editingCategoryId, form);
      } else {
        await categoryService.createCategory(form);
      }
      setMessage(editingCategoryId ? 'Danh mục đã được cập nhật.' : 'Danh mục đã được tạo.');
      setForm({ name: '', description: '', status: 'Active' });
      setEditingCategoryId(null);
      await loadCategories();
    } catch (err) {
      setError(err.message);
      if (err.errorCode === 'CATEGORY_ACTIVE_PRODUCTS') {
        setActiveProductIds(err.data?.activeProductIds || []);
        setActiveProducts(err.data?.activeProducts || []);
      }
    }
  }

  function startEditing(category) {
    setEditingCategoryId(category.id);
    setForm({
      name: category.name,
      description: category.description || '',
      status: category.status,
    });
    setError('');
    setMessage('');
    setActiveProductIds([]);
    setActiveProducts([]);
  }

  function cancelEditing() {
    setEditingCategoryId(null);
    setForm({ name: '', description: '', status: 'Active' });
    setError('');
    setActiveProductIds([]);
    setActiveProducts([]);
  }

  async function updateCategoryStatus(category) {
    setError('');
    setMessage('');
    setActiveProductIds([]);
    setActiveProducts([]);
    try {
      const status = category.status === 'Active' ? 'Inactive' : 'Active';
      await categoryService.updateCategory(category.id, { status });
      setMessage(status === 'Active' ? 'Danh mục đã được kích hoạt.' : 'Danh mục đã ngừng hoạt động.');
      await loadCategories();
    } catch (err) {
      setError(err.message);
      if (err.errorCode === 'CATEGORY_ACTIVE_PRODUCTS') {
        setActiveProductIds(err.data?.activeProductIds || []);
        setActiveProducts(err.data?.activeProducts || []);
      }
    }
  }

  return (
    <div className="surface">
      <h1>Quản lý danh mục</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {activeProductIds.length > 0 && (
        <div className="alert alert-warning">
          <strong>Sản phẩm đang hoạt động ngăn chặn thao tác này:</strong>
          <ul className="mb-0">
            {activeProducts.map((product) => (
              <li key={product.id}>{product.name} ({product.sku})</li>
            ))}
          </ul>
          <small>Hãy chuyển danh mục hoặc ngừng bán các sản phẩm này trước.</small>
        </div>
      )}
      <form className="admin-form compact" onSubmit={handleSubmit}>
        <input className="form-control" placeholder="Tên danh mục" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className="form-control" placeholder="Mô tả" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <select className="form-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="Active">Đang hoạt động</option>
          <option value="Inactive">Ngừng hoạt động</option>
        </select>
        <button className="btn btn-success" type="submit">
          {editingCategoryId ? 'Lưu thay đổi' : 'Tạo danh mục'}
        </button>
        {editingCategoryId && (
          <button className="btn btn-outline-secondary" type="button" onClick={cancelEditing}>
            Hủy chỉnh sửa
          </button>
        )}
      </form>
      <div className="table-responsive mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Mô tả</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.description}</td>
                <td>{translateRequestStatus(category.status)}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" onClick={() => startEditing(category)}>Chỉnh sửa</button>
                    <button
                      className={category.status === 'Active' ? 'danger' : ''}
                      type="button"
                      onClick={() => updateCategoryStatus(category)}
                    >
                      {category.status === 'Active' ? 'Ngừng hoạt động' : 'Kích hoạt'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
