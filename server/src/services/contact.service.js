const ContactRequest = require('../models/contactRequest.model');
function createContactService({
  requestRepository = { async create(data) { return ContactRequest.create(data).then((doc) => doc.toObject()); } },
  outboxService,
  contactInbox = process.env.CONTACT_INBOX || 'contact@greenhome.local',
} = {}) {
  if (!outboxService) throw new Error('outboxService is required');
  return {
    async submit(input) {
      const request = await requestRepository.create({ name: String(input.name).trim(), email: String(input.email).trim().toLowerCase(), phone: String(input.phone || '').trim(), subject: String(input.subject).trim(), message: String(input.message).trim(), status: 'New' });
      await outboxService.enqueue({ eventType: 'CONTACT_SUBMISSION', idempotencyKey: `CONTACT_SUBMISSION:${request._id}`, recipient: contactInbox, payload: { contactRequestId: String(request._id), name: request.name, email: request.email, phone: request.phone, subject: request.subject, message: request.message } });
      return { id: String(request._id), status: request.status };
    },
  };
}
module.exports = { createContactService };
