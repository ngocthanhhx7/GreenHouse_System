const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const routesDirectory = __dirname;

const staffRouteContracts = [
  {
    file: 'returnRefund.routes.js',
    routes: [
      "router.get('/staff/return-refunds/:id', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.patch('/staff/return-refunds/:id/status', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.patch('/staff/return-refunds/:id/destination', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/expire', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/payout-evidence', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/payos-payout', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/payos-reconcile', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/payout-reconciliation', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/payout-incident', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/return-refunds/:id/complete-refund', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
    ],
  },
  {
    file: 'exchange.routes.js',
    routes: [
      "router.get('/staff/exchanges/:id', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.patch('/staff/exchanges/:id/decision', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/exchanges/:id/retry-reservation', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/exchanges/:id/expire', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/exchanges/:id/shipments/:shipmentId/events', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), validateObjectIdParam('shipmentId'),",
      "router.post('/staff/exchanges/:id/resend', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
    ],
  },
  {
    file: 'support.routes.js',
    routes: [
      "router.get('/staff/support-requests/:id', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/support-requests/:id/claim', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/support-requests/:id/messages', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.patch('/staff/support-requests/:id/priority', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.patch('/staff/support-requests/:id/transfer', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/support-requests/:id/resolve', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
    ],
  },
  {
    file: 'damageReport.routes.js',
    routes: [
      "router.get('/staff/damage-reports/:id', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/damage-reports/:id/withdraw', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.patch('/staff/damage-reports/:id/withdraw', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
    ],
  },
  {
    file: 'fulfillment.routes.js',
    routes: [
      "router.post('/staff/orders/:id/packing', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/orders/:id/shipments', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/shipments/:shipmentId/events', authenticate, authorizeRoles('Staff'), validateObjectIdParam('shipmentId'),",
      "router.post('/staff/orders/:id/destination-versions', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/orders/:id/delivery-resolution', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.get('/staff/orders/:id/fulfillment', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
    ],
  },
  {
    file: 'cod.routes.js',
    routes: [
      "router.post('/staff/orders/:id/cod-collection', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
      "router.post('/staff/orders/:id/cod-recovery', authenticate, authorizeRoles('Staff'), validateObjectIdParam(),",
    ],
  },
  {
    file: 'review.routes.js',
    routes: [
      "  '/staff/reviews/:reviewId/moderation',",
      "  authenticate,\n  authorizeRoles('Staff'),\n  validateObjectIdParam('reviewId'),",
    ],
  },
];

describe('Staff route identifier validation contracts', () => {
  for (const contract of staffRouteContracts) {
    it(`${contract.file} validates every Staff route identifier before the controller`, () => {
      const source = fs
        .readFileSync(path.join(routesDirectory, contract.file), 'utf8')
        .replace(/\r\n/g, '\n');

      for (const routeContract of contract.routes) {
        assert.ok(
          source.includes(routeContract),
          `${contract.file} is missing ObjectId validation for ${routeContract}`,
        );
      }
    });
  }
});
