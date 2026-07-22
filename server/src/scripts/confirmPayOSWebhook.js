require('dotenv').config();

const { createPayOSGateway } = require('../config/payos');

async function confirmPayOSWebhook() {
  const gateway = createPayOSGateway();
  const result = await gateway.confirmWebhook();
  console.log(`payOS webhook đã được xác nhận: ${result.webhookUrl || gateway.getWebhookUrl()}`);
}

confirmPayOSWebhook().catch((error) => {
  console.error(`Không thể xác nhận payOS webhook: ${error.message}`);
  process.exit(1);
});
