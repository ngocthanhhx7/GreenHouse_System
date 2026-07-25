import { useEffect, useRef, useState } from 'react';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleString('vi-VN') : '-';
}

export default function ReturnRefundPage() {
  const [items, setItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [bankStatus, setBankStatus] = useState('loading');
  const [bankError, setBankError] = useState('');
  const [forms, setForms] = useState({});
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const actionInFlightRef = useRef(new Set());
  const destinationKeysRef = useRef(new Map());
  const sensitiveFormsRef = useRef({});

  async function loadRequests() {
    setError('');
    try {
      const result = await returnRefundService.listMyRequests();
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadBanks() {
    setBankStatus('loading');
    setBankError('');
    try {
      const result = await returnRefundService.listBanks();
      const safeBanks = Array.isArray(result) ? result : [];
      setBanks(safeBanks);
      setBankStatus(safeBanks.length ? 'ready' : 'empty');
    } catch (err) {
      setBanks([]);
      setBankStatus('error');
      setBankError(err.message);
    }
  }

  useEffect(() => {
    loadRequests();
    loadBanks();
    return () => {
      sensitiveFormsRef.current = {};
      destinationKeysRef.current.clear();
      actionInFlightRef.current.clear();
    };
  }, []);

  function updateForm(id, field, value) {
    setForms((current) => {
      const next = { ...current, [id]: { ...(current[id] || {}), [field]: value } };
      sensitiveFormsRef.current = next;
      return next;
    });
  }

  function clearSensitiveDestinationForm(id) {
    setForms((current) => {
      const next = {
        ...current,
        [id]: {
          ...(current[id] || {}),
          accountNumber: '',
          accountHolderName: '',
          confirmed: false,
        },
      };
      sensitiveFormsRef.current = next;
      return next;
    });
  }

  function destinationIdempotencyKey(id) {
    if (!destinationKeysRef.current.has(id)) {
      const uniquePart = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      destinationKeysRef.current.set(id, `destination:${id}:${uniquePart}`);
    }
    return destinationKeysRef.current.get(id);
  }

  async function runAction(id, action, successMessage) {
    if (actionInFlightRef.current.size > 0) {
      setMessage('Yêu cầu đang được xử lý, vui lòng không bấm nhiều lần.');
      return;
    }
    actionInFlightRef.current.add(id);
    setBusyId(id); setError(''); setMessage('');
    try {
      await action();
      await loadRequests();
      setMessage(successMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      actionInFlightRef.current.delete(id);
      setBusyId('');
    }
  }

  async function submitDestination(item, form) {
    await runAction(item.id, async () => {
      await returnRefundService.submitDestination(item.id, {
        bankCode: form.bankCode,
        accountNumber: form.accountNumber,
        accountHolderName: form.accountHolderName,
        confirmed: form.confirmed === true,
        idempotencyKey: destinationIdempotencyKey(item.id),
      });
      clearSensitiveDestinationForm(item.id);
      destinationKeysRef.current.delete(item.id);
    }, 'Đã gửi thông tin nhận hoàn tiền để CSKH xác minh.');
  }

  return (
    <div className="surface">
      <div className="page-heading"><div><span className="eyebrow">Sau bán hàng</span><h1>Yêu cầu trả hàng / hoàn tiền</h1></div></div>
      {message && <div className="alert alert-success" aria-live="polite">{message}</div>}
      {error && <div className="alert alert-danger" role="alert" aria-live="assertive">{error}</div>}
      <div className="d-grid gap-3">
        {items.map((item) => {
          const form = forms[item.id] || {};
          const canSubmitDestination = ['Approved', 'Received', 'ReadyForRefund'].includes(item.status)
            && (!item.destination || item.destination.status === 'Rejected');
          return <article className="card" key={item.id}>
            <div className="card-body">
              <h2 className="h5">Đơn {item.orderCode}</h2>
              <p><strong>Trạng thái:</strong> {translateRequestStatus(item.status)}</p>
              <p><strong>Lý do:</strong> {item.reason}</p>
              <AuthenticatedEvidenceList urls={item.evidenceImages} label="Bằng chứng bạn đã gửi" />
              {item.staffNote && <p><strong>Phản hồi CSKH:</strong> {item.staffNote}</p>}
              {item.shipByAt && <p><strong>Hạn bàn giao hàng:</strong> {formatDate(item.shipByAt)}</p>}
              {item.status === 'Approved' && !item.handoffAt && <form className="border rounded p-3 mb-3" onSubmit={(event) => {
                event.preventDefault();
                runAction(item.id, () => returnRefundService.recordHandoffProof(item.id, {
                  proofReference: form.proofReference,
                  handoffAt: form.handoffAt,
                }), 'Đã ghi nhận bằng chứng bàn giao hàng.');
              }}>
                <h3 className="h6">Bằng chứng đã bàn giao hàng</h3>
                <label className="form-label" htmlFor={`proof-${item.id}`}>Mã biên nhận / vận đơn</label>
                <input id={`proof-${item.id}`} className="form-control" value={form.proofReference || ''} onChange={(event) => updateForm(item.id, 'proofReference', event.target.value)} required />
                <label className="form-label mt-2" htmlFor={`handoff-${item.id}`}>Thời điểm bàn giao thực tế</label>
                <input id={`handoff-${item.id}`} className="form-control" type="datetime-local" value={form.handoffAt || ''} onChange={(event) => updateForm(item.id, 'handoffAt', event.target.value)} required />
                <button className="btn btn-outline-success mt-2" type="submit" disabled={busyId === item.id}>Ghi nhận bàn giao</button>
              </form>}
              {item.handoffAt && <div className="alert alert-info">Đã bàn giao lúc {formatDate(item.handoffAt)} · Mã {item.handoffProofReference}</div>}
              {canSubmitDestination && <form className="border rounded p-3" onSubmit={(event) => {
                event.preventDefault();
                submitDestination(item, form);
              }}>
                <h3 className="h6">Thông tin nhận hoàn tiền</h3>
                {item.destination?.status === 'Rejected' && <div className="alert alert-warning">CSKH yêu cầu sửa: {item.destination.rejectionReason}</div>}
                <div className="alert alert-info" role="note">
                  GreenHome không bao giờ yêu cầu mã PIN, OTP, mật khẩu hoặc CVV.
                </div>
                {bankStatus === 'loading' && <div className="text-muted" aria-live="polite">Đang tải danh sách ngân hàng…</div>}
                {bankStatus === 'error' && <div className="alert alert-danger" role="alert" aria-live="assertive">
                  Không thể tải danh sách ngân hàng{bankError ? `: ${bankError}` : '.'}
                  <button className="btn btn-sm btn-outline-danger ms-2" type="button" onClick={loadBanks}>
                    Tải lại danh sách ngân hàng
                  </button>
                </div>}
                {bankStatus === 'empty' && <div className="alert alert-warning" aria-live="polite">
                  Chưa có ngân hàng hỗ trợ nhận hoàn tiền.
                  <button className="btn btn-sm btn-outline-warning ms-2" type="button" onClick={loadBanks}>
                    Tải lại danh sách ngân hàng
                  </button>
                </div>}
                <div className="row g-2">
                  <div className="col-12 col-md-4">
                    <label className="form-label" htmlFor={`bank-${item.id}`}>Ngân hàng</label>
                    <select id={`bank-${item.id}`} className="form-select" value={form.bankCode || ''} onChange={(event) => updateForm(item.id, 'bankCode', event.target.value)} disabled={bankStatus !== 'ready'} required>
                      <option value="">Chọn ngân hàng</option>
                      {banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                    </select>
                  </div>
                  <div className="col-12 col-md-4"><label className="form-label" htmlFor={`account-${item.id}`}>Số tài khoản</label><input id={`account-${item.id}`} className="form-control" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,24}" value={form.accountNumber || ''} onChange={(event) => updateForm(item.id, 'accountNumber', event.target.value.replace(/\D/g, '').slice(0, 24))} required /></div>
                  <div className="col-12 col-md-4"><label className="form-label" htmlFor={`holder-${item.id}`}>Tên chủ tài khoản</label><input id={`holder-${item.id}`} className="form-control" autoComplete="off" minLength={2} maxLength={120} pattern="[A-Za-zÀ-ỹĐđ .'’-]{2,120}" title="Tên chủ tài khoản chỉ gồm chữ cái và dấu câu thông dụng" value={form.accountHolderName || ''} onChange={(event) => updateForm(item.id, 'accountHolderName', event.target.value)} required /></div>
                </div>
                <div className="form-check mt-3"><input id={`confirm-${item.id}`} className="form-check-input" type="checkbox" checked={form.confirmed === true} onChange={(event) => updateForm(item.id, 'confirmed', event.target.checked)} required /><label className="form-check-label" htmlFor={`confirm-${item.id}`}>Tôi đã kiểm tra thông tin và chịu trách nhiệm về thông tin tài khoản do mình cung cấp.</label></div>
                <button className="btn btn-success mt-2" type="submit" disabled={busyId === item.id || bankStatus !== 'ready'}>Gửi thông tin xác minh</button>
              </form>}
              {item.destination && item.destination.status !== 'Rejected' && <div className="alert alert-secondary mt-3">Tài khoản {item.destination.maskedAccountNumber} · {item.destination.bankName} · {item.destination.status === 'Verified' ? 'Đã xác minh' : 'Đang chờ CSKH xác minh'}</div>}
              {item.payoutIncident?.status === 'Open' && <div className="alert alert-warning mt-3">
                {item.payoutIncident.responsibility === 'Customer'
                  ? 'CSKH đã mở hồ sơ hỗ trợ vì giao dịch dùng đúng thông tin bạn đã xác nhận; hệ thống sẽ không tự chi lần hai.'
                  : 'Kết quả chi trả không khớp thông tin đã xác minh; bạn không chịu trách nhiệm và CSKH đang xử lý lại.'}
              </div>}
            </div>
          </article>;
        })}
        {!items.length && <div className="text-center text-muted">Chưa có yêu cầu trả hàng / hoàn tiền.</div>}
      </div>
    </div>
  );
}
