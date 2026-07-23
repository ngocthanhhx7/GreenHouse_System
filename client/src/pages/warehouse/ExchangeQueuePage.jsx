import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { exchangeService } from '../../services/exchangeService.js';

export default function ExchangeQueuePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    exchangeService.listWarehouseRequests()
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <div className="page-heading"><h1>Kho xử lý đổi hàng</h1></div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Mã yêu cầu</th><th>Trạng thái</th><th>Số dòng</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.requestCode}</td><td>{item.status}</td><td>{(item.lines || []).length}</td>
                <td><Link className="btn btn-outline-success btn-sm" to={`/warehouse/exchanges/${item.id}`}>Xử lý hàng</Link></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="4" className="text-center text-muted">Không có yêu cầu đổi hàng cho Kho.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
