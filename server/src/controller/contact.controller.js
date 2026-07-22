const { createContactService } = require('../services/contact.service');
const { createEmailOutboxService } = require('../services/email.service');
const { sendSuccess } = require('../utils/apiResponse');

const contactService = createContactService({ outboxService: createEmailOutboxService() });

async function submit(req, res, next) {
  try {
    const result = await contactService.submit(req.body);
    return sendSuccess(res, result, 'GreenHome đã nhận được tin nhắn của bạn.', 201);
  } catch (error) {
    return next(error);
  }
}

module.exports = { submit };
