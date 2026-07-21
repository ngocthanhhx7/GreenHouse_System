import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { adminService } from '../../services/adminService.js';
import { formatCurrency, translateOrderStatus } from '../../utils/formatters.js';
import { buildAdminOverviewQuery } from './adminDashboardQuery.js';

function StatBox({ label, value, icon }) {
  return (
    <div className="metric-box">
      <div className="metric-box-top">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

// Fallback when backend returns no data (e.g. empty DB)
const DEMO_REPORT = {
  orders: {
    total: 0,
    delivered: 0,
    returned: 0,
    byStatus: {},
  },
  revenue: { grossSales: 0, refunded: 0, netSales: 0 },
  products: { total: 0 },
  inventory: { totalRecords: 0, lowStock: 0 },
  support: { total: 0, open: 0, resolved: 0 },
  reviews: { total: 0, averageRating: 0 },
};

export default function AdminDashboardPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ from: '', to: '' });
  const [appliedPeriod, setAppliedPeriod] = useState({ from: '', to: '' });
  const isMountedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const loadReport = useCallback((period = {}) => {
    const requestId = ++requestSequenceRef.current;
    const params = buildAdminOverviewQuery(period) ? period : {};
    setReport(null);
    setError('');
    setLoading(true);
    adminService
      .getOverviewReport(params)
      .then((data) => {
        if (!isMountedRef.current || requestId !== requestSequenceRef.current) return;
        setReport(data || DEMO_REPORT);
      })
      .catch((err) => {
        if (!isMountedRef.current || requestId !== requestSequenceRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (!isMountedRef.current || requestId !== requestSequenceRef.current) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadReport();
    return () => {
      isMountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, [loadReport]);

  function handleApply(event) {
    event.preventDefault();
    if (dates.from && dates.to && dates.from > dates.to) {
      requestSequenceRef.current += 1;
      setReport(null);
      setError('Từ ngày phải trước hoặc bằng đến ngày.');
      setLoading(false);
      return;
    }
    setAppliedPeriod(dates);
    loadReport(dates);
  }

  function handleClear() {
    const allTime = { from: '', to: '' };
    setDates(allTime);
    setAppliedPeriod(allTime);
    loadReport();
  }

  const appliedPeriodLabel = appliedPeriod.from && appliedPeriod.to
    ? `Từ ${appliedPeriod.from} đến ${appliedPeriod.to}`
    : appliedPeriod.from
      ? `Từ ${appliedPeriod.from}`
      : appliedPeriod.to
        ? `Đến ${appliedPeriod.to}`
        : '';

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Tổng quan quản trị</h1>
        <div className="table-actions">
          <Link className="btn btn-outline-success" to="/admin/audit-logs">
            Nhật ký hệ thống
          </Link>
          <Link className="btn btn-outline-success" to="/admin/settings">
            Cấu hình
          </Link>
        </div>
      </div>
      <form className="table-actions mb-3" onSubmit={handleApply}>
        <label>
          Từ ngày
          <input
            type="date"
            className="form-control"
            value={dates.from}
            onChange={(event) => setDates((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            className="form-control"
            value={dates.to}
            onChange={(event) => setDates((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        <button type="submit" className="btn btn-success">Áp dụng</button>
        <button type="button" className="btn btn-outline-secondary" onClick={handleClear}>Xóa lọc</button>
      </form>
      {appliedPeriodLabel && <p className="text-secondary">Kỳ báo cáo: {appliedPeriodLabel}</p>}
      <div aria-busy={loading}>
        {loading && <div className="page-center" role="status" aria-live="polite">Đang tải báo cáo...</div>}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {report && !loading && (
        <>
          <div className="metrics-grid mb-4">
            <StatBox
              label="Đơn hàng"
              value={report.orders?.total ?? 0}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 11V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14"/><polyline points="16 11 22 11 22 17"/><path d="M8 19h8"/></svg>}
            />
            <StatBox
              label="Đã giao"
              value={report.orders?.delivered ?? 0}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
            />
            <StatBox
              label="Doanh thu đã thanh toán"
              value={formatCurrency(report.revenue?.grossSales ?? 0)}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
            />
            <StatBox label="Doanh thu thuần" value={formatCurrency(report.revenue?.netSales ?? 0)} />
            <StatBox
              label="Đã hoàn tiền"
              value={formatCurrency(report.revenue?.refunded ?? 0)}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7"/><polyline points="17 14 21 18 21 10"/><line x1="7" y1="14" x2="7.01" y2="14"/></svg>}
            />
            <StatBox
              label="Sản phẩm hiện có"
              value={report.products?.total ?? 0}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
            />
            <StatBox
              label="Sắp hết hiện tại"
              value={report.inventory?.lowStock ?? 0}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
            />
            <StatBox
              label="Hỗ trợ đang mở"
              value={report.support?.open ?? 0}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
            />
            <StatBox
              label="Đánh giá TB"
              value={Number(report.reviews?.averageRating ?? 0).toFixed(1)}
              icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            />
          </div>
          <h2>Trạng thái đơn hàng</h2>
          {Object.keys(report.orders?.byStatus || {}).length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th>Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.orders.byStatus).map(([status, count]) => (
                    <tr key={status}>
                      <td>{translateOrderStatus(status)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-secondary">Chưa có đơn hàng. Hãy thêm sản phẩm và kiểm tra trải nghiệm catalog trước.</p>
          )}
        </>
        )}
      </div>
    </div>
  );
}
