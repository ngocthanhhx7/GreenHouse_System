const path = require('node:path');
const { readdir, stat, unlink } = require('node:fs/promises');

const ReturnItem = require('../models/returnItem.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const { DEFAULT_UPLOADS_ROOT } = require('./upload.service');

const TERMINAL_STATUSES = new Set(['Rejected', 'Expired', 'Completed', 'ClosedByCODRecovery']);
const SAFE_FILENAME = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

async function findReferencesFromModels(candidateUrls) {
  const direct = await ReturnRefundRequest.find({ evidenceImages: { $in: candidateUrls } })
    .select('_id status completedAt expiredAt resolvedAt handledAt updatedAt')
    .lean();
  const itemRequestIds = await ReturnItem.find({ evidenceImages: { $in: candidateUrls } })
    .distinct('returnRefundRequestId');
  const parents = itemRequestIds.length
    ? await ReturnRefundRequest.find({ _id: { $in: itemRequestIds } })
      .select('_id status completedAt expiredAt resolvedAt handledAt updatedAt')
      .lean()
    : [];
  return [...new Map([...direct, ...parents].map((request) => [String(request._id), request])).values()];
}

function parsePositiveNumber(value, name, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${name} is required in production`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}

function terminalTimestamp(request) {
  if (!TERMINAL_STATUSES.has(request.status)) return null;
  const value = request.completedAt || request.expiredAt || request.resolvedAt || request.handledAt || request.updatedAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function createReturnEvidenceRetentionService({
  uploadsRoot = DEFAULT_UPLOADS_ROOT,
  retentionDays = process.env.RETURN_EVIDENCE_RETENTION_DAYS,
  unlinkedHours = process.env.RETURN_EVIDENCE_UNLINKED_TTL_HOURS || 24,
  runtime = process.env.NODE_ENV || 'development',
  clock = () => new Date(),
  findReferences = findReferencesFromModels,
} = {}) {
  const resolvedRetentionDays = parsePositiveNumber(
    retentionDays,
    'RETURN_EVIDENCE_RETENTION_DAYS',
    { required: runtime === 'production' },
  );
  const resolvedUnlinkedHours = parsePositiveNumber(unlinkedHours, 'RETURN_EVIDENCE_UNLINKED_TTL_HOURS', { required: true });
  const evidenceRoot = path.resolve(uploadsRoot, 'return-evidence');

  return {
    async cleanup() {
      let entries;
      try {
        entries = await readdir(evidenceRoot, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') return { scanned: 0, deletedUnlinked: 0, deletedRetained: 0 };
        throw error;
      }

      const now = new Date(clock());
      const unlinkedCutoff = now.getTime() - resolvedUnlinkedHours * 60 * 60 * 1000;
      const retentionCutoff = resolvedRetentionDays === null
        ? null
        : now.getTime() - resolvedRetentionDays * 24 * 60 * 60 * 1000;
      const result = { scanned: 0, deletedUnlinked: 0, deletedRetained: 0 };

      for (const entry of entries) {
        if (!entry.isFile() || !SAFE_FILENAME.test(entry.name)) continue;
        result.scanned += 1;
        const target = path.resolve(evidenceRoot, entry.name);
        if (!target.startsWith(`${evidenceRoot}${path.sep}`)) continue;
        const candidateUrls = [
          `/api/return-refunds/evidence/${entry.name}`,
          `/uploads/return-evidence/${entry.name}`,
        ];
        const references = await findReferences(candidateUrls);
        let disposition = '';
        if (!references.length) {
          const metadata = await stat(target);
          if (metadata.mtime.getTime() <= unlinkedCutoff) disposition = 'unlinked';
        } else if (retentionCutoff !== null) {
          const terminalDates = references.map(terminalTimestamp);
          if (terminalDates.every(Boolean)
            && Math.max(...terminalDates.map((date) => date.getTime())) <= retentionCutoff) {
            disposition = 'retained';
          }
        }
        if (!disposition) continue;
        try {
          await unlink(target);
          if (disposition === 'unlinked') result.deletedUnlinked += 1;
          else result.deletedRetained += 1;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      return result;
    },
  };
}

module.exports = {
  createReturnEvidenceRetentionService,
  returnEvidenceRetentionService: createReturnEvidenceRetentionService(),
};
