import { useEffect, useState } from 'react';

import { returnRefundService } from '../../services/returnRefundService.js';

function EvidenceItem({ url, index, fetchEvidence }) {
  const [objectUrl, setObjectUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  async function loadEvidence() {
    if (busy || objectUrl) return;
    setBusy(true); setError('');
    try {
      const blob = await fetchEvidence(url);
      setObjectUrl(URL.createObjectURL(blob));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setBusy(false);
    }
  }

  return <li className="mb-2">
    {!objectUrl && <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy} onClick={loadEvidence}>
      {busy ? 'Đang tải...' : `Xem ảnh bằng chứng ${index + 1}`}
    </button>}
    {error && <div className="text-danger mt-1" role="alert">{error}</div>}
    {objectUrl && <a href={objectUrl} target="_blank" rel="noreferrer" className="d-inline-block">
      <img src={objectUrl} alt={`Bằng chứng trả hàng ${index + 1}`} className="img-fluid rounded border" style={{ maxHeight: '320px' }} />
    </a>}
  </li>;
}

export default function AuthenticatedEvidenceList({
  urls = [],
  label = 'Bằng chứng khách hàng',
  fetchEvidence = returnRefundService.fetchEvidence,
}) {
  if (!urls.length) return null;
  return <section className="mt-3">
    <strong>{label}:</strong>
    <ul className="list-unstyled mt-2">{urls.map((url, index) => <EvidenceItem key={url} url={url} index={index} fetchEvidence={fetchEvidence} />)}</ul>
  </section>;
}
