const { supportService } = require('../services/support.service');
const { sendSuccess } = require('../utils/apiResponse');

function options(req) {
  return { idempotencyKey: req.get('Idempotency-Key') || req.get('X-Idempotency-Key') };
}

function commandFacts(body, fields) {
  return Object.fromEntries(fields.map((field) => [field, body?.[field]]));
}

async function createCustomerRequest(req, res, next) {
  try {
    const command = commandFacts(req.body, [
      'type', 'subject', 'initialMessage', 'orderId', 'productId', 'expectedVersion',
    ]);
    const result = await supportService.createRequest(req.user, command, options(req));
    return sendSuccess(res, result, 'Support request created', 201);
  } catch (error) { return next(error); }
}

async function listMyRequests(req, res, next) {
  try { return sendSuccess(res, await supportService.listOwn(req.user, req.query)); } catch (error) { return next(error); }
}

async function getCustomerRequest(req, res, next) {
  try { return sendSuccess(res, await supportService.getDetail(req.user, req.params.id, req.query)); } catch (error) { return next(error); }
}

async function appendCustomerMessage(req, res, next) {
  try {
    const command = commandFacts(req.body, ['message', 'expectedVersion']);
    return sendSuccess(res, await supportService.appendMessage(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function withdrawCustomerRequest(req, res, next) {
  try {
    const command = commandFacts(req.body, ['expectedVersion']);
    return sendSuccess(res, await supportService.withdraw(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function reopenCustomerRequest(req, res, next) {
  try {
    const command = { message: req.body?.message, expectedVersion: req.body?.expectedVersion };
    return sendSuccess(res, await supportService.reopen(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function listStaffRequests(req, res, next) {
  try { return sendSuccess(res, await supportService.listOperational(req.user, req.query)); } catch (error) { return next(error); }
}

async function getStaffRequest(req, res, next) {
  try { return sendSuccess(res, await supportService.getDetail(req.user, req.params.id, req.query)); } catch (error) { return next(error); }
}

async function claimRequest(req, res, next) {
  try {
    const command = { expectedVersion: req.body?.expectedVersion };
    return sendSuccess(res, await supportService.claim(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function appendStaffMessage(req, res, next) {
  try {
    const command = commandFacts(req.body, ['message', 'expectedVersion']);
    return sendSuccess(res, await supportService.appendMessage(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function changePriority(req, res, next) {
  try {
    const command = commandFacts(req.body, ['priority', 'reason', 'expectedVersion']);
    return sendSuccess(res, await supportService.changePriority(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function transferRequest(req, res, next) {
  try {
    const command = commandFacts(req.body, ['assigneeId', 'reason', 'expectedVersion']);
    return sendSuccess(res, await supportService.transfer(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

async function resolveRequest(req, res, next) {
  try {
    const command = { finalMessage: req.body?.finalMessage, expectedVersion: req.body?.expectedVersion };
    return sendSuccess(res, await supportService.resolve(req.user, req.params.id, command, options(req)));
  } catch (error) { return next(error); }
}

// Legacy controller name retained for clients that still send the old response payload.
async function respondToRequest(req, res, next) {
  try { return sendSuccess(res, await supportService.respondToRequest(req.user.id, req.params.id, req.body), 'Support response saved'); } catch (error) { return next(error); }
}

module.exports = {
  createCustomerRequest,
  listMyRequests,
  getCustomerRequest,
  appendCustomerMessage,
  withdrawCustomerRequest,
  reopenCustomerRequest,
  listStaffRequests,
  getStaffRequest,
  claimRequest,
  appendStaffMessage,
  changePriority,
  transferRequest,
  resolveRequest,
  respondToRequest,
};
