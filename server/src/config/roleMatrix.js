const APPROVED_ROLES = Object.freeze(['Customer', 'Staff', 'WarehouseManager', 'Admin']);

const ROLE_CAPABILITIES = Object.freeze({
  Customer: Object.freeze(['profile:self', 'address:self', 'commerce:customer']),
  Staff: Object.freeze(['profile:self', 'operations:staff']),
  WarehouseManager: Object.freeze(['profile:self', 'operations:warehouse']),
  Admin: Object.freeze(['profile:self', 'account:govern', 'operations:admin']),
});

function integrityError() {
  const error = new Error('ROLE_INTEGRITY_INVALID');
  error.code = 'ROLE_INTEGRITY_INVALID';
  return error;
}

function assertSingleApprovedRole(roleEvidence) {
  if (Array.isArray(roleEvidence)) throw integrityError();
  const roleName = typeof roleEvidence === 'string' ? roleEvidence : roleEvidence?.roleName;
  if (!APPROVED_ROLES.includes(roleName)) throw integrityError();
  return roleName;
}

function roleCan(roleName, capability) {
  try {
    const approvedRole = assertSingleApprovedRole(roleName);
    return ROLE_CAPABILITIES[approvedRole].includes(capability);
  } catch (_error) {
    return false;
  }
}

module.exports = { APPROVED_ROLES, ROLE_CAPABILITIES, assertSingleApprovedRole, roleCan };
