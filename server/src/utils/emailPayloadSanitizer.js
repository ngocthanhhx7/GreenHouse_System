const {
  TYPE_DISPLAY_VALUES,
  normalizeNotificationType,
  sanitizeDisplayValues,
} = require('./notificationContract');

const SAFE_PAYLOAD_FIELDS = Object.freeze({
  PASSWORD_RESET_OTP_REQUESTED: ['userId', 'encryptedOtp', 'expiresInMinutes'],
  REGISTRATION_OTP_REQUESTED: ['challengeId', 'encryptedOtp', 'expiresInMinutes'],
  INTERNAL_INVITATION_CREATED: ['invitationId', 'roleName', 'encryptedToken'],
  ACCOUNT_REGISTRATION_COMPLETED: ['userId', 'fullName'],
  INTERNAL_INVITATION_ACCEPTED: ['userId', 'fullName', 'roleName'],
  PASSWORD_RESET_COMPLETED: ['userId'],
  PROFILE_PASSWORD_CHANGED: ['userId', 'fullName'],
  CONTACT_SUBMISSION: ['contactRequestId', 'name', 'email', 'phone', 'subject', 'message'],
  ORDER_CREATED: ['orderId', 'orderCode', 'totalAmount', 'paymentMethod'],
});

function sanitizeNotificationDeliveryPayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const notificationType = normalizeNotificationType(source.notificationType);
  const templateKey = normalizeNotificationType(source.templateKey || notificationType);
  if (templateKey !== notificationType) {
    throw new Error('Notification email template does not match its type');
  }
  const displayValues = sanitizeDisplayValues(
    notificationType,
    Object.fromEntries(
      (TYPE_DISPLAY_VALUES[notificationType] || [])
        .filter((key) => Object.hasOwn(source, key))
        .map((key) => [key, source[key]]),
    ),
    { rejectUnknown: true },
  );
  const safe = {
    notificationId: String(source.notificationId || '').trim().slice(0, 200),
    businessEventId: String(source.businessEventId || '').trim().slice(0, 240),
    notificationType,
    templateKey,
    ...displayValues,
  };
  const targetCollection = String(source.targetCollection || '').trim().slice(0, 120);
  const targetId = String(source.targetId || '').trim().slice(0, 200);
  if (targetCollection && targetId) {
    safe.targetCollection = targetCollection;
    safe.targetId = targetId;
  }
  return safe;
}

function sanitizeEmailEventPayload(eventType, payload = {}) {
  if (eventType === 'NOTIFICATION_DELIVERY_REQUESTED') {
    return sanitizeNotificationDeliveryPayload(payload);
  }
  const allowedFields = SAFE_PAYLOAD_FIELDS[eventType];
  if (!allowedFields) throw new Error(`Unsupported email event: ${eventType}`);
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return allowedFields.reduce((safe, field) => {
    const value = source[field];
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      if (Object.hasOwn(source, field)) safe[field] = value;
    }
    return safe;
  }, {});
}

module.exports = {
  SAFE_PAYLOAD_FIELDS,
  sanitizeEmailEventPayload,
  sanitizeNotificationDeliveryPayload,
};
