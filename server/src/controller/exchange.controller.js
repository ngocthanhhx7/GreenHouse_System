const { exchangeService } = require('../services/exchange.service');
const { sendSuccess } = require('../utils/apiResponse');

function noStore(res) {
  res.set('Cache-Control', 'no-store');
}

async function createCustomerRequest(req, res, next) {
  try {
    return sendSuccess(
      res,
      await exchangeService.createCustomerRequest(req.user.id, { ...req.body, orderId: req.params.id }),
      'Exchange request recorded',
      201
    );
  } catch (error) { return next(error); }
}

async function listMyRequests(req, res, next) {
  try { return sendSuccess(res, await exchangeService.listMyRequests(req.user.id)); } catch (error) { return next(error); }
}

async function getCustomerRequest(req, res, next) {
  try { return sendSuccess(res, await exchangeService.getCustomerRequest(req.user.id, req.params.id)); } catch (error) { return next(error); }
}

async function recordHandoffProof(req, res, next) {
  try {
    return sendSuccess(res, await exchangeService.recordHandoffProof(req.user.id, req.params.id, req.body), 'Exchange handoff recorded');
  } catch (error) { return next(error); }
}

async function cancelRequest(req, res, next) {
  try {
    return sendSuccess(res, await exchangeService.cancelRequest(req.user.id, req.params.id, req.body), 'Exchange cancelled');
  } catch (error) { return next(error); }
}

async function chooseStockOption(req, res, next) {
  try {
    return sendSuccess(res, await exchangeService.chooseStockOption(req.user.id, req.params.id, req.body), 'Exchange stock choice recorded');
  } catch (error) { return next(error); }
}

async function reportShipmentDispute(req, res, next) {
  try {
    return sendSuccess(
      res,
      await exchangeService.reportShipmentDispute(
        req.user.id,
        req.params.id,
        req.params.shipmentId,
        req.body
      ),
      'Shipment dispute recorded',
      201
    );
  } catch (error) { return next(error); }
}

async function listStaffRequests(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(res, await exchangeService.listStaffRequests(req.query));
  } catch (error) { return next(error); }
}

async function getStaffRequest(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(res, await exchangeService.getStaffRequest(req.params.id));
  } catch (error) { return next(error); }
}

async function decideRequest(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(res, await exchangeService.decideRequest(req.user.id, req.params.id, req.body), 'Exchange decision recorded');
  } catch (error) { return next(error); }
}

async function retryReservation(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(res, await exchangeService.retryReservation(req.user.id, req.params.id, req.body), 'Exact-SKU reservation retried');
  } catch (error) { return next(error); }
}

async function expireRequest(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(res, await exchangeService.expireRequest(req.user.id, req.params.id), 'Exchange expiry reconciled');
  } catch (error) { return next(error); }
}

async function recordStaffShipmentEvent(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(
      res,
      await exchangeService.recordStaffShipmentEvent(req.user.id, req.params.id, req.params.shipmentId, req.body),
      'Shipment evidence recorded'
    );
  } catch (error) { return next(error); }
}

async function resendReplacement(req, res, next) {
  try {
    noStore(res);
    return sendSuccess(
      res,
      await exchangeService.resendReplacement(req.user.id, req.params.id, req.body),
      'Replacement resend reconciled',
      201
    );
  } catch (error) { return next(error); }
}

async function listWarehouseRequests(req, res, next) {
  try { return sendSuccess(res, await exchangeService.listWarehouseRequests(req.query)); } catch (error) { return next(error); }
}

async function getWarehouseRequest(req, res, next) {
  try { return sendSuccess(res, await exchangeService.getWarehouseRequest(req.params.id)); } catch (error) { return next(error); }
}

async function recordWarehouseReceipt(req, res, next) {
  try {
    return sendSuccess(
      res,
      await exchangeService.recordWarehouseReceipt(req.user.id, req.params.id, req.body),
      'Exchange parcel received'
    );
  } catch (error) { return next(error); }
}

async function finalizeInspection(req, res, next) {
  try {
    return sendSuccess(
      res,
      await exchangeService.finalizeInspection(req.user.id, req.params.id, req.body),
      'Exchange inspection finalized'
    );
  } catch (error) { return next(error); }
}

async function createOutboundShipment(req, res, next) {
  try {
    return sendSuccess(
      res,
      await exchangeService.createOutboundShipment(req.user.id, req.params.id, req.body),
      'Exchange outbound shipment created',
      201
    );
  } catch (error) { return next(error); }
}

async function recordCarrierShipmentEvent(req, res, next) {
  try {
    return sendSuccess(
      res,
      await exchangeService.recordCarrierShipmentEvent(req.params.shipmentId, req.body),
      'Carrier Exchange event recorded',
      201
    );
  } catch (error) { return next(error); }
}

module.exports = {
  createCustomerRequest,
  listMyRequests,
  getCustomerRequest,
  recordHandoffProof,
  cancelRequest,
  chooseStockOption,
  reportShipmentDispute,
  listStaffRequests,
  getStaffRequest,
  decideRequest,
  retryReservation,
  expireRequest,
  recordStaffShipmentEvent,
  resendReplacement,
  listWarehouseRequests,
  getWarehouseRequest,
  recordWarehouseReceipt,
  finalizeInspection,
  createOutboundShipment,
  recordCarrierShipmentEvent,
};
