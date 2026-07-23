import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { exchangeService } from '../../services/exchangeService.js';

export default function ExchangeListPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    exchangeService.listMyRequests()
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <div className="page-heading"><h1>Yêu cầu đổi hàng</h1><Link className="btn btn-outline-success" to="/orders">Đơn mua</Link></div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Mã yêu cầu</th><th>Trạng thái</th><th>Lý do</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.requestCode}</td><td>{item.status}</td><td>{item.reason}</td>
                <td><Link className="btn btn-outline-success btn-sm" to={`/exchanges/${item.id}`}>Xem yêu cầu</Link></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="4" className="text-center text-muted">Chưa có yêu cầu đổi hàng.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
