const assert = require('node:assert/strict');
const { afterEach, describe, it } = require('node:test');

const { assertSafeFixtureTarget } = require('./sl002BrowserFixture');

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI,
  SL002_BROWSER_FIXTURE_CONFIRM: process.env.SL002_BROWSER_FIXTURE_CONFIRM,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('SL-002 browser fixture safety', () => {
  it('accepts only an explicitly confirmed local greenhome_kitchen target', () => {
    process.env.NODE_ENV = 'development';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/greenhome_kitchen?replicaSet=greenhome-rs';
    process.env.SL002_BROWSER_FIXTURE_CONFIRM = 'SL002-BROWSER';

    assert.doesNotThrow(() => assertSafeFixtureTarget());
  });

  it('rejects production, missing confirmation, and non-local targets', () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/greenhome_kitchen';
    process.env.SL002_BROWSER_FIXTURE_CONFIRM = 'SL002-BROWSER';
    assert.throws(() => assertSafeFixtureTarget(), /disabled in production/i);

    process.env.NODE_ENV = 'development';
    delete process.env.SL002_BROWSER_FIXTURE_CONFIRM;
    assert.throws(() => assertSafeFixtureTarget(), /SL002_BROWSER_FIXTURE_CONFIRM/i);

    process.env.SL002_BROWSER_FIXTURE_CONFIRM = 'SL002-BROWSER';
    process.env.MONGODB_URI = 'mongodb://production.example.com/greenhome_kitchen';
    assert.throws(() => assertSafeFixtureTarget(), /restricted to the local/i);
  });
});
