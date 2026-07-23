function toTime(value) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function nowTime(now) {
  return now instanceof Date ? now.getTime() : new Date(now ?? Date.now()).getTime();
}

export function getOriginalExchangeAction(order = {}, now = Date.now()) {
  const deadlineAt = order.exchangeDeadlineAt || order.returnDeadlineAt || null;
  const deadlineTime = toTime(deadlineAt);
  const disabled = !Number.isFinite(deadlineTime) || nowTime(now) > deadlineTime;
  return {
    visible: true,
    disabled,
    deadlineAt,
    reason: disabled
      ? deadlineAt
        ? `Đã quá hạn đổi hàng của đơn gốc (${new Date(deadlineAt).toLocaleString('vi-VN')}).`
        : 'Không xác định được hạn đổi hàng của đơn gốc.'
      : '',
  };
}

export function getReturnAction(order = {}, now = Date.now()) {
  const deadlineAt = order.returnDeadlineAt || null;
  const deadlineTime = toTime(deadlineAt);
  const disabled = !Number.isFinite(deadlineTime) || nowTime(now) > deadlineTime;
  return {
    visible: true,
    disabled,
    deadlineAt,
    reason: disabled
      ? deadlineAt
        ? `Đã quá hạn trả hàng của đơn (${new Date(deadlineAt).toLocaleString('vi-VN')}).`
        : 'Không xác định được hạn trả hàng của đơn.'
      : '',
  };
}

export function classifyReplacementExchangeUnits(units = [], orderId, now = Date.now()) {
  const at = nowTime(now);
  return (Array.isArray(units) ? units : [])
    .filter((unit) => (
      String(unit?.orderId) === String(orderId)
      && unit?.outcome === 'ReplacementDelivered'
    ))
    .map((unit) => {
      const deadlineTime = toTime(unit.exchangeDeadlineAt);
      const lineageEligible = unit.eligibleForReplacementExchange === true;
      const deadlineEligible = Number.isFinite(deadlineTime) && at <= deadlineTime;
      const eligible = lineageEligible && deadlineEligible;
      let reason = '';
      if (!Number.isFinite(deadlineTime)) {
        reason = 'Sản phẩm thay thế chưa có hạn đổi hợp lệ.';
      } else if (!deadlineEligible) {
        reason = `Sản phẩm thay thế đã quá hạn đổi (${new Date(unit.exchangeDeadlineAt).toLocaleString('vi-VN')}).`;
      } else if (!lineageEligible) {
        reason = 'Sản phẩm thay thế đã được dùng làm nguồn cho một chu kỳ đổi sau.';
      }
      return {
        ...unit,
        id: String(unit.id || unit._id),
        eligible,
        reason,
      };
    });
}

export function getExchangeSubmissionGuard({
  mode,
  order = {},
  units = [],
  orderId,
  selectedReplacementUnitIds = [],
}, now = Date.now()) {
  if (mode === 'ORIGINAL_EXCHANGE') {
    const action = getOriginalExchangeAction(order, now);
    return { allowed: !action.disabled, reason: action.reason, deadlineAt: action.deadlineAt };
  }

  if (mode === 'REPLACEMENT_EXCHANGE') {
    const selectedIds = new Set(selectedReplacementUnitIds.map(String));
    const selected = classifyReplacementExchangeUnits(units, orderId, now)
      .filter((unit) => selectedIds.has(String(unit.id)));
    const blocked = selected.find((unit) => !unit.eligible);
    if (blocked) {
      return {
        allowed: false,
        reason: blocked.reason,
        deadlineAt: blocked.exchangeDeadlineAt || null,
      };
    }
    if (!selected.length) {
      return {
        allowed: false,
        reason: 'Vui lòng chọn ít nhất một sản phẩm thay thế còn trong hạn.',
        deadlineAt: null,
      };
    }
    return { allowed: true, reason: '', deadlineAt: null };
  }

  return { allowed: false, reason: 'Luồng đổi hàng không hợp lệ.', deadlineAt: null };
}

export function getExchangeWorkflowActions(request = {}) {
  const stockChoiceStatus = ['AwaitingExactStockChoice', 'WaitingForExactStock']
    .includes(request.status);
  const stockChoiceCause = ['INITIAL_APPROVAL', 'INCIDENT_RESEND']
    .includes(request.waitingFor);
  return {
    canWaitOrConvert: stockChoiceStatus && stockChoiceCause,
    canRetryReservation: request.status === 'WaitingForExactStock'
      && request.waitingFor === 'INITIAL_APPROVAL',
    canResend: ['DeliveryIncident', 'WaitingForExactStock'].includes(request.status)
      && request.waitingFor === 'INCIDENT_RESEND',
    canCreateOutbound: ['OutboundFulfillment', 'ReplacementShipped', 'DeliveryIncident']
      .includes(request.status)
      && !['REJECTED_ORIGINAL_RECONCILIATION', 'INCIDENT_RESEND_IN_TRANSIT']
      .includes(request.waitingFor),
  };
}

export function getExchangeWorkflowMessage(request = {}) {
  if (request.waitingFor === 'REJECTED_ORIGINAL_RECONCILIATION') {
    return 'Hàng gốc bị từ chối đang cần đối soát sự cố với đơn vị vận chuyển; không tạo yêu cầu chờ, chuyển đổi, gửi lại hoặc chuyến hàng mới.';
  }
  if (request.waitingFor === 'INCIDENT_RESEND_IN_TRANSIT') {
    return 'Chuyến gửi lại đang vận chuyển; vui lòng theo dõi chuyến hiện tại, không gửi lại hoặc tạo chuyến hàng mới.';
  }
  return '';
}
