require('dotenv').config();

const { createApp } = require('./app');
const { connectDatabase } = require('./config/database');
const { seedRoles } = require('./config/seedRoles');

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();
  await seedRoles();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`GreenHome API listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
