const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const { seedRoles } = require('../config/seedRoles');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const { hashPassword } = require('../utils/password');

const CONFIRMATION = 'CI-EPHEMERAL-STAGING';
const ACTORS = Object.freeze([
  Object.freeze({
    roleName: 'Customer',
    fullName: 'CI Customer',
    email: 'khachhang@greenhome.test',
    phone: '0902900101',
  }),
  Object.freeze({
    roleName: 'Staff',
    fullName: 'CI Staff',
    email: 'nhanvien@greenhome.test',
    phone: '0902900102',
  }),
  Object.freeze({
    roleName: 'WarehouseManager',
    fullName: 'CI Warehouse',
    email: 'quanlykho@greenhome.test',
    phone: '0902900103',
  }),
]);

function assertSafeCiTarget({
  nodeEnv = process.env.NODE_ENV,
  mongoUri = process.env.MONGODB_URI,
  confirmation = process.env.CI_EPHEMERAL_CONFIRM,
} = {}) {
  if (nodeEnv === 'production') {
    throw new Error('CI ephemeral actor fixture is disabled in production');
  }
  if (confirmation !== CONFIRMATION) {
    throw new Error(`Set CI_EPHEMERAL_CONFIRM=${CONFIRMATION}`);
  }
  const uri = String(mongoUri || '');
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(uri)) {
    throw new Error('CI ephemeral actor fixture requires a loopback MongoDB host');
  }
  if (!/^mongodb:\/\/[^/]+\/greenhome_kitchen(?:\?|$)/i.test(uri)) {
    throw new Error('CI ephemeral actor fixture requires the greenhome_kitchen database');
  }
}

async function prepareCiActors({
  password = process.env.CI_STAGING_PASSWORD,
  seed = seedRoles,
  roleModel = Role,
  userModel = User,
  passwordHasher = hashPassword,
} = {}) {
  assertSafeCiTarget();
  if (String(password || '').length < 12) {
    throw new Error('CI_STAGING_PASSWORD must contain at least 12 characters');
  }

  await seed();
  const roles = await roleModel.find({
    roleName: { $in: ACTORS.map((actor) => actor.roleName) },
  }).lean();
  const roleByName = new Map(roles.map((role) => [role.roleName, role]));
  const missing = ACTORS.find((actor) => !roleByName.has(actor.roleName));
  if (missing) throw new Error(`Missing required role ${missing.roleName}`);

  const passwordHash = await passwordHasher(password);
  const actorIds = {};
  for (const actor of ACTORS) {
    const user = await userModel.findOneAndUpdate(
      { email: actor.email },
      {
        $set: {
          fullName: actor.fullName,
          email: actor.email,
          phone: actor.phone,
          address: 'CI ephemeral staging only',
          passwordHash,
          roleId: roleByName.get(actor.roleName)._id,
          status: 'Active',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    actorIds[actor.roleName] = String(user._id);
  }

  return {
    actorCount: ACTORS.length,
    actors: ACTORS.map((actor) => ({
      roleName: actor.roleName,
      email: actor.email,
      id: actorIds[actor.roleName],
    })),
  };
}

async function runCli() {
  require('dotenv').config();
  assertSafeCiTarget();
  await connectDatabase();
  try {
    const result = await prepareCiActors();
    console.log(JSON.stringify(result));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  ACTORS,
  CONFIRMATION,
  assertSafeCiTarget,
  prepareCiActors,
};
