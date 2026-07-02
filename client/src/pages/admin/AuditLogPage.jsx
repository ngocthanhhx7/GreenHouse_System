import { useEffect, useState } from 'react';

import { adminService } from '../../services/adminService.js';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ action: '', userId: '', from: '', to: '' });
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function loadLogs(nextFilters = filters) {
    setError('');
    try {
      const result = await adminService.listAuditLogs(nextFilters);
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitFilters(event) {
    event.preventDefault();
    loadLogs(filters);
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Nhật ký hệ thống</h1>
        <button className="btn btn-outline-success" type="button" onClick={() => loadLogs(filters)}>Làm mới</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <form className="admin-form compact mb-4" onSubmit={submitFilters}>
        <input
          className="form-control"
          placeholder="Hành động"
          value={filters.action}
          onChange={(event) => updateFilter('action', event.target.value)}
        />
        <input
          className="form-control"
          placeholder="Mã người dùng"
          value={filters.userId}
          onChange={(event) => updateFilter('userId', event.target.value)}
        />
        <input
          className="form-control"
          type="datetime-local"
          value={filters.from}
          onChange={(event) => updateFilter('from', event.target.value)}
        />
        <input
          className="form-control"
          type="datetime-local"
          value={filters.to}
          onChange={(event) => updateFilter('to', event.target.value)}
        />
        <button className="btn btn-success" type="submit">Lọc</button>
      </form>
      <div className="table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Hành động</th>
              <th>Người dùng</th>
              <th>Đối tượng</th>
              <th>Mô tả</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.timestamp)}</td>
                <td>{item.action}</td>
                <td>{item.userId || '-'}</td>
                <td>{item.targetEntity} {item.targetId || ''}</td>
                <td>{item.description || '-'}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td className="text-center text-muted" colSpan="5">Không tìm thấy nhật ký hệ thống.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
