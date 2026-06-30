import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';

export default function InvoicePrintPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staffOrderService.getInvoice(id).then(setInvoice).catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="surface">
        <div className="alert alert-danger">{error}</div>
        <Link to={`/staff/orders/${id}`}>Back to order</Link>
      </div>
    );
  }

  if (!invoice) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface invoice-view">
      <div className="page-heading">
        <h1>Invoice {invoice.order.orderCode}</h1>
        <button className="btn btn-success" type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p>{invoice.order.shippingAddress}</p>
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item) => (
            <tr key={item._id || item.id}>
              <td>{item.productNameSnapshot}</td>
              <td>{item.quantity}</td>
              <td>${Number(item.priceSnapshot || 0).toFixed(2)}</td>
              <td>${Number(item.subtotal || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="invoice-total">${Number(invoice.totalAmount || 0).toFixed(2)}</h2>
      <Link className="btn btn-outline-success" to={`/staff/orders/${id}`}>
        Back to order
      </Link>
    </div>
  );
}
