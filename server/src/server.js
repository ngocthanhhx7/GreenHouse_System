require('dotenv').config();

const { createApp } = require('./app');
const { connectDatabase } = require('./config/database');
const { seedRoles } = require('./config/seedRoles');
const { createEmailOutboxService } = require('./services/email.service');
const { createEmailWorker } = require('./workers/email.worker');

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();
  await seedRoles();

  const app = createApp();
  const emailWorker = createEmailWorker({ outboxService: createEmailOutboxService() });
  emailWorker.start();
  app.listen(PORT, () => {
    console.log(`GreenHome API listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
