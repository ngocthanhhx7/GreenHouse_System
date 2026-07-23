const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { parseCookies, readSessionCookie } = require('./sessionCookie');

describe('session cookie parsing', () => {
  it('fails closed when gh_session contains malformed percent encoding', () => {
    const request = { headers: { cookie: 'theme=light; gh_session=%E0%A4%A; locale=vi' } };

    assert.doesNotThrow(() => readSessionCookie(request));
    assert.equal(readSessionCookie(request), '');
    assert.deepEqual(parseCookies(request.headers.cookie), {
      theme: 'light',
      locale: 'vi',
    });
  });
});
