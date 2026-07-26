const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  REFUND_BANK_CATALOG,
  listPublicBanks,
  resolveBank,
} = require('./refundBankCatalog');

describe('refund bank catalog', () => {
  it('keeps a frozen reviewed catalog with unique six-digit codes and BINs', () => {
    assert.ok(Object.isFrozen(REFUND_BANK_CATALOG));
    assert.ok(REFUND_BANK_CATALOG.length >= 35);

    const codes = new Set();
    const bins = new Set();
    for (const bank of REFUND_BANK_CATALOG) {
      assert.ok(Object.isFrozen(bank));
      assert.match(bank.code, /^[A-Z0-9]+$/);
      assert.equal(typeof bank.name, 'string');
      assert.match(bank.bin, /^\d{6}$/);
      assert.equal(codes.has(bank.code), false);
      assert.equal(bins.has(bank.bin), false);
      codes.add(bank.code);
      bins.add(bank.bin);
    }
  });

  it('returns a deterministic public catalog without internal BINs', () => {
    const banks = listPublicBanks();
    assert.ok(Object.isFrozen(banks));
    assert.deepEqual(banks, [...banks].sort((left, right) => left.code.localeCompare(right.code)));
    assert.ok(banks.every((bank) => Object.isFrozen(bank) && Object.keys(bank).sort().join(',') === 'code,name'));
    assert.equal(JSON.stringify(banks).includes('970436'), false);
  });

  it('resolves only exact normalized catalog codes', () => {
    assert.deepEqual(resolveBank(' vcb '), {
      code: 'VCB',
      name: 'Vietcombank',
      bin: '970436',
    });
    assert.equal(resolveBank('Vietcombank'), null);
    assert.equal(resolveBank('VCB;DROP'), null);
    assert.equal(resolveBank({ code: 'VCB' }), null);
  });
});
