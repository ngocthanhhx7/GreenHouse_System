import { useEffect, useState } from 'react';

import { adminAccountService } from '../../services/adminAccountService.js';

export default function AccountManagementPage() {
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ query: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await adminAccountService.listAccounts(filters);
      setAccounts(result?.items || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleStatus(account) {
    const nextStatus = account.status === 'Active' ? 'Disabled' : 'Active';
    const reason = window.prompt('Nhập lý do thay đổi trạng thái:');
    if (!reason) return;
    setBusy(account.id);
    try {
      await adminAccountService.changeStatus(account.id, {
        nextStatus,
        reason,
        expectedVersion: account.version,
      });
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <div><span className="eyebrow">Quản trị</span><h1>Quản lý tài khoản</h1></div>
      </div>
      <form className="table-actions mb-3" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <input aria-label="Tìm kiếm tài khoản" placeholder="Email hoặc họ tên" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
        <select aria-label="Lọc trạng thái" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">Tất cả trạng thái</option><option value="Active">Hoạt động</option><option value="Disabled">Đã vô hiệu hóa</option>
        </select>
        <button className="btn btn-success" type="submit">Lọc</button>
      </form>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div aria-busy={loading}>
        {loading ? <div className="page-center" role="status">Đang tải tài khoản…</div> : (
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.fullName}</td><td>{account.email}</td><td>{account.role}</td><td>{account.status}</td>
                    <td><button className="btn btn-outline-secondary" type="button" disabled={busy === account.id} onClick={() => toggleStatus(account)}>{account.status === 'Active' ? 'Vô hiệu hóa' : 'Kích hoạt'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!accounts.length && <div className="account-empty">Không có tài khoản phù hợp.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
