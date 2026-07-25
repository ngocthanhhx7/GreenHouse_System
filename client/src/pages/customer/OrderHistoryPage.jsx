import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { resolveMediaUrl } from '../../services/apiClient.js';
import { orderService } from '../../services/orderService.js';
import { formatCurrency, translateOrderStatus, translatePaymentMethod, translatePaymentStatus } from '../../utils/formatters.js';
import {
  ORDER_TABS,
  filterOrdersByTab,
  getOrderActions,
  orderTabFor,
} from './orderHistoryView.js';
import '../../styles/modules/customer-orders.css';

function formatOrderDate(value) {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    orderService.listMyOrdersWithDetails()
      .then((items) => {
        if (current) setOrders(items);
      })
      .catch(() => {
        if (current) setError('Không thể tải đơn hàng của bạn. Vui lòng thử lại.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, []);

  const visibleOrders = filterOrdersByTab(orders, activeTab);
  const tabCount = (tabId) => (
    tabId === 'all' ? orders.length : orders.filter((order) => orderTabFor(order) === tabId).length
  );

  return (
    <div className="customer-order-center">
      <div className="page-heading customer-order-heading">
        <div>
          <span className="eyebrow">Tài khoản khách hàng</span>
          <h1>Đơn hàng của tôi</h1>
          <p>Theo dõi hành trình giao hàng và thực hiện thao tác phù hợp cho từng đơn.</p>
        </div>
        <Link className="btn btn-outline-success" to="/products">Mua thêm sản phẩm</Link>
      </div>

      <nav className="order-status-tabs" aria-label="Lọc đơn hàng theo trạng thái">
        {ORDER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}<span>{tabCount(tab.id)}</span>
          </button>
        ))}
      </nav>

      {loading && <div className="order-state-card" role="status">Đang tải đơn hàng…</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {!loading && !error && (
        <div className="order-card-list" aria-live="polite">
          {visibleOrders.map((order) => {
            const actions = getOrderActions(order);
            const orderId = order.id || order._id;
            return (
              <article className="order-card" key={orderId}>
                <header className="order-card-header">
                  <div>
                    <span>Mã đơn</span>
                    <strong>{order.orderCode}</strong>
                    <small>Đặt lúc {formatOrderDate(order.createdAt)}</small>
                  </div>
                  <span className={`order-status order-status--${orderTabFor(order)}`}>
                    {translateOrderStatus(order.orderStatus)}
                  </span>
                </header>

                <div className="order-product-list">
                  {(order.details || []).map((detail) => (
                    <div className="order-product-row" key={detail.id || detail._id}>
                      <div className="order-product-image">
                        {detail.productImageSnapshot
                          ? <img src={resolveMediaUrl(detail.productImageSnapshot)} alt="" />
                          : <span aria-hidden="true">GH</span>}
                      </div>
                      <div className="order-product-copy">
                        <strong>{detail.productNameSnapshot || 'Sản phẩm GreenHome'}</strong>
                        <span>SKU: {detail.productSkuSnapshot || 'Chưa cập nhật'}</span>
                        <span>Số lượng: {detail.quantity}</span>
                      </div>
                      <strong className="order-product-price">
                        {formatCurrency(detail.subtotal ?? Number(detail.priceSnapshot || 0) * Number(detail.quantity || 0))}
                      </strong>
                    </div>
                  ))}
                  {!order.details?.length && (
                    <p className="order-detail-warning">
                      {order.detailLoadError || 'Đơn hàng chưa có thông tin sản phẩm.'}
                    </p>
                  )}
                </div>

                <footer className="order-card-footer">
                  <div className="order-payment-summary">
                    <span>{translatePaymentMethod(order.paymentMethod)} · {translatePaymentStatus(order.paymentStatus)}</span>
                    <strong>Thành tiền: {formatCurrency(order.totalAmount)}</strong>
                  </div>
                  <div className="order-card-actions">
                    <Link className="btn btn-outline-success btn-sm" to={`/orders/${orderId}`}>Xem chi tiết</Link>
                    {actions.canPay && <Link className="btn btn-success btn-sm" to={`/orders/${orderId}/payment`}>Thanh toán</Link>}
                    {actions.canCancel && <Link className="btn btn-outline-danger btn-sm" to={`/orders/${orderId}`}>Hủy đơn</Link>}
                    {actions.canReview && <Link className="btn btn-success btn-sm" to={`/reviews?orderId=${orderId}`}>Đánh giá</Link>}
                    <Link className="btn btn-outline-secondary btn-sm" to="/products">Mua lại</Link>
                  </div>
                </footer>
              </article>
            );
          })}
          {!visibleOrders.length && (
            <div className="order-state-card">
              <strong>Chưa có đơn hàng trong mục này.</strong>
              <p>Khám phá sản phẩm GreenHome để bắt đầu đơn hàng mới.</p>
              <Link className="btn btn-success btn-sm" to="/products">Khám phá sản phẩm</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
