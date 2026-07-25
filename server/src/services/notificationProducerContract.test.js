const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

function source(file) {
  return readFileSync(path.join(__dirname, file), 'utf8');
}

describe('SL-009 live Notification producer contract', () => {
  it('AT-177/181 routes legacy customer seams through policy expansion with explicit safe displayValues', () => {
    for (const file of [
      'exchange.service.js',
      'fulfillment.service.js',
      'orderPaymentExpiry.service.js',
      'returnRefund.service.js',
    ]) {
      const text = source(file);
      assert.match(text, /displayValues\s*:/, `${file} must supply explicit safe display values`);
    }
    const notification = source('notification.service.js');
    assert.doesNotMatch(notification, /legacyDisplayValues|input\.subject|input\.content/);
  });

  it('AT-181 emits the damage decision only to its exact Staff recipient', () => {
    const damage = source('damageReport.service.js');
    const decision = /idempotencyKey:\s*`damage-decision:[\s\S]{0,500}?\}\);/.exec(damage)?.[0] || '';
    assert.match(decision, /recipientId:\s*result\.completed\.reportedBy/);
    assert.doesNotMatch(decision, /recipientRole/);
    assert.match(decision, /displayValues\s*:/);
  });
});
