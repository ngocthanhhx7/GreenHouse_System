import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { cartService } from '../../services/cartService.js';
import { createCartCommandRetryStore } from '../../services/cartCommandRetry.js';
import { useCart } from '../../contexts/CartContext.jsx';
import { formatCurrency } from '../../utils/formatters.js';
import { translateApiError } from '../../utils/errorMessages.js';

const ISSUE_LABELS = {
  PriceChanged: 'Giá đã thay đổi; vui lòng kiểm tra giá hiện tại.',
  Unavailable: 'Sản phẩm hoặc danh mục không còn được bán.',
  InsufficientStock: 'Số lượng đang chọn vượt quá mức có thể mua.',
  InventoryReconciliation: 'Tồn kho đang được đối soát; vui lòng thử lại sau.',
};

export default function CartPage() {
  const { cart, refreshCart, runCartMutation } = useCart();
  const [error, setError] = useState('');
  const [pendingItemId, setPendingItemId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const cartCommandRetries = useRef(createCartCommandRetryStore());

  async function loadCart() {
    setError('');
    try {
      await refreshCart();
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

  async function commitQuantity(item, rawValue) {
    const quantity = Number(rawValue);
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('Số lượng không hợp lệ. Vui lòng nhập số nguyên dương.');
      return;
    }
    if (quantity === item.quantity) return;
    setPendingItemId(item.id);
    setError('');
    try {
      await runCartMutation((currentCart) => {
        const operation = `update:${item.id}`;
        const command = cartCommandRetries.current.acquire(operation, {
          quantity,
          expectedVersion: Number(currentCart.version || 0),
        });
        return cartService.updateItem(item.id, command.facts, { idempotencyKey: command.idempotencyKey })
          .then((result) => {
            cartCommandRetries.current.confirm(operation, command);
            return result;
          });
      });
    } catch (err) {
      setError(translateApiError(err));
      if (err.errorCode === 'CART_VERSION_CONFLICT') await refreshCart().catch(() => {});
    } finally {
      setPendingItemId('');
    }
  }

  async function removeItem(item) {
    setPendingItemId(item.id);
    setError('');
    try {
      await runCartMutation((currentCart) => {
        const operation = `remove:${item.id}`;
        const command = cartCommandRetries.current.acquire(operation, {
          expectedVersion: Number(currentCart.version || 0),
        });
        return cartService.removeItem(item.id, command.facts, { idempotencyKey: command.idempotencyKey })
          .then((result) => {
            cartCommandRetries.current.confirm(operation, command);
            return result;
          });
      });
    } catch (err) {
      setError(translateApiError(err));
      if (err.errorCode === 'CART_VERSION_CONFLICT') await refreshCart().catch(() => {});
    } finally {
      setPendingItemId('');
    }
  }

  return (
    <div className="surface cart-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Giỏ hàng</span>
          <h1>Sản phẩm bạn đã chọn</h1>
        </div>
        <Link className="btn btn-outline-success" to="/products">Tiếp tục mua sắm</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {isLoading ? (
        <div className="empty-state">
          <h2>Đang tải giỏ hàng...</h2>
        </div>
      ) : !cart.items.length ? (
        <div className="empty-state">
          <h2>Giỏ hàng đang trống</h2>
          <p>Hãy thêm một vài sản phẩm bếp phù hợp trước khi thanh toán.</p>
          <Link className="btn btn-success" to="/products">Khám phá sản phẩm</Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Số lượng</th>
                  <th>Đơn giá</th>
                  <th>Tạm tính</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.items.map((item) => {
                  const pending = pendingItemId === item.id;
                  return (
                  <tr key={item.id} className={item.issues?.length ? 'cart-line-with-issues' : ''}>
                    <td>{item.productName}</td>
                    <td>
                      <input
                        className="form-control quantity-input"
                        type="number"
                        min="1"
                        max={item.maxOrderableQuantity}
                        value={quantityDrafts[item.id] ?? item.quantity}
                        disabled={pending}
                        onChange={(event) => setQuantityDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                        onBlur={(event) => commitQuantity(item, event.target.value)}
                      />
                      {(item.issues || []).map((issue) => (
                        <small className="field-error d-block" key={issue.code}>
                          {ISSUE_LABELS[issue.code] || issue.message}
                          {issue.code === 'InsufficientStock' && item.maxOrderableQuantity !== undefined
                            ? ` Tối đa ${item.maxOrderableQuantity}.`
                            : ''}
                        </small>
                      ))}
                    </td>
                    <td>
                      {item.priceChanged && (
                        <del className="d-block text-secondary">
                          {formatCurrency(item.previousPrice ?? item.previousUnitPrice)}
                        </del>
                      )}
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td>{formatCurrency(item.subtotal ?? (item.unitPrice * item.quantity))}</td>
                    <td>
                      <button className="btn btn-outline-danger btn-sm" type="button" disabled={pending} onClick={() => removeItem(item)}>
                        {pending ? 'Đang xử lý...' : 'Xóa'}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="summary-box">
            <h2>Tóm tắt đơn hàng</h2>
            <div className="summary-line">
              <span>Tạm tính</span>
              <strong>{formatCurrency(cart.subtotal)}</strong>
            </div>
            <div className="summary-line">
              <span>Phí vận chuyển</span>
              <strong>{formatCurrency(cart.shippingFee)}</strong>
            </div>
            <div className="summary-total">
              <span>Tổng dự kiến</span>
              <strong>{formatCurrency(cart.totalAmount)}</strong>
            </div>
            {cart.canCheckout ? (
              <Link className="btn btn-success w-100" to="/checkout">
                Tiến hành thanh toán
              </Link>
            ) : (
              <button className="btn btn-success w-100" type="button" disabled>
                Xử lý các vấn đề trước khi thanh toán
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}