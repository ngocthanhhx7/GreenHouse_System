import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cartService } from '../../services/cartService.js';
import { orderService } from '../../services/orderService.js';
import { createCheckoutIdempotencyKey } from '../../services/orderService.js';
import { formatCurrency } from '../../utils/formatters.js';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState({ items: [], totalAmount: 0 });
  const [form, setForm] = useState({ shippingAddress: '', paymentMethod: 'COD' });
  const [error, setError] = useState('');
  const [checkoutIdempotencyKey] = useState(() => createCheckoutIdempotencyKey());

  useEffect(() => {
    cartService.getCart().then(setCart).catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      const order = await orderService.placeOrder(form, { idempotencyKey: checkoutIdempotencyKey });
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface checkout-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Thanh toán</span>
          <h1>Hoàn tất đơn hàng</h1>
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="checkout-steps">
        {['Địa chỉ', 'Thanh toán', 'Xác nhận'].map((step, index) => (
          <div className="checkout-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
      <div className="checkout-grid">
        <form className="checkout-form" onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="shippingAddress">
            Địa chỉ giao hàng
          </label>
          <textarea
            id="shippingAddress"
            className="form-control"
            rows="4"
            placeholder="Ví dụ: Nguyễn Ngọc Thành, 0900 000 004, Số nhà..., phường..., quận..., Hà Nội"
            value={form.shippingAddress}
            onChange={(event) => setForm({ ...form, shippingAddress: event.target.value })}
            required
          />
          <label className="form-label mt-3" htmlFor="paymentMethod">
            Phương thức thanh toán
          </label>
          <select
            id="paymentMethod"
            className="form-select"
            value={form.paymentMethod}
            onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
          >
            <option value="COD">Thanh toán khi nhận hàng (COD)</option>
            <option value="ONLINE">Thanh toán online</option>
          </select>
          <button className="btn btn-success mt-4" type="submit" disabled={!cart.items.length}>
            Đặt hàng
          </button>
        </form>
        <aside className="summary-box">
          <h2>Tóm tắt đơn hàng</h2>
          {cart.items.map((item) => (
            <div className="summary-line" key={item.id}>
              <span>{item.productName} x {item.quantity}</span>
              <strong>{formatCurrency(item.subtotal)}</strong>
            </div>
          ))}
          <div className="summary-total">
            <span>Tổng thanh toán</span>
            <strong>{formatCurrency(cart.totalAmount)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
