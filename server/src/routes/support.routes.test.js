const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const supportRoutes = require('./support.routes');

function declaredRoutes() {
  return supportRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      method: Object.keys(layer.route.methods).find((method) => layer.route.methods[method]),
      path: layer.route.path,
      handlers: layer.route.stack.length,
    }));
}

describe('SL-008 Support routes', () => {
  it('declares the exact protected Customer and Staff HTTP contract', () => {
    assert.deepEqual(declaredRoutes(), [
      { method: 'post', path: '/support-requests', handlers: 3 },
      { method: 'get', path: '/support-requests/my', handlers: 3 },
      { method: 'get', path: '/support-requests/:id', handlers: 3 },
      { method: 'post', path: '/support-requests/:id/messages', handlers: 3 },
      { method: 'patch', path: '/support-requests/:id/withdraw', handlers: 3 },
      { method: 'post', path: '/support-requests/:id/reopen', handlers: 3 },
      { method: 'get', path: '/staff/support-requests', handlers: 3 },
      { method: 'get', path: '/staff/support-requests/:id', handlers: 4 },
      { method: 'post', path: '/staff/support-requests/:id/claim', handlers: 4 },
      { method: 'post', path: '/staff/support-requests/:id/messages', handlers: 4 },
      { method: 'patch', path: '/staff/support-requests/:id/priority', handlers: 4 },
      { method: 'patch', path: '/staff/support-requests/:id/transfer', handlers: 4 },
      { method: 'post', path: '/staff/support-requests/:id/resolve', handlers: 4 },
    ]);
  });

  it('keeps the owned /my route ahead of the Customer detail parameter route', () => {
    const paths = declaredRoutes().map((route) => route.path);
    assert.ok(
      paths.indexOf('/support-requests/my') < paths.indexOf('/support-requests/:id'),
      'the /my route must not be captured as a ticket id',
    );
  });
});
