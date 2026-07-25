import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { exchangeService } from '../../services/exchangeService.js';
import { translateExchangeStatus } from '../../utils/afterSalesLabels.js';
import {
  createStaffQueueParams,
  normalizeStaffQueuePage,
  STAFF_QUEUE_PAGE_SIZE,
} from './staffQueuePage.js';

const STATUSES = [
  '', 'AwaitingCODReconciliation', 'CODRecoveryInProgress', 'ClosedByCODRecovery',
  'Submitted', 'AwaitingExactStockChoice',
  'WaitingForExactStock', 'ApprovedAwaitingShipment', 'CustomerShipped',
  'WarehouseInspecting', 'OutboundFulfillment', 'ReplacementShipped',
  'DeliveryIncident', 'Rejected', 'Cancelled', 'Expired',
  'ClosedNoExchange', 'ConvertedToReturnRefund', 'Completed',
];

export default function ExchangeQueuePage() {
  const [status, setStatus] = useState('Submitted');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [paging, setPaging] = useState(() => normalizeStaffQueuePage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await exchangeService.listStaffRequests(createStaffQueueParams({
          status,
          search,
          page,
          pageSize: STAFF_QUEUE_PAGE_SIZE,
        }));
        if (!cancelled) {
          const nextPage = normalizeStaffQueuePage(result, page, STAFF_QUEUE_PAGE_SIZE);
          setItems(nextPage.items);
          setPaging(nextPage);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setPaging(normalizeStaffQueuePage({}, page, STAFF_QUEUE_PAGE_SIZE));
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
  }, [page, reloadKey, search, status]);

  function handleSearch(event) {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    setPage(1);
    if (nextSearch === search && page === 1) {
      setReloadKey((value) => value + 1);
    } else {
      setSearch(nextSearch);
    }
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Hàng đợi đổi hàng</h1>
        <div className="d-flex flex-wrap gap-2">
          <form className="d-flex gap-2" role="search" onSubmit={handleSearch}>
            <input
              type="search"
              className="form-control"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Tìm mã yêu cầu"
              aria-label="Tìm yêu cầu đổi hàng"
            />
            <button type="submit" className="btn btn-outline-success">Tìm</button>
          </form>
          <select
            className="form-select status-select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {STATUSES.map((item) => (
              <option key={item || 'all'} value={item}>
                {item ? translateExchangeStatus(item) : 'Tất cả trạng thái'}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="alert alert-danger d-flex align-items-center justify-content-between gap-3">
          <span>{error}</span>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setReloadKey((value) => value + 1)}>
            Thử lại
          </button>
        </div>
      )}
      <div className="table-responsive" aria-busy={loading}>
        <table className="table">
          <thead><tr><th>Mã yêu cầu</th><th>Trạng thái</th><th>Lý do Customer</th><th></th></tr></thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="4" className="text-center text-muted">Đang tải yêu cầu...</td>
              </tr>
            )}
            {!loading && items.map((item) => (
              <tr key={item.id}>
                <td>{item.requestCode}</td><td>{translateExchangeStatus(item.status)}</td><td>{item.reason}</td>
                <td><Link className="btn btn-outline-success btn-sm" to={`/staff/exchanges/${item.id}`}>Mở yêu cầu</Link></td>
              </tr>
            ))}
            {!loading && !items.length && <tr><td colSpan="4" className="text-center text-muted">Không có yêu cầu.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="d-flex align-items-center justify-content-between gap-3 mt-3">
        <span className="text-secondary">Tổng: {paging.total} yêu cầu</span>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-success"
            disabled={loading || !paging.hasPreviousPage}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Trang trước
          </button>
          <span>Trang {paging.page}/{Math.max(1, paging.totalPages)}</span>
          <button
            type="button"
            className="btn btn-outline-success"
            disabled={loading || !paging.hasNextPage}
            onClick={() => setPage((value) => value + 1)}
          >
            Trang sau
          </button>
        </div>
      </div>
    </div>
  );
}
