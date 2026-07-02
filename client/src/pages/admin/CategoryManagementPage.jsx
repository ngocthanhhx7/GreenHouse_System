import { useEffect, useState } from 'react';

import { categoryService } from '../../services/categoryService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', status: 'Active' });
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
    try {
      await categoryService.createCategory(form);
      setForm({ name: '', description: '', status: 'Active' });
      await loadCategories();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Quản lý danh mục</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="admin-form compact" onSubmit={handleSubmit}>
        <input className="form-control" placeholder="Tên danh mục" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className="form-control" placeholder="Mô tả" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <select className="form-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="Active">Đang hoạt động</option>
          <option value="Inactive">Ngừng hoạt động</option>
        </select>
        <button className="btn btn-success" type="submit">
          Tạo danh mục
        </button>
      </form>
      <div className="table-responsive mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Mô tả</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.description}</td>
                <td>{translateRequestStatus(category.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
