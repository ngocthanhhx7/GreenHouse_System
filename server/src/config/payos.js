const { PayOS } = require('@payos/node');

const ApiError = require('../utils/apiError');

const REQUIRED_CONFIG = [
  ['PAYOS_CLIENT_ID', 'clientId'],
  ['PAYOS_API_KEY', 'apiKey'],
  ['PAYOS_CHECKSUM_KEY', 'checksumKey'],
];

function normalizeConfig(config = {}) {
  return {
    clientId: String(config.clientId ?? process.env.PAYOS_CLIENT_ID ?? '').trim(),
    apiKey: String(config.apiKey ?? process.env.PAYOS_API_KEY ?? '').trim(),
    checksumKey: String(config.checksumKey ?? process.env.PAYOS_CHECKSUM_KEY ?? '').trim(),
    returnUrl: String(config.returnUrl ?? process.env.PAYOS_RETURN_URL ?? '').trim(),
    cancelUrl: String(config.cancelUrl ?? process.env.PAYOS_CANCEL_URL ?? '').trim(),
    webhookUrl: String(config.webhookUrl ?? process.env.PAYOS_WEBHOOK_URL ?? '').trim(),
    ttlMinutes: Number(config.ttlMinutes ?? process.env.PAYOS_PAYMENT_LINK_TTL_MINUTES ?? 15),
  };
}

function missingConfiguration(config, { requireRedirectUrls = false, requireWebhookUrl = false } = {}) {
  const missing = REQUIRED_CONFIG.filter(([, key]) => !config[key]).map(([envName]) => envName);
  if (requireRedirectUrls && !config.returnUrl) missing.push('PAYOS_RETURN_URL');
  if (requireRedirectUrls && !config.cancelUrl) missing.push('PAYOS_CANCEL_URL');
  if (requireWebhookUrl && !config.webhookUrl) missing.push('PAYOS_WEBHOOK_URL');
  return missing;
}

function assertConfigured(config, options) {
  const missing = missingConfiguration(config, options);
  if (missing.length) {
    throw new ApiError(
      503,
      `Thiếu cấu hình payOS: ${missing.join(', ')}`,
      [],
      'PAYOS_NOT_CONFIGURED'
    );
  }
}

function buildRedirectUrl(template, orderId) {
  const encodedOrderId = encodeURIComponent(String(orderId));
  const hasPlaceholder = template.includes('{orderId}');
  const resolved = hasPlaceholder ? template.replaceAll('{orderId}', encodedOrderId) : template;
  let url;
  try {
    url = new URL(resolved);
  } catch {
    throw new ApiError(503, 'PAYOS_RETURN_URL/PAYOS_CANCEL_URL không hợp lệ', [], 'PAYOS_INVALID_REDIRECT_URL');
  }
  if (!hasPlaceholder) url.searchParams.set('orderId', String(orderId));
  return url.toString();
}

function createPayOSGateway(configuration = {}, dependencies = {}) {
  const config = normalizeConfig(configuration);
  let client = dependencies.client;

  function getClient(options) {
    assertConfigured(config, options);
    if (!client) {
      client = new PayOS({
        clientId: config.clientId,
        apiKey: config.apiKey,
        checksumKey: config.checksumKey,
      });
    }
    return client;
  }

  return {
    isConfigured(options = {}) {
      return missingConfiguration(config, options).length === 0;
    },

    async createPaymentLink({ order, providerOrderCode }) {
      const payos = getClient({ requireRedirectUrls: true });
      const ttlMinutes = Number.isFinite(config.ttlMinutes) && config.ttlMinutes > 0 ? config.ttlMinutes : 15;
      const expiredAt = Math.floor(Date.now() / 1000) + Math.round(ttlMinutes * 60);
      return payos.paymentRequests.create({
        orderCode: providerOrderCode,
        amount: Number(order.totalAmount),
        description: `GH ${order.orderCode}`.slice(0, 25),
        returnUrl: buildRedirectUrl(config.returnUrl, order._id),
        cancelUrl: buildRedirectUrl(config.cancelUrl, order._id),
        expiredAt,
      });
    },

    async verifyWebhook(payload) {
      return getClient().webhooks.verify(payload);
    },

    async cancelPaymentLink(paymentLinkId, reason) {
      return getClient().paymentRequests.cancel(paymentLinkId, reason);
    },

    async createPayout({ referenceId, amount, description, toBin, toAccountNumber, idempotencyKey }) {
      return getClient().payouts.create({
        referenceId,
        amount,
        description,
        toBin,
        toAccountNumber,
        category: ['refund'],
      }, idempotencyKey);
    },

    async getPayout(payoutId) {
      return getClient().payouts.get(payoutId);
    },

    async confirmWebhook() {
      const payos = getClient({ requireWebhookUrl: true });
      return payos.webhooks.confirm(config.webhookUrl);
    },

    getWebhookUrl() {
      return config.webhookUrl;
    },
  };
}

module.exports = {
  buildRedirectUrl,
  createPayOSGateway,
};
