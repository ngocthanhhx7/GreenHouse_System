require('dotenv').config();

const { createApp } = require('./app');
const { connectDatabase } = require('./config/database');
const { seedRoles } = require('./config/seedRoles');
const { createEmailOutboxService } = require('./services/email.service');
const { createEmailWorker } = require('./workers/email.worker');
const { returnRefundService } = require('./services/returnRefund.service');
const { createReturnRefundExpiryWorker } = require('./workers/returnRefundExpiry.worker');
const { returnEvidenceRetentionService } = require('./services/returnEvidenceRetention.service');
const { createReturnEvidenceRetentionWorker } = require('./workers/returnEvidenceRetention.worker');
const { exchangeService } = require('./services/exchange.service');
const { createExchangeExpiryWorker } = require('./workers/exchangeExpiry.worker');

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();
  await seedRoles();

  const app = createApp();
  const emailWorker = createEmailWorker({ outboxService: createEmailOutboxService() });
  const returnRefundExpiryWorker = createReturnRefundExpiryWorker({ service: returnRefundService });
  const returnEvidenceRetentionWorker = createReturnEvidenceRetentionWorker({ service: returnEvidenceRetentionService });
  const exchangeExpiryWorker = createExchangeExpiryWorker({ service: exchangeService });
  emailWorker.start();
  returnRefundExpiryWorker.start();
  returnEvidenceRetentionWorker.start();
  exchangeExpiryWorker.start();
  app.listen(PORT, () => {
    console.log(`GreenHome API listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
