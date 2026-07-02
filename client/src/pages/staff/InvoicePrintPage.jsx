import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import { formatCurrency } from '../../utils/formatters.js';

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
        <Link to={`/staff/orders/${id}`}>Quay lại đơn hàng</Link>
      </div>
    );
  }

  if (!invoice) return <div className="page-center">Đang tải hóa đơn...</div>;

  return (
    <div className="surface invoice-view">
      <div className="page-heading">
        <h1>Hóa đơn {invoice.order.orderCode}</h1>
        <button className="btn btn-success" type="button" onClick={() => window.print()}>
          In hóa đơn
        </button>
      </div>
      <p><strong>Địa chỉ giao hàng:</strong> {invoice.order.shippingAddress}</p>
      <table className="table">
        <thead>
          <tr>
            <th>Sản phẩm</th>
            <th>SL</th>
            <th>Đơn giá</th>
            <th>Tạm tính</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item) => (
            <tr key={item._id || item.id}>
              <td>{item.productNameSnapshot}</td>
              <td>{item.quantity}</td>
              <td>{formatCurrency(item.priceSnapshot)}</td>
              <td>{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="invoice-total">{formatCurrency(invoice.totalAmount)}</h2>
      <Link className="btn btn-outline-success" to={`/staff/orders/${id}`}>
        Quay lại đơn hàng
      </Link>
    </div>
  );
}
