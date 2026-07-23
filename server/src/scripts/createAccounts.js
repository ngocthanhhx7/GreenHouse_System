require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { seedRoles } = require('../config/seedRoles');
const { hashPassword } = require('../utils/password');
const Role = require('../models/role.model');
const User = require('../models/user.model');

const PASSWORD = 'Thanh123@';

const ACCOUNTS = [
  {
    roleName: 'Customer',
    fullName: 'Khach Hang',
    email: 'khachhang@greenhome.test',
    phoneNumber: '0910000001',
  },
  {
    roleName: 'Staff',
    fullName: 'Nhan Vien',
    email: 'nhanvien@greenhome.test',
    phoneNumber: '0910000002',
  },
  {
    roleName: 'WarehouseManager',
    fullName: 'Quan Ly Kho',
    email: 'quanlykho@greenhome.test',
    phoneNumber: '0910000003',
  },
  {
    roleName: 'Admin',
    fullName: 'Quan Tri Vien',
    email: 'quantrivien@greenhome.test',
    phoneNumber: '0910000004',
  },
];

async function createAccounts() {
  await seedRoles();
  const roles = await Role.find({ roleName: { $in: ACCOUNTS.map((a) => a.roleName) } }).lean();
  const roleMap = Object.fromEntries(roles.map((r) => [r.roleName, r]));

  const missing = ACCOUNTS.find((a) => !roleMap[a.roleName]);
  if (missing) throw new Error(`Missing role: ${missing.roleName}`);

  const passwordHash = await hashPassword(PASSWORD);

  for (const account of ACCOUNTS) {
    const role = roleMap[account.roleName];
    await User.findOneAndUpdate(
      { email: account.email },
      {
        $set: {
          fullName: account.fullName,
          email: account.email,
          phoneNumber: account.phoneNumber,
          passwordHash,
          roleId: role._id,
          status: 'Active',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  console.log('\n========== TAI KHOAN DA TAO ==========');
  console.log(`Mat khau chung: ${PASSWORD}\n`);
  for (const account of ACCOUNTS) {
    console.log(`  ${account.roleName}:`);
    console.log(`    Email:    ${account.email}`);
    console.log(`    FullName: ${account.fullName}`);
    console.log(`    Phone:    ${account.phoneNumber}`);
    console.log('');
  }
  console.log('======================================\n');
}

async function run() {
  await connectDatabase();
  await createAccounts();
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Loi:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
