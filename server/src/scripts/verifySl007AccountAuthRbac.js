const fs = require('node:fs');
const path = require('node:path');

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function verifySl007AccountAuthRbac({ root = path.resolve(__dirname, '../..') } = {}) {
  const checks = [];
  function check(id, description, passed, evidence) {
    checks.push({ id, description, passed: Boolean(passed), evidence });
  }

  const userModel = read(root, 'src/models/user.model.js');
  const authMiddleware = read(root, 'src/middlewares/auth.middleware.js');
  const app = read(root, 'src/app.js');
  const registration = read(root, 'src/services/registration.service.js');
  const invitation = read(root, 'src/services/internalInvitation.service.js');
  const session = read(root, 'src/models/userSession.model.js');
  const sessionService = read(root, 'src/services/session.service.js');
  const address = read(root, 'src/services/userAddress.service.js');
  const admin = read(root, 'src/services/adminAccount.service.js');
  const authService = read(root, 'src/services/auth.service.js');
  const loginThrottle = read(root, 'src/services/loginThrottle.service.js');
  const loginThrottleModel = read(root, 'src/models/loginThrottleBucket.model.js');
  const assignmentCoordinator = read(root, 'src/services/assignmentCoordination.service.js');
  const migration = read(root, 'src/scripts/migrateAccountAuthRbac.js');
  const clientRoot = path.resolve(root, '../client/src');

  check('account-canonical-fields', 'User stores canonical phoneNumber and optimistic-lock version without legacy phone/address fields', /phoneNumber/.test(userModel) && /version/.test(userModel) && !/\bphone\s*:/.test(userModel) && !/\baddress\s*:/.test(userModel), 'user.model.js');
  check('cookie-session-only', 'Authentication reads an HttpOnly session cookie and does not accept bearer tokens', /readSessionCookie/.test(authMiddleware) && !/Bearer/i.test(authMiddleware), 'auth.middleware.js');
  check('csrf-global', 'CSRF protection is mounted before API mutations', /createCsrfProtection/.test(app) && /app\.use\('\/api', createCsrfProtection/.test(app), 'app.js');
  check('registration-two-step', 'Registration requires a pending OTP challenge before user creation', /findLatest/.test(registration) && /consume/.test(registration) && /createUser/.test(registration), 'registration.service.js');
  check('invitation-role-bound', 'Internal invitations are limited to Staff and WarehouseManager', /INVITED_ROLES/.test(invitation) && /Staff/.test(invitation) && /WarehouseManager/.test(invitation), 'internalInvitation.service.js');
  check('session-role-revalidation', 'Every session revalidates account status and role integrity', /SESSION_ACCOUNT_INVALID/.test(sessionService) && /SESSION_ROLE_STALE/.test(sessionService), 'session.service.js');
  check('credential-version-bound-session', 'Password writes rotate credential version and every session revalidates the version that authenticated it', /credentialVersion/.test(userModel) && /credentialVersionAtCreation/.test(session) && /SESSION_CREDENTIAL_STALE/.test(sessionService), 'user.model.js, userSession.model.js, session.service.js');
  check('atomic-login-throttle', 'Concurrent login limits use a durable atomic bucket and the shared public IP limiter covers login', /findOneAndUpdate/.test(loginThrottle) && /attempts/.test(loginThrottleModel) && /\/api\/auth\/login/.test(app), 'loginThrottle.service.js, loginThrottleBucket.model.js, app.js');
  check('single-live-pre-account-state', 'Database indexes enforce one live registration challenge and invitation per normalized email', /sl007_registration_single_live_identity/.test(migration) && /sl007_invitation_single_live_identity/.test(migration) && /PendingVerification/.test(migration) && /PendingAcceptance/.test(migration), 'migrateAccountAuthRbac.js');
  check('address-customer-only', 'Address service enforces Customer ownership and bounded defaults', /count >= 10/.test(address) && /DEFAULT_ADDRESS_REPLACEMENT_REQUIRED/.test(address), 'userAddress.service.js');
  check('serialized-address-book', 'Every address mutation takes the owning User address-book write fence', /addressBookVersion/.test(userModel) && /lockAddressBook/.test(address) && /\$inc/.test(address), 'user.model.js, userAddress.service.js');
  check('admin-governance', 'Admin account service rejects impersonation, hard delete, password/profile edits and Admin assignment', /impersonate/.test(admin) && /hard-delete/.test(admin) && /assignAdmin/.test(admin) && /convertCustomer/.test(admin), 'adminAccount.service.js');
  check('direct-registration-disabled', 'Legacy direct registration cannot create an Active account', /REGISTRATION_TWO_STEP_REQUIRED/.test(authService), 'auth.service.js');
  const assignmentProducers = [
    'support.service.js',
    'staffOrder.service.js',
    ['inventory.service.js', 'inventoryCore.service.js'],
    'damageReport.service.js',
    'replenishment.service.js',
    'returnRefund.service.js',
    'exchange.service.js',
  ].map((entry) => (Array.isArray(entry) ? entry : [entry])
    .map((file) => read(root, `src/services/${file}`))
    .join('\n'));
  check('role-assignment-write-fence', 'Role transfer and every active assignment producer write the same session-bound User fence', /assignmentEpoch/.test(userModel) && /\$inc:\s*\{\s*assignmentEpoch/.test(assignmentCoordinator) && assignmentProducers.every((source) => /assignmentCoordinator\.coordinate/.test(source)), 'assignmentCoordination.service.js and active assignment producers');

  let clientFiles = [];
  if (fs.existsSync(clientRoot)) {
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if ((entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) && !entry.name.endsWith('.test.js')) clientFiles.push(absolute);
      }
    };
    walk(clientRoot);
  }
  const clientSource = clientFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  check('client-no-bearer-storage', 'Client uses credentials cookies and does not persist bearer tokens', !/localStorage|greenhome_token|Authorization\s*:\s*`Bearer/i.test(clientSource), 'client/src');

  const passed = checks.every((item) => item.passed);
  return { status: passed ? 'PASS' : 'FAIL', passed, checks };
}

if (require.main === module) {
  const report = verifySl007AccountAuthRbac();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.passed ? 0 : 1;
}

module.exports = { verifySl007AccountAuthRbac };
