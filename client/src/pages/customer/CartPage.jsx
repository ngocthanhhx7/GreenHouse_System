import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { cartService } from '../../services/cartService.js';

export default function CartPage() {
  const [cart, setCart] = useState({ items: [], totalAmount: 0 });
  const [error, setError] = useState('');

  async function loadCart() {
    setError('');
    try {
      setCart(await cartService.getCart());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

  async function updateQuantity(item, quantity) {
    try {
      setCart(await cartService.updateItem(item.id, { quantity: Number(quantity) }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeItem(item) {
    try {
      setCart(await cartService.removeItem(item.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Cart</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {!cart.items.length ? (
        <p className="text-secondary">Your cart is empty.</p>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Subtotal</th>
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
                    <td>${Number(item.unitPrice).toFixed(2)}</td>
                    <td>${Number(item.subtotal).toFixed(2)}</td>
                    <td>
                      <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => removeItem(item)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <strong>Total: ${Number(cart.totalAmount).toFixed(2)}</strong>
            <Link className="btn btn-success" to="/checkout">
              Checkout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
