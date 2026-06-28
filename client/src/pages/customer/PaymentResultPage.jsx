import { Link, useParams, useSearchParams } from 'react-router-dom';

export default function PaymentResultPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const status = params.get('status') || 'Unknown';
  const success = status === 'Paid';

  return (
    <div className="surface">
      <h1>Payment Result</h1>
      <div className={`alert ${success ? 'alert-success' : 'alert-warning'}`}>
        Payment status: <strong>{status}</strong>
      </div>
      <Link className="btn btn-success" to={`/orders/${id}`}>
        View order
      </Link>
    </div>
  );
}
