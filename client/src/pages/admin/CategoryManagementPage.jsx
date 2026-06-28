import { useEffect, useState } from 'react';

import { categoryService } from '../../services/categoryService.js';

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
      <h1>Category Management</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="admin-form compact" onSubmit={handleSubmit}>
        <input className="form-control" placeholder="Category name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className="form-control" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <select className="form-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button className="btn btn-success" type="submit">
          Create category
        </button>
      </form>
      <div className="table-responsive mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.description}</td>
                <td>{category.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
