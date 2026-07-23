import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { cartService } from '../../services/cartService.js';
import { useCart } from '../../contexts/CartContext.jsx';
import { formatCurrency } from '../../utils/formatters.js';

export default function CartPage() {
  const { cart, refreshCart, runCartMutation } = useCart();
  const [error, setError] = useState('');

  async function loadCart() {
    setError('');
    try {
      await refreshCart();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

  async function updateQuantity(item, quantity) {
    try {
      await runCartMutation(() => cartService.updateItem(item.id, { quantity: Number(quantity) }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeItem(item) {
    try {
      await runCartMutation(() => cartService.removeItem(item.id));
    } catch (err) {
      setError(err.message);
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
      {!cart.items.length ? (
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
                {cart.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td>
                      <input className="form-control quantity-input" type="number" min="1" value={item.quantity} onChange={(event) => updateQuantity(item, event.target.value)} />
                    </td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                    <td>{formatCurrency(item.subtotal)}</td>
                    <td>
                      <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => removeItem(item)}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="summary-box">
            <h2>Tóm tắt đơn hàng</h2>
            <div className="summary-line">
              <span>Tạm tính</span>
              <strong>{formatCurrency(cart.totalAmount)}</strong>
            </div>
            <div className="summary-line">
              <span>Phí vận chuyển</span>
              <strong>Tính khi thanh toán</strong>
            </div>
            <div className="summary-total">
              <span>Tổng dự kiến</span>
              <strong>{formatCurrency(cart.totalAmount)}</strong>
            </div>
            <Link className="btn btn-success w-100" to="/checkout">
              Tiến hành thanh toán
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
