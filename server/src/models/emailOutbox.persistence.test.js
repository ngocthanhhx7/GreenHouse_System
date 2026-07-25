const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { it } = require('node:test');
const mongoose = require('mongoose');

const EmailOutbox = require('./emailOutbox.model');
const { createModelEmailOutboxRepository } = require('../services/email.service');

const MONGOD_PATH = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
const MONGOD_AVAILABLE = fs.existsSync(MONGOD_PATH);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  return port;
}

async function waitForMongoPort(child, port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Disposable mongod exited before readiness (${child.exitCode})`);
    }
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(200);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      const unavailable = () => {
        socket.destroy();
        resolve(false);
      };
      socket.once('error', unavailable);
      socket.once('timeout', unavailable);
    });
    if (connected) return;
    await delay(50);
  }
  throw new Error('Disposable mongod did not become ready within 15 seconds');
}

function signalAndWaitForExit(child, signal, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (result) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(result);
    };
    const onExit = () => finish(true);
    child.once('exit', onExit);
    timer = setTimeout(() => finish(child.exitCode !== null), timeoutMs);
    try {
      if (!child.kill(signal) && child.exitCode === null) finish(false);
    } catch (error) {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      reject(error);
    }
  });
}

async function stopSpawnedMongo(child) {
  if (!child || child.exitCode !== null) return;
  if (await signalAndWaitForExit(child, 'SIGTERM', 5_000)) return;
  if (await signalAndWaitForExit(child, 'SIGKILL', 2_000)) return;
  throw new Error(`Disposable mongod process ${child.pid} did not stop`);
}

function removeVerifiedTempDirectory(directory) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(tempRoot)
      || !path.basename(resolved).startsWith('greenhome-email-outbox-')) {
    throw new Error(`Refusing to remove unverified disposable Mongo directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function completionData(status, completedAt, providerMessageId = '') {
  return {
    status,
    availableAt: null,
    sentAt: status === 'Sent' ? completedAt : null,
    attemptCompletedAt: completedAt,
    attemptOutcome: status,
    errorCode: '',
    errorMessage: '',
    providerMessageId,
  };
}

it(
  'AT-178 persists one atomic claim, append-only reclaim evidence, and immutable payload',
  {
    timeout: 30_000,
    skip: MONGOD_AVAILABLE
      ? false
      : `Disposable MongoDB integration skipped: ${MONGOD_PATH} is unavailable`,
  },
  async () => {
    let child;
    let dbPath;
    try {
      dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'greenhome-email-outbox-'));
      const port = await reservePort();
      child = spawn(MONGOD_PATH, [
        '--dbpath', dbPath,
        '--port', String(port),
        '--bind_ip', '127.0.0.1',
        '--quiet',
        '--logpath', path.join(dbPath, 'mongod.log'),
      ], {
        windowsHide: true,
        stdio: 'ignore',
      });
      await waitForMongoPort(child, port);

      const database = `greenhome_email_outbox_${randomUUID().replaceAll('-', '')}`;
      await mongoose.connect(`mongodb://127.0.0.1:${port}/${database}`, {
        serverSelectionTimeoutMS: 2_000,
      });
      await EmailOutbox.syncIndexes();

      const created = await EmailOutbox.create({
        eventType: 'INTERNAL_INVITATION_CREATED',
        idempotencyKey: 'integration-invitation-1',
        recipient: 'staff@example.com',
        payload: {
          invitationId: 'invitation-1',
          roleName: 'Staff',
          encryptedToken: 'encrypted-token',
          rawToken: 'must-not-persist',
        },
      });
      assert.deepEqual(created.payload, {
        invitationId: 'invitation-1',
        roleName: 'Staff',
        encryptedToken: 'encrypted-token',
      });

      await EmailOutbox.bulkWrite([{
        insertOne: {
          document: {
            eventType: 'INTERNAL_INVITATION_CREATED',
            idempotencyKey: 'integration-invitation-bulk-1',
            recipient: 'bulk-staff@example.com',
            status: 'Sent',
            availableAt: null,
            sentAt: new Date('2030-07-24T00:00:00.000Z'),
            payload: {
              invitationId: 'invitation-bulk-1',
              encryptedToken: 'bulk-encrypted-token',
              rawToken: 'must-not-persist',
            },
          },
        },
      }], { skipValidation: true });
      const bulkCreated = await EmailOutbox.findOne({
        idempotencyKey: 'integration-invitation-bulk-1',
      }).lean();
      assert.deepEqual(bulkCreated.payload, {
        invitationId: 'invitation-bulk-1',
        encryptedToken: 'bulk-encrypted-token',
      });

      const claimTime = new Date('2030-07-25T00:00:00.000Z');
      const firstLeaseUntil = new Date('2030-07-25T00:00:10.000Z');
      const repositoryA = createModelEmailOutboxRepository({
        createClaimId: () => 'integration-claim-a',
      });
      const repositoryB = createModelEmailOutboxRepository({
        createClaimId: () => 'integration-claim-b',
      });
      const claims = await Promise.all([
        repositoryA.claimNext(claimTime, firstLeaseUntil),
        repositoryB.claimNext(claimTime, firstLeaseUntil),
      ]);
      const winners = claims.filter(Boolean);
      assert.equal(winners.length, 1);
      const firstClaim = winners[0];
      assert.equal(firstClaim.attemptCount, 1);
      assert.equal(firstClaim.attempts.length, 1);
      assert.equal(firstClaim.attempts[0].attemptNumber, 1);
      assert.equal(firstClaim.attempts[0].outcome, 'Processing');

      const reclaimTime = new Date(firstLeaseUntil.getTime() + 1);
      const secondLeaseUntil = new Date(reclaimTime.getTime() + 10_000);
      const reclaimRepository = createModelEmailOutboxRepository({
        createClaimId: () => 'integration-claim-reclaimed',
      });
      const secondClaim = await reclaimRepository.claimNext(reclaimTime, secondLeaseUntil);
      assert.equal(secondClaim.attemptCount, 2);
      assert.equal(secondClaim.attempts.length, 2);
      assert.equal(secondClaim.attempts[0].attemptNumber, 1);
      assert.equal(secondClaim.attempts[0].outcome, 'LeaseExpired');
      assert.equal(secondClaim.attempts[0].errorCode, 'EMAIL_LEASE_EXPIRED');
      assert.equal(secondClaim.attempts[1].attemptNumber, 2);
      assert.equal(secondClaim.attempts[1].outcome, 'Processing');

      const attemptOneEvidence = {
        ...secondClaim.attempts[0],
        completedAt: secondClaim.attempts[0].completedAt.toISOString(),
        claimedAt: secondClaim.attempts[0].claimedAt.toISOString(),
        leaseUntil: secondClaim.attempts[0].leaseUntil.toISOString(),
      };
      const staleFinalization = await repositoryA.markSent(
        created._id,
        completionData('Sent', new Date(reclaimTime.getTime() + 1), 'stale-provider-id'),
        firstClaim.claimId
      );
      assert.equal(staleFinalization, null);

      const completionTime = new Date(reclaimTime.getTime() + 2);
      const finalized = await reclaimRepository.markSent(
        created._id,
        completionData('Sent', completionTime, 'provider-message-2'),
        secondClaim.claimId
      );
      assert.equal(finalized.status, 'Sent');
      assert.equal(finalized.attemptCount, 2);
      assert.equal(finalized.attempts.length, 2);
      assert.deepEqual({
        ...finalized.attempts[0],
        completedAt: finalized.attempts[0].completedAt.toISOString(),
        claimedAt: finalized.attempts[0].claimedAt.toISOString(),
        leaseUntil: finalized.attempts[0].leaseUntil.toISOString(),
      }, attemptOneEvidence);
      assert.equal(finalized.attempts[1].outcome, 'Sent');
      assert.equal(finalized.attempts[1].providerMessageId, 'provider-message-2');

      const payloadMutationAttempts = [
        () => EmailOutbox.updateOne(
          { _id: created._id },
          { $set: { 'payload.encryptedToken': 'replacement' } }
        ),
        () => EmailOutbox.updateMany(
          { _id: created._id },
          { $unset: { 'payload.roleName': 1 } }
        ),
        () => EmailOutbox.findOneAndUpdate(
          { _id: created._id },
          [{ $set: { payload: { rawToken: 'replacement' } } }]
        ),
        () => EmailOutbox.findOneAndUpdate(
          { _id: created._id },
          [{ $project: { status: 1 } }]
        ),
        () => EmailOutbox.replaceOne(
          { _id: created._id },
          {
            eventType: created.eventType,
            idempotencyKey: created.idempotencyKey,
            recipient: created.recipient,
            payload: { encryptedToken: 'replacement' },
          }
        ),
        () => EmailOutbox.findOneAndReplace(
          { _id: created._id },
          {
            eventType: created.eventType,
            idempotencyKey: created.idempotencyKey,
            recipient: created.recipient,
            payload: { encryptedToken: 'replacement' },
          }
        ),
        () => EmailOutbox.bulkWrite([{
          updateOne: {
            filter: { _id: created._id },
            update: { $set: { payload: { rawToken: 'replacement' } } },
          },
        }]),
        () => EmailOutbox.bulkWrite([{
          updateOne: {
            filter: { _id: created._id },
            update: [{ $project: { status: 1 } }],
          },
        }]),
        () => EmailOutbox.bulkWrite([{
          updateMany: {
            filter: { _id: created._id },
            update: { $unset: { 'payload.roleName': 1 } },
          },
        }]),
        () => EmailOutbox.bulkWrite([{
          replaceOne: {
            filter: { _id: created._id },
            replacement: {
              eventType: created.eventType,
              idempotencyKey: created.idempotencyKey,
              recipient: created.recipient,
              payload: { encryptedToken: 'replacement' },
            },
          },
        }]),
      ];
      for (const attemptMutation of payloadMutationAttempts) {
        await assert.rejects(attemptMutation(), (error) => {
          assert.equal(error.code, 'EMAIL_OUTBOX_PAYLOAD_IMMUTABLE');
          return true;
        });
      }

      const documentMutation = await EmailOutbox.findById(created._id);
      documentMutation.payload = { encryptedToken: 'replacement' };
      await documentMutation.save();

      const persisted = await EmailOutbox.findById(created._id).lean();
      assert.deepEqual(persisted.payload, {
        invitationId: 'invitation-1',
        roleName: 'Staff',
        encryptedToken: 'encrypted-token',
      });
    } finally {
      try {
        await mongoose.disconnect();
      } finally {
        await stopSpawnedMongo(child);
        removeVerifiedTempDirectory(dbPath);
      }
    }
  }
);
