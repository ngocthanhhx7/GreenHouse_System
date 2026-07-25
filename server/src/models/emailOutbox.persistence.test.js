const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { it } = require('node:test');
const mongoose = require('mongoose');

const EmailOutbox = require('./emailOutbox.model');
const { createModelEmailOutboxRepository } = require('../services/email.service');
const {
  cleanupDisposableMongo,
  resolveMongodBinary,
  startDisposableMongo,
} = require('../testUtils/disposableMongo');

const MONGOD_PATH = resolveMongodBinary();
const MONGOD_AVAILABLE = Boolean(MONGOD_PATH);

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
      : 'Disposable MongoDB integration skipped: no binary found via MONGOD_BINARY, PATH, or common locations',
  },
  async () => {
    let mongoInstance;
    try {
      mongoInstance = await startDisposableMongo({ binary: MONGOD_PATH });

      const database = `greenhome_email_outbox_${randomUUID().replaceAll('-', '')}`;
      await mongoose.connect(`mongodb://127.0.0.1:${mongoInstance.port}/${database}`, {
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
      assert.equal(created.deliveryPolicyVersion, 2);

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
      assert.equal(bulkCreated.deliveryPolicyVersion, 2);

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

      const timeoutObservedAt = new Date(claimTime.getTime() + 1_000);
      const uncertaintyUntil = new Date(timeoutObservedAt.getTime() + (5 * 60_000));
      const timeoutUnknown = await repositoryA.markTimeoutUnknown(
        created._id,
        {
          status: 'Processing',
          uncertaintyUntil,
          attemptCompletedAt: timeoutObservedAt,
          attemptOutcome: 'TimeoutUnknown',
          errorCode: 'EMAIL_PROVIDER_TIMEOUT',
          errorMessage: 'Email provider result is unknown after timeout',
        },
        firstClaim.claimId
      );
      assert.equal(timeoutUnknown.status, 'Processing');
      assert.equal(timeoutUnknown.claimId, firstClaim.claimId);
      assert.equal(timeoutUnknown.leaseUntil.toISOString(), uncertaintyUntil.toISOString());
      assert.equal(timeoutUnknown.attempts[0].outcome, 'TimeoutUnknown');
      assert.equal(
        timeoutUnknown.attempts[0].leaseUntil.toISOString(),
        uncertaintyUntil.toISOString()
      );

      const earlyReclaimRepository = createModelEmailOutboxRepository({
        createClaimId: () => 'integration-claim-too-early',
      });
      const earlyReclaim = await earlyReclaimRepository.claimNext(
        new Date(uncertaintyUntil.getTime() - 1),
        new Date(uncertaintyUntil.getTime() + 9_999)
      );
      assert.equal(earlyReclaim, null);

      const reclaimTime = uncertaintyUntil;
      const secondLeaseUntil = new Date(reclaimTime.getTime() + 10_000);
      const reclaimRepository = createModelEmailOutboxRepository({
        createClaimId: () => 'integration-claim-reclaimed',
      });
      const secondClaim = await reclaimRepository.claimNext(reclaimTime, secondLeaseUntil);
      assert.equal(secondClaim.attemptCount, 2);
      assert.equal(secondClaim.attempts.length, 2);
      assert.equal(secondClaim.attempts[0].attemptNumber, 1);
      assert.equal(secondClaim.attempts[0].outcome, 'TimeoutUnknown');
      assert.equal(secondClaim.attempts[0].errorCode, 'EMAIL_PROVIDER_TIMEOUT');
      assert.equal(secondClaim.attempts[1].attemptNumber, 2);
      assert.equal(secondClaim.attempts[1].outcome, 'Processing');

      const attemptOneEvidence = {
        ...timeoutUnknown.attempts[0],
        completedAt: timeoutUnknown.attempts[0].completedAt.toISOString(),
        claimedAt: timeoutUnknown.attempts[0].claimedAt.toISOString(),
        leaseUntil: timeoutUnknown.attempts[0].leaseUntil.toISOString(),
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

      const legacyReadyAt = new Date('2030-07-26T00:00:00.000Z');
      await EmailOutbox.collection.insertMany([
        {
          eventType: 'INTERNAL_INVITATION_CREATED',
          idempotencyKey: 'integration-legacy-failed-1',
          recipient: 'legacy@example.com',
          payload: { encryptedToken: 'legacy-encrypted-token' },
          status: 'Failed',
          attemptCount: 2,
          attempts: [],
          availableAt: new Date(legacyReadyAt.getTime() - 1),
          leaseUntil: null,
          claimId: '',
          createdAt: new Date('2030-07-24T00:00:00.000Z'),
          updatedAt: new Date('2030-07-24T00:00:00.000Z'),
        },
        {
          eventType: 'INTERNAL_INVITATION_CREATED',
          idempotencyKey: 'integration-current-terminal-failed-1',
          recipient: 'terminal@example.com',
          payload: { encryptedToken: 'terminal-encrypted-token' },
          status: 'Failed',
          attemptCount: 2,
          deliveryPolicyVersion: 2,
          attempts: [],
          availableAt: new Date(legacyReadyAt.getTime() - 1),
          leaseUntil: null,
          claimId: '',
          createdAt: new Date('2030-07-24T00:00:01.000Z'),
          updatedAt: new Date('2030-07-24T00:00:01.000Z'),
        },
      ]);
      const legacyRepository = createModelEmailOutboxRepository({
        createClaimId: () => 'integration-legacy-claim',
      });
      const legacyClaim = await legacyRepository.claimNext(
        legacyReadyAt,
        new Date(legacyReadyAt.getTime() + 10_000)
      );
      assert.equal(legacyClaim.idempotencyKey, 'integration-legacy-failed-1');
      assert.equal(legacyClaim.attemptCount, 3);
      assert.equal(legacyClaim.deliveryPolicyVersion, 2);
      assert.equal(legacyClaim.attempts[0].attemptNumber, 3);
      assert.equal(legacyClaim.attempts[0].outcome, 'Processing');

      const noCurrentTerminalClaim = await legacyRepository.claimNext(
        legacyReadyAt,
        new Date(legacyReadyAt.getTime() + 10_000)
      );
      assert.equal(noCurrentTerminalClaim, null);
      const currentTerminal = await EmailOutbox.findOne({
        idempotencyKey: 'integration-current-terminal-failed-1',
      }).lean();
      assert.equal(currentTerminal.status, 'Failed');
      assert.equal(currentTerminal.attemptCount, 2);
      assert.equal(currentTerminal.deliveryPolicyVersion, 2);
    } finally {
      try {
        await mongoose.disconnect();
      } finally {
        await cleanupDisposableMongo(mongoInstance);
      }
    }
  }
);
