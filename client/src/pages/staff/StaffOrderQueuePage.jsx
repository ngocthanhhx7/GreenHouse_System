import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';
import {
  createStaffQueueParams,
  normalizeStaffQueuePage,
  STAFF_QUEUE_PAGE_SIZE,
} from './staffQueuePage.js';

const STATUS_OPTIONS = [
  '', 'Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered',
  'DeliveryFailed', 'Cancelled', 'Returned',
];

export default function StaffOrderQueuePage() {
  const [status, setStatus] = useState('Pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [paging, setPaging] = useState(() => normalizeStaffQueuePage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setLoading(true);
      setError('');
      try {
        const result = await staffOrderService.listOrders(createStaffQueueParams({
          status,
          search,
          page,
          pageSize: STAFF_QUEUE_PAGE_SIZE,
        }));
        if (!cancelled) {
          const nextPage = normalizeStaffQueuePage(result, page, STAFF_QUEUE_PAGE_SIZE);
          setOrders(nextPage.items);
          setPaging(nextPage);
        }
      } catch (err) {
        if (!cancelled) {
          setOrders([]);
          setPaging(normalizeStaffQueuePage({}, page, STAFF_QUEUE_PAGE_SIZE));
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey, search, status]);

  function handleStatusChange(event) {
    setStatus(event.target.value);
    setPage(1);
  }

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
        <h1>Hàng đợi xử lý đơn</h1>
        <div className="d-flex flex-wrap gap-2">
          <form className="d-flex gap-2" role="search" onSubmit={handleSearch}>
            <input
              type="search"
              className="form-control"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Tìm mã đơn, người nhận, SĐT"
              aria-label="Tìm đơn hàng"
            />
            <button type="submit" className="btn btn-outline-success">Tìm</button>
          </form>
          <select className="form-select status-select" value={status} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option ? translateOrderStatus(option) : 'Tất cả trạng thái'}
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
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Thanh toán</th>
              <th>Trạng thái</th>
              <th>Tổng tiền</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="5" className="text-center text-muted">Đang tải đơn hàng...</td>
              </tr>
            )}
            {!loading && orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderCode}</td>
                <td>{translatePaymentMethod(order.paymentMethod)} / {translatePaymentStatus(order.paymentStatus)}</td>
                <td>{translateOrderStatus(order.orderStatus)}</td>
                <td>{formatCurrency(order.totalAmount)}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/orders/${order.id}`}>
                    Mở đơn
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && !orders.length && (
              <tr>
                <td colSpan="5" className="text-center text-muted">Không có đơn hàng trong trạng thái này.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="d-flex align-items-center justify-content-between gap-3 mt-3">
        <span className="text-secondary">Tổng: {paging.total} đơn hàng</span>
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
