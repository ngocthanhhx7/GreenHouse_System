const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdir, mkdtemp, rm, stat, utimes, writeFile } = require('node:fs/promises');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { createReturnEvidenceRetentionService } = require('./returnEvidenceRetention.service');

async function exists(target) {
  try { await stat(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

describe('return evidence retention service', () => {
  let root;
  let evidenceRoot;
  const now = new Date('2026-07-23T10:00:00.000Z');

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'greenhome-evidence-retention-'));
    evidenceRoot = path.join(root, 'return-evidence');
    await mkdir(evidenceRoot, { recursive: true });
  });

  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function createFile(index, ageDays) {
    const filename = `11111111-1111-4111-8111-${String(index).padStart(12, '0')}.jpg`;
    const target = path.join(evidenceRoot, filename);
    await writeFile(target, Buffer.from([0xff, 0xd8, 0xff]));
    const modified = new Date(now.getTime() - ageDays * 24 * 60 * 60 * 1000);
    await utimes(target, modified, modified);
    return { filename, target };
  }

  it('deletes only stale unlinked uploads and keeps fresh unlinked uploads', async () => {
    const stale = await createFile(1, 2);
    const fresh = await createFile(2, 0.25);
    const service = createReturnEvidenceRetentionService({
      uploadsRoot: root, retentionDays: 30, unlinkedHours: 24,
      clock: () => now, findReferences: async () => [],
    });
    const result = await service.cleanup();
    assert.equal(await exists(stale.target), false);
    assert.equal(await exists(fresh.target), true);
    assert.deepEqual(result, { scanned: 2, deletedUnlinked: 1, deletedRetained: 0 });
  });

  it('keeps active evidence and deletes terminal evidence only after the configured retention', async () => {
    const active = await createFile(3, 90);
    const oldTerminal = await createFile(4, 90);
    const recentTerminal = await createFile(5, 90);
    const references = new Map([
      [active.filename, [{ status: 'Approved', updatedAt: new Date('2026-04-01T00:00:00Z') }]],
      [oldTerminal.filename, [{ status: 'Completed', completedAt: new Date('2026-05-01T00:00:00Z') }]],
      [recentTerminal.filename, [{ status: 'Rejected', resolvedAt: new Date('2026-07-10T00:00:00Z') }]],
    ]);
    const service = createReturnEvidenceRetentionService({
      uploadsRoot: root, retentionDays: 30, unlinkedHours: 24, clock: () => now,
      findReferences: async (candidateUrls) => references.get(path.basename(candidateUrls[0])) || [],
    });
    const result = await service.cleanup();
    assert.equal(await exists(active.target), true);
    assert.equal(await exists(oldTerminal.target), false);
    assert.equal(await exists(recentTerminal.target), true);
    assert.equal(result.deletedRetained, 1);
  });

  it('requires an explicit approved retention duration in production', () => {
    assert.throws(
      () => createReturnEvidenceRetentionService({ retentionDays: '', runtime: 'production' }),
      /RETURN_EVIDENCE_RETENTION_DAYS.*required/i,
    );
  });
});
