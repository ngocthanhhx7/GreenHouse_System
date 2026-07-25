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

function sanitizeEmailEventPayload(eventType, payload = {}) {
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

module.exports = { SAFE_PAYLOAD_FIELDS, sanitizeEmailEventPayload };
