const assert = require('node:assert/strict');
const { it } = require('node:test');
const { createContactService } = require('./contact.service');

it('persists a contact request and CONTACT_SUBMISSION outbox event', async () => {
  const requests = [];
  const events = [];
  const service = createContactService({
    requestRepository: { async create(data) { const request = { _id: 'contact-1', ...data }; requests.push(request); return request; } },
    outboxService: { async enqueue(event) { events.push(event); return event; } },
    contactInbox: 'owner@example.com',
  });
  const result = await service.submit({ name: 'Nguyễn Ngọc Thành', email: 'thanh@example.com', phone: '0900000000', subject: 'Tư vấn sản phẩm', message: 'Xin chào GreenHome' });
  assert.equal(result.id, 'contact-1');
  assert.equal(events[0].eventType, 'CONTACT_SUBMISSION');
  assert.equal(events[0].idempotencyKey, 'CONTACT_SUBMISSION:contact-1');
  assert.equal(requests[0].email, 'thanh@example.com');
  assert.equal(requests[0].subject, 'Tư vấn sản phẩm');
  assert.equal(events[0].recipient, 'owner@example.com');
});
