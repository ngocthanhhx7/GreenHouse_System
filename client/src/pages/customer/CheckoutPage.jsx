import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cartService } from '../../services/cartService.js';
import { orderService } from '../../services/orderService.js';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState({ items: [], totalAmount: 0 });
  const [form, setForm] = useState({ shippingAddress: '', paymentMethod: 'COD' });
  const [error, setError] = useState('');

  useEffect(() => {
    cartService.getCart().then(setCart).catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      const order = await orderService.placeOrder(form);
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Checkout</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="checkout-grid">
        <form onSubmit={handleSubmit}>
          <label className="form-label">
            Shipping address
            <textarea className="form-control" value={form.shippingAddress} onChange={(event) => setForm({ ...form, shippingAddress: event.target.value })} required />
          </label>
          <label className="form-label">
            Payment method
            <select className="form-select" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
              <option value="COD">COD</option>
              <option value="ONLINE">Online Payment</option>
            </select>
          </label>
          <button className="btn btn-success" type="submit" disabled={!cart.items.length}>
            Place order
          </button>
        </form>
        <aside className="summary-box">
          <h2>Order summary</h2>
          {cart.items.map((item) => (
            <div className="summary-line" key={item.id}>
              <span>{item.productName} x {item.quantity}</span>
              <strong>${Number(item.subtotal).toFixed(2)}</strong>
            </div>
          ))}
          <div className="summary-total">
            <span>Total</span>
            <strong>${Number(cart.totalAmount).toFixed(2)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
