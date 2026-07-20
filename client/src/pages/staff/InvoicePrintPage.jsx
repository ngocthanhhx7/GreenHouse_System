import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { staffOrderService } from '../../services/staffOrderService.js';
import { formatCurrency } from '../../utils/formatters.js';

export default function InvoicePrintPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { staffOrderService.getInvoice(id).then(setInvoice).catch((err) => setError(err.message)); }, [id]);

  if (error) return <div className="surface"><div className="alert alert-danger">{error}</div><Link to={`/staff/orders/${id}`}>Quay lại đơn hàng</Link></div>;
  if (!invoice) return <div className="page-center">Đang tải hóa đơn...</div>;

  return (
    <div className="surface invoice-view">
      <div className="page-heading">
        <div><span className="eyebrow">Hóa đơn {invoice.invoiceCode}</span><h1>{invoice.order?.orderCode || 'Đơn hàng'}</h1></div>
        <button className="btn btn-success" type="button" onClick={() => window.print()}>In hóa đơn</button>
      </div>
      <p><strong>Người nhận:</strong> {invoice.receiverName || '-'} {invoice.receiverPhone ? `(${invoice.receiverPhone})` : ''}</p>
      <p><strong>Địa chỉ giao hàng:</strong> {invoice.shippingAddress}</p>
      <table className="table"><thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Tạm tính</th></tr></thead><tbody>
        {(invoice.items || []).map((item) => <tr key={item.orderDetailId || item._id || item.id}><td>{item.productNameSnapshot}</td><td>{item.quantity}</td><td>{formatCurrency(item.priceSnapshot, invoice.currency)}</td><td>{formatCurrency(item.subtotal, invoice.currency)}</td></tr>)}
      </tbody></table>
      <h2 className="invoice-total">{formatCurrency(invoice.totalAmount, invoice.currency)}</h2>
      <Link className="btn btn-outline-success" to={`/staff/orders/${id}`}>Quay lại đơn hàng</Link>
    </div>
  );
}
