import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import { returnRefundService } from '../../services/returnRefundService.js';
import { supportService } from '../../services/supportService.js';
import { toStaffDashboardStats } from './staffDashboardStats.js';

function StatBox({ label, value, icon }) {
  return (
    <div className="metric-box">
      <div className="metric-box-top">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong className="metric-value">{value ?? '—'}</strong>
    </div>
  );
}

export default function StaffDashboardPage() {
  const [stats, setStats] = useState({
    pendingOrders: null,
    pendingReturns: null,
    openSupport: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [orders, returns, newSupport, inProgressSupport] = await Promise.all([
          staffOrderService.listOrders({ status: 'Pending' }),
          returnRefundService.listStaffRequests({ status: 'New' }),
          supportService.listStaffRequests({ status: 'New' }),
          supportService.listStaffRequests({ status: 'InProgress' }),
        ]);
        if (!cancelled) {
          setStats(toStaffDashboardStats({
            orders,
            returns,
            newSupport,
            openSupport: { total: 0 },
            inProgressSupport,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="page-center">Đang tải công việc...</div>;

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Tổng quan xử lý đơn</h1>
      </div>
      {error && <div className="alert alert-warning">Không tải được số liệu xử lý đơn: {error}</div>}
      <div className="metrics-grid mb-4">
        <StatBox
          label="Đơn chờ xử lý"
          value={stats.pendingOrders}
          icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 11V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14"/><polyline points="16 11 22 11 22 17"/><path d="M8 19h8"/></svg>}
        />
        <StatBox
          label="Đổi trả chờ duyệt"
          value={stats.pendingReturns}
          icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7"/><polyline points="17 14 21 18 21 10"/><line x1="7" y1="14" x2="7.01" y2="14"/></svg>}
        />
        <StatBox
          label="Hỗ trợ đang mở"
          value={stats.openSupport}
          icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
        />
      </div>
      <div className="dashboard-actions">
        <Link className="btn btn-success" to="/staff/orders">
          Mở hàng đợi đơn hàng
        </Link>
        <Link className="btn btn-outline-success" to="/staff/return-refunds">
          Hàng đợi đổi trả
        </Link>
        <Link className="btn btn-outline-success" to="/staff/support-requests">
          Hàng đợi hỗ trợ
        </Link>
      </div>
    </div>
  );
}
