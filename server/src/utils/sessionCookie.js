const COOKIE_NAME = 'gh_session';

function parseCookies(header = '') {
  return String(header).split(';').reduce((result, part) => {
    const index = part.indexOf('=');
    if (index < 0) return result;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return result;
    try {
      result[key] = decodeURIComponent(value);
    } catch (_error) {
      // A malformed client-controlled cookie must not escape an Express 4
      // async middleware as an unhandled rejected promise.
    }
    return result;
  }, {});
}

function readSessionCookie(req) {
  return parseCookies(req?.headers?.cookie || '')[COOKIE_NAME] || '';
}

function sessionCookieOptions({ production = process.env.NODE_ENV === 'production' } = {}) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setSessionCookie(res, selector, options) {
  res.cookie(COOKIE_NAME, selector, sessionCookieOptions(options));
}

function clearSessionCookie(res, options) {
  res.clearCookie(COOKIE_NAME, {
    ...sessionCookieOptions(options),
    maxAge: undefined,
  });
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  parseCookies,
  readSessionCookie,
  sessionCookieOptions,
  setSessionCookie,
};
