const { fulfillmentService } = require('../services/fulfillment.service');
const { sendSuccess } = require('../utils/apiResponse');

function commandInput(req) {
  return {
    ...(req.body || {}),
    idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey,
  };
}

async function confirmPacking(req, res, next) {
  try {
    const body = commandInput(req);
    if (!body.items && Array.isArray(body.checklist)) {
      body.items = body.checklist.map((item) => ({
        ...item,
        checkedQuantity: item.checkedQuantity ?? item.quantity,
      }));
    }
    return sendSuccess(
      res,
      await fulfillmentService.confirmPacking(req.user.id, req.params.id, body),
      'Packing checklist recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function recordHandoff(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.recordHandoff(req.user.id, req.params.id, commandInput(req)),
      'Carrier handoff recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function recordStaffShipmentEvent(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.recordShipmentEvent(
        { actorType: 'Staff', actorId: req.user.id },
        req.params.shipmentId,
        { ...(req.body || {}), source: 'STAFF_EVIDENCE' },
      ),
      'Shipment event recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function recordCarrierShipmentEvent(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.recordShipmentEvent(
        { actorType: 'Carrier', actorId: null },
        req.params.shipmentId,
        { ...(req.body || {}), source: 'CARRIER' },
      ),
      'Signed Carrier shipment event recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function recordReturnedReceipt(req, res, next) {
  try {
    const body = commandInput(req);
    if (!body.items && Array.isArray(body.lines)) body.items = body.lines;
    return sendSuccess(
      res,
      await fulfillmentService.recordReturnedReceipt(
        req.user.id,
        req.params.shipmentId,
        body,
      ),
      'Returned parcel receipt recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function listReturnedParcels(_req, res, next) {
  try {
    return sendSuccess(res, await fulfillmentService.listReturnedParcels());
  } catch (error) {
    return next(error);
  }
}

async function addStaffDestinationVersion(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.addDestinationVersion(
        { actorType: 'Staff', actorId: req.user.id },
        req.params.id,
        commandInput(req),
      ),
      'Shipment destination version recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function addCustomerDestinationVersion(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.addDestinationVersion(
        { actorType: 'Customer', actorId: req.user.id },
        req.params.id,
        commandInput(req),
      ),
      'Destination correction recorded',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function chooseIncidentResolution(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.chooseIncidentResolution(
        req.user.id,
        req.params.id,
        req.params.incidentId,
        commandInput(req),
      ),
      'Delivery incident choice recorded',
    );
  } catch (error) {
    return next(error);
  }
}

async function resolveDeliveryFailure(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.resolveDeliveryFailure(req.user.id, req.params.id, commandInput(req)),
      'Delivery failure resolved',
    );
  } catch (error) {
    return next(error);
  }
}

async function getCustomerFulfillment(req, res, next) {
  try {
    return sendSuccess(
      res,
      await fulfillmentService.getCustomerFulfillment(req.user.id, req.params.id),
    );
  } catch (error) {
    return next(error);
  }
}

async function getStaffFulfillment(req, res, next) {
  try {
    return sendSuccess(res, await fulfillmentService.getStaffFulfillment(req.params.id));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  addCustomerDestinationVersion,
  addStaffDestinationVersion,
  chooseIncidentResolution,
  confirmPacking,
  getCustomerFulfillment,
  getStaffFulfillment,
  listReturnedParcels,
  recordCarrierShipmentEvent,
  recordHandoff,
  recordReturnedReceipt,
  recordStaffShipmentEvent,
  resolveDeliveryFailure,
};
