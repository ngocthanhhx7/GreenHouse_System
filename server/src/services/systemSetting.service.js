const ApiError = require('../utils/apiError');
const SystemSetting = require('../models/systemSetting.model');
const { logAudit } = require('../utils/auditLogger');

const DEFAULT_SETTINGS = {
  lowStockDefaultThreshold: {
    value: 5,
    description: 'Default low-stock threshold for new inventory records',
  },
  returnWindowDays: {
    value: 7,
    description: 'Allowed customer return/refund window in days',
  },
};

function createModelRepository() {
  return {
    async listSettings() {
      return SystemSetting.find({}).lean();
    },
    async upsertSetting(key, data) {
      return SystemSetting.findOneAndUpdate(
        { key },
        { $set: { key, ...data } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();
    },
  };
}

function createSystemSettingService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function toSettingsObject() {
    const saved = await repository.listSettings();
    const savedByKey = Object.fromEntries(saved.map((setting) => [setting.key, Number(setting.value)]));
    return Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).map(([key, config]) => [key, savedByKey[key] !== undefined ? savedByKey[key] : config.value])
    );
  }

  return {
    async listSettings() {
      return toSettingsObject();
    },

    async updateSettings(adminId, input = {}) {
      const allowedKeys = Object.keys(DEFAULT_SETTINGS);
      const entries = Object.entries(input).filter(([key]) => allowedKeys.includes(key));
      if (!entries.length) throw new ApiError(400, 'No supported system settings provided');

      for (const [key, value] of entries) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue < 0) throw new ApiError(400, `${key} must be zero or greater`);
        await repository.upsertSetting(key, {
          value: numericValue,
          description: DEFAULT_SETTINGS[key].description,
          updatedBy: adminId,
        });
      }

      await auditLogger.log({
        userId: adminId,
        action: 'SYSTEM_SETTING_UPDATE',
        targetEntity: 'SystemSetting',
        targetId: 'system-settings',
        description: `Updated settings: ${entries.map(([key]) => key).join(', ')}`,
      });

      return toSettingsObject();
    },
  };
}

module.exports = {
  createSystemSettingService,
  systemSettingService: createSystemSettingService(),
};
