const Role = require('../models/role.model');

const DEFAULT_ROLES = [
  { roleName: 'Customer', description: 'Registered buyer account' },
  { roleName: 'Staff', description: 'Order and customer issue processor' },
  { roleName: 'WarehouseManager', description: 'Inventory and stock operation owner' },
  { roleName: 'Admin', description: 'System administrator' },
];

async function seedRoles() {
  for (const role of DEFAULT_ROLES) {
    await Role.updateOne({ roleName: role.roleName }, { $setOnInsert: role }, { upsert: true });
  }
}

module.exports = {
  DEFAULT_ROLES,
  seedRoles,
};
