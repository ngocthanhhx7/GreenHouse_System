const ApiError = require('../utils/apiError');
const SystemSetting = require('../models/systemSetting.model');
const { logAudit } = require('../utils/auditLogger');
const { lowStockAlertLifecycle: defaultLowStockLifecycle } = require('./lowStockAlertLifecycle.service');

const DEFAULT_SETTINGS = {
  PAYMENT_TIMEOUT_MINUTES: { value: 15, description: 'Maximum minutes an online payment can remain pending', min: 1 },
  RETURN_WINDOW_DAYS: { value: 7, description: 'Allowed customer return/refund window in days', min: 1 },
  LOW_STOCK_DEFAULT_THRESHOLD: { value: 5, description: 'Default low-stock threshold for new inventory records', min: 0 },
};
const ALIASES = { paymentTimeoutMinutes: 'PAYMENT_TIMEOUT_MINUTES', returnWindowDays: 'RETURN_WINDOW_DAYS', lowStockDefaultThreshold: 'LOW_STOCK_DEFAULT_THRESHOLD' };
function createModelRepository() { return { async listSettings() { return SystemSetting.find({}).lean(); }, async upsertSetting(key, data) { return SystemSetting.findOneAndUpdate({ key }, { $set: { key, ...data } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean(); } }; }
function createSystemSettingService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  lowStockLifecycle = null,
} = {}) {
  async function toSettingsObject() { const saved = await repository.listSettings(); const savedByKey = Object.fromEntries(saved.map((setting) => [setting.key, Number(setting.value)])); const canonical = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, config]) => { const legacyKey = Object.keys(ALIASES).find((alias) => ALIASES[alias] === key); return [key, savedByKey[key] !== undefined ? savedByKey[key] : (legacyKey && savedByKey[legacyKey] !== undefined ? savedByKey[legacyKey] : config.value)]; })); return { ...canonical, ...Object.fromEntries(Object.entries(ALIASES).map(([alias, key]) => [alias, canonical[key]])) }; }
  return {
    async listSettings() { return toSettingsObject(); },
    async updateSettings(adminId, input = {}) {
      const entries = Object.entries(input).map(([key, value]) => [ALIASES[key] || key, value]).filter(([key]) => DEFAULT_SETTINGS[key]);
      if (!entries.length) throw new ApiError(400, 'No supported system settings provided');
      const normalized = new Map(entries);
      for (const [key, value] of normalized) { const numericValue = Number(value); const config = DEFAULT_SETTINGS[key]; if (!Number.isInteger(numericValue) || numericValue < config.min) throw new ApiError(400, `${key} must be a positive integer${config.min === 0 ? ' or zero' : ''}`); }
      for (const [key, value] of normalized) await repository.upsertSetting(key, { value: Number(value), description: DEFAULT_SETTINGS[key].description, updatedBy: adminId });
      await auditLogger.log({ userId: adminId, action: 'SYSTEM_SETTING_UPDATE', targetEntity: 'SystemSetting', targetId: 'system-settings', description: `Updated settings: ${[...normalized.keys()].join(', ')}` });
      if (normalized.has('LOW_STOCK_DEFAULT_THRESHOLD')) {
        await lowStockLifecycle?.evaluateAll?.({ eventKey: `threshold-global:${adminId}:${normalized.get('LOW_STOCK_DEFAULT_THRESHOLD')}` });
      }
      return toSettingsObject();
    },
  };
}
module.exports = {
  createSystemSettingService,
  systemSettingService: createSystemSettingService({ lowStockLifecycle: defaultLowStockLifecycle }),
};
