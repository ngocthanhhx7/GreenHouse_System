import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';
import { getWarehouseDashboardStats } from './warehouseDashboardStats.js';

function StatBox({ label, value, icon, variant }) {
  return (
    <div className={`metric-box${variant === 'warn' ? ' metric-box-warn' : ''}`}>
      <div className="metric-box-top">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

export default function WarehouseDashboardPage() {
  const [stats, setStats] = useState({
    totalItems: null,
    lowStock: null,
    pendingExports: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [inventory, lowStock, stockExports] = await Promise.all([
          inventoryService.listInventory(),
          inventoryService.listLowStock(),
          inventoryService.listStockExports(),
        ]);
        if (!cancelled) {
          setStats(getWarehouseDashboardStats({ inventory, lowStock, stockExports }));
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

  if (loading) return <div className="page-center">Đang tải số liệu kho...</div>;

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Tổng quan kho</h1>
      </div>
      {error && <div className="alert alert-warning">Không tải được số liệu kho: {error}</div>}
      <div className="metrics-grid mb-4">
        <StatBox
          label="Mặt hàng tồn kho"
          value={stats.totalItems ?? '—'}
          icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>}
        />
        <StatBox
          label="Cảnh báo sắp hết"
          value={stats.lowStock ?? '—'}
          variant="warn"
          icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
        />
        <StatBox
          label="Phiếu xuất chờ xử lý"
          value={stats.pendingExports ?? '—'}
          icon={<svg className="metric-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
        />
      </div>
      <div className="dashboard-actions">
        <Link className="btn btn-success" to="/warehouse/inventory">
          Tồn kho
        </Link>
        <Link className="btn btn-outline-success" to="/warehouse/stock-exports">
          Hàng đợi xuất kho
        </Link>
        <Link className="btn btn-outline-success" to="/warehouse/low-stock">
          Sắp hết hàng
        </Link>
        <Link className="btn btn-outline-success" to="/warehouse/replenishments">
          Bổ sung hàng
        </Link>
      </div>
    </div>
  );
}
