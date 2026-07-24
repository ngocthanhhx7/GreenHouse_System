const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

let migration = {};
try {
  migration = require('./migrateSl008Support');
} catch (_error) {
  // The first red cycle intentionally starts before the production seam exists.
}

const REQUIRED_INDEX_NAMES = [
  'support_ticket_code_unique',
  'support_customer_created_page',
  'support_queue_filter_page',
  'support_assignee_status_page',
  'support_message_chronological',
  'support_message_command_unique',
  'support_history_chronological',
  'support_command_identity_unique',
];

function clone(value) {
  return structuredClone(value);
}

class MemoryCollection {
  constructor(name, documents = [], indexes = [], operations = []) {
    this.name = name;
    this.documents = clone(documents);
    this.indexes = clone(indexes);
    this.operations = operations;
    this.failNextUpdate = false;
  }

  find() {
    return { toArray: async () => clone(this.documents) };
  }

  async listIndexes() {
    return { toArray: async () => clone(this.indexes) };
  }

  async updateOne(filter, update, options) {
    this.operations.push({ type: 'updateOne', collection: this.name, filter: clone(filter), update: clone(update), options: clone(options) });
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('injected request update failure');
    }
    const item = this.documents.find((row) => Object.entries(filter).every(([key, expected]) => (
      expected && typeof expected === 'object' && '$exists' in expected
        ? (expected.$exists ? Object.hasOwn(row, key) : !Object.hasOwn(row, key))
        : String(row[key] ?? '') === String(expected ?? '')
    )));
    if (!item) return { matchedCount: 0, modifiedCount: 0 };
    for (const [key, value] of Object.entries(update.$set || {})) item[key] = clone(value);
    for (const key of Object.keys(update.$unset || {})) delete item[key];
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async insertOne(document, options) {
    this.operations.push({ type: 'insertOne', collection: this.name, document: clone(document), options: clone(options) });
    this.documents.push(clone(document));
    return { acknowledged: true, insertedId: document._id };
  }

  async createIndex(key, options) {
    this.operations.push({ type: 'createIndex', collection: this.name, key: clone(key), options: clone(options) });
    this.indexes.push({ key: clone(key), ...clone(options) });
    return options.name;
  }

  async dropIndex(name) {
    this.operations.push({ type: 'dropIndex', collection: this.name, name });
    this.indexes = this.indexes.filter((index) => index.name !== name);
  }
}

function memoryTransactionManager(fixture) {
  return {
    async withTransaction(work) {
      const snapshot = Object.fromEntries(
        Object.entries(fixture.collections).map(([name, collection]) => [name, clone(collection.documents)]),
      );
      const operationCount = fixture.operations.length;
      const session = { id: 'support-migration-transaction' };
      try {
        return await work(session);
      } catch (error) {
        for (const [name, documents] of Object.entries(snapshot)) {
          fixture.collections[name].documents = documents;
        }
        fixture.operations.length = operationCount;
        throw error;
      }
    },
  };
}

function makeFixture(mutator = () => {}) {
  const createdAt = new Date('2026-07-24T08:00:00.000Z');
  const respondedAt = new Date('2026-07-24T09:00:00.000Z');
  const data = {
    requests: [{
      _id: 'ticket-legacy-1', customerId: 'customer-1', ticketCode: '',
      orderId: 'order-1', productId: null, requestType: 'Order', type: 'Order',
      subject: 'Delivery question', content: 'Please check my delivery status.',
      status: 'New', priority: 'Normal', handledBy: null, response: '',
      createdAt, updatedAt: createdAt,
    }],
    messages: [],
    histories: [],
    commands: [],
  };
  mutator(data);
  const operations = [];
  const legacyIndexes = [
    { name: 'ticketCode_1', key: { ticketCode: 1 }, unique: true },
  ];
  return {
    operations,
    data,
    collections: {
      requests: new MemoryCollection('requests', data.requests, legacyIndexes, operations),
      messages: new MemoryCollection('messages', data.messages, [], operations),
      histories: new MemoryCollection('histories', data.histories, [], operations),
      commands: new MemoryCollection('commands', data.commands, [], operations),
    },
    createdAt,
    respondedAt,
  };
}

function repositoryFor(fixture) {
  return migration.createMigrationRepository({
    collections: fixture.collections,
    transactionManager: memoryTransactionManager(fixture),
  });
}

function mutations(operations) {
  return operations.filter((operation) => (
    operation.type === 'updateOne'
      || operation.type === 'insertOne'
      || operation.type === 'createIndex'
      || operation.type === 'dropIndex'
  ));
}

describe('SL-008 Support migration', () => {
  it('exposes the combined migration command and locked seams', () => {
    const packageJson = require('../../package.json');
    assert.equal(
      packageJson.scripts['migrate:sl008'],
      'node src/scripts/migrateSl008ReviewSupport.js',
    );
    assert.equal(typeof migration.createMigrationRepository, 'function');
    assert.equal(typeof migration.migrateSl008Support, 'function');
    assert.equal(typeof migration.runCli, 'function');
    assert.equal(typeof migration.formatDiagnostic, 'function');
    assert.deepEqual(
      migration.REQUIRED_INDEXES.map((index) => index.name),
      REQUIRED_INDEX_NAMES,
    );
  });

  it('fails duplicate ticket codes and ambiguous mutable responses before any mutation', async () => {
    const duplicate = makeFixture((data) => {
      data.requests.push({ ...clone(data.requests[0]), _id: 'ticket-legacy-2', ticketCode: 'SUP-DUPLICATE' });
      data.requests[0].ticketCode = 'SUP-DUPLICATE';
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(duplicate) }),
      (error) => error?.code === 'SL008_SUPPORT_TICKET_CODE_DUPLICATE',
    );
    assert.deepEqual(mutations(duplicate.operations), []);

    const ambiguous = makeFixture((data) => {
      data.requests[0].response = 'We will call you back.';
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(ambiguous) }),
      (error) => error?.code === 'SL008_SUPPORT_MESSAGE_AMBIGUOUS',
    );
    assert.deepEqual(mutations(ambiguous.operations), []);
  });

  it('backfills an unambiguous legacy request deterministically and preserves source timestamps', async () => {
    const fixture = makeFixture();
    const result = await migration.migrateSl008Support({ repository: repositoryFor(fixture) });
    const request = fixture.collections.requests.documents[0];
    assert.equal(result.businessWrites, 2, 'request and immutable initial message are business writes');
    assert.equal(request.ticketCode, 'SUP-LEGACY-TICKET-1');
    assert.equal(request.status, 'New');
    assert.equal(request.priority, 'Normal');
    assert.equal(request.version, 1);
    assert.equal(new Date(request.createdAt).toISOString(), fixture.createdAt.toISOString());
    assert.equal(fixture.collections.messages.documents.length, 1);
    assert.deepEqual(fixture.collections.messages.documents[0], {
      ticketId: 'ticket-legacy-1',
      actorId: 'customer-1',
      actorRole: 'Customer',
      content: 'Please check my delivery status.',
      commandId: 'SL008-MIGRATION-ticket-legacy-1-initial',
      createdAt: fixture.createdAt,
    });
    assert.equal(Object.hasOwn(request, 'content'), false, 'legacy mutable content is removed only after initial evidence exists');
    assert.equal(Object.hasOwn(request, 'response'), false);
  });

  it('accepts a canonical runtime-created request whose initial command is not a migration key', async () => {
    const fixture = makeFixture((data) => {
      const request = data.requests[0];
      request.ticketCode = 'SUP-20260724-ABCDEF123456';
      request.assigneeId = null;
      request.version = 1;
      delete request.content;
      delete request.response;
      data.messages.push({
        ticketId: request._id,
        actorId: request.customerId,
        actorRole: 'Customer',
        content: 'Canonical initial message.',
        commandId: 'support-create-runtime-0001',
        createdAt: request.createdAt,
      });
    });

    const result = await migration.migrateSl008Support({ repository: repositoryFor(fixture) });

    assert.equal(result.businessWrites, 0);
    assert.equal(fixture.collections.messages.documents.length, 1);
  });

  it('accepts a canonical runtime reopen that clears an inactive assignee with exact System proof', async () => {
    const fixture = makeFixture((data) => {
      const request = data.requests[0];
      const resolvedAt = new Date('2026-07-24T09:00:00.000Z');
      const reopenedAt = new Date('2026-07-24T10:00:00.000Z');
      const reopenDeadline = new Date('2026-07-27T09:00:00.000Z');
      request.ticketCode = 'SUP-20260724-REOPEN000001';
      request.status = 'InProgress';
      request.priority = 'Normal';
      request.assigneeId = null;
      request.handledBy = null;
      request.version = 4;
      request.resolvedAt = resolvedAt;
      request.closedAt = resolvedAt;
      request.reopenDeadlineAt = reopenDeadline;
      request.updatedAt = reopenedAt;
      delete request.content;
      delete request.response;
      data.messages.push(
        {
          ticketId: request._id,
          actorId: request.customerId,
          actorRole: 'Customer',
          content: 'Please check my delivery status.',
          commandId: 'support-runtime-create-0001',
          createdAt: request.createdAt,
        },
        {
          ticketId: request._id,
          actorId: 'staff-1',
          actorRole: 'Staff',
          content: 'Resolved before the customer reopened it.',
          commandId: 'support-runtime-resolve-0001',
          createdAt: resolvedAt,
        },
        {
          ticketId: request._id,
          actorId: request.customerId,
          actorRole: 'Customer',
          content: 'The same delivery issue returned.',
          commandId: 'support-runtime-reopen-0001',
          createdAt: reopenedAt,
        },
      );
      data.histories.push(
        {
          ticketId: request._id,
          kind: 'Assignment',
          actorId: 'staff-1',
          actorRole: 'Staff',
          beforeAssigneeId: null,
          afterAssigneeId: 'staff-1',
          version: 2,
          createdAt: new Date('2026-07-24T08:30:00.000Z'),
        },
        {
          ticketId: request._id,
          kind: 'Resolution',
          actorId: 'staff-1',
          actorRole: 'Staff',
          beforeStatus: 'InProgress',
          afterStatus: 'Resolved',
          transition: 'Resolved',
          version: 3,
          resolvedAt,
          reopenDeadline,
          createdAt: resolvedAt,
        },
        {
          ticketId: request._id,
          kind: 'Assignment',
          actorId: 'staff-1',
          actorRole: 'System',
          beforeAssigneeId: 'staff-1',
          afterAssigneeId: null,
          reason: 'ASSIGNEE_DISABLED',
          version: 4,
          createdAt: reopenedAt,
        },
        {
          ticketId: request._id,
          kind: 'Resolution',
          actorId: request.customerId,
          actorRole: 'Customer',
          beforeStatus: 'Resolved',
          afterStatus: 'InProgress',
          transition: 'Reopened',
          version: 4,
          resolvedAt,
          reopenDeadline,
          createdAt: reopenedAt,
        },
      );
    });

    const result = await migration.migrateSl008Support({ repository: repositoryFor(fixture) });

    assert.equal(result.businessWrites, 0);
    assert.deepEqual(mutations(fixture.operations).filter(
      (operation) => operation.type === 'updateOne' || operation.type === 'insertOne',
    ), []);
  });

  it('rolls back the initial message when the request update fails and reruns cleanly', async () => {
    const fixture = makeFixture();
    const repository = repositoryFor(fixture);
    const beforeRequests = clone(fixture.collections.requests.documents);
    fixture.collections.requests.failNextUpdate = true;

    await assert.rejects(
      () => migration.migrateSl008Support({ repository }),
      /injected request update failure/u,
    );

    assert.deepEqual(fixture.collections.requests.documents, beforeRequests);
    assert.deepEqual(fixture.collections.messages.documents, []);
    assert.deepEqual(mutations(fixture.operations), []);

    const result = await migration.migrateSl008Support({ repository });
    assert.equal(result.businessWrites, 2);
    assert.equal(fixture.collections.messages.documents.length, 1);
    assert.equal(Object.hasOwn(fixture.collections.requests.documents[0], 'content'), false);
  });

  it('rejects a legacy Open/response row when assignment or response chronology is not provable', async () => {
    const fixture = makeFixture((data) => {
      data.requests[0].status = 'Open';
      data.requests[0].response = 'A response without actor metadata';
      data.requests[0].respondedAt = new Date('2026-07-24T09:00:00.000Z');
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(fixture) }),
      (error) => error?.code === 'SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS',
    );
    assert.deepEqual(mutations(fixture.operations), []);
  });

  it('rejects assigned New and InProgress rows without matching immutable assignment history', async () => {
    const assignedNew = makeFixture((data) => {
      data.requests[0].handledBy = 'staff-1';
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(assignedNew) }),
      (error) => error?.code === 'SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS',
    );
    assert.deepEqual(mutations(assignedNew.operations), []);

    const inProgress = makeFixture((data) => {
      data.requests[0].status = 'InProgress';
      data.requests[0].handledBy = 'staff-1';
      data.requests[0].version = 2;
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(inProgress) }),
      (error) => error?.code === 'SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS',
    );
    assert.deepEqual(mutations(inProgress.operations), []);
  });

  it('rejects System assignment clears without the exact disabled-assignee proof', async () => {
    const fixture = makeFixture((data) => {
      const request = data.requests[0];
      request.status = 'InProgress';
      request.handledBy = null;
      request.version = 3;
      request.updatedAt = new Date('2026-07-24T08:30:00.000Z');
      data.histories.push(
        {
          ticketId: request._id,
          kind: 'Assignment',
          actorId: 'staff-1',
          actorRole: 'Staff',
          beforeAssigneeId: null,
          afterAssigneeId: 'staff-1',
          version: 2,
          createdAt: new Date('2026-07-24T08:20:00.000Z'),
        },
        {
          ticketId: request._id,
          kind: 'Assignment',
          actorId: 'staff-1',
          actorRole: 'System',
          beforeAssigneeId: 'staff-1',
          afterAssigneeId: null,
          version: 3,
          createdAt: request.updatedAt,
        },
      );
    });

    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(fixture) }),
      (error) => error?.code === 'SL008_SUPPORT_HISTORY_AMBIGUOUS',
    );
    assert.deepEqual(mutations(fixture.operations), []);
  });

  it('rejects Resolved rows whose immutable history does not retain an assignee', async () => {
    const fixture = makeFixture((data) => {
      const request = data.requests[0];
      const resolvedAt = new Date('2026-07-24T09:00:00.000Z');
      request.status = 'Resolved';
      request.handledBy = null;
      request.version = 3;
      request.resolvedAt = resolvedAt;
      request.closedAt = resolvedAt;
      request.reopenDeadlineAt = new Date('2026-07-27T09:00:00.000Z');
      request.updatedAt = resolvedAt;
      data.messages.push(
        {
          ticketId: request._id,
          actorId: request.customerId,
          actorRole: 'Customer',
          content: request.content,
          commandId: `SL008-MIGRATION-${request._id}-initial`,
          createdAt: request.createdAt,
        },
        {
          ticketId: request._id,
          actorId: 'staff-1',
          actorRole: 'Staff',
          content: 'Resolved with no retained assignee.',
          commandId: 'resolve-command-no-assignee',
          createdAt: resolvedAt,
        },
      );
      data.histories.push(
        {
          ticketId: request._id,
          kind: 'Assignment',
          actorId: 'staff-1',
          actorRole: 'Staff',
          beforeAssigneeId: null,
          afterAssigneeId: 'staff-1',
          version: 2,
          createdAt: new Date('2026-07-24T08:30:00.000Z'),
        },
        {
          ticketId: request._id,
          kind: 'Resolution',
          actorId: 'staff-1',
          actorRole: 'Staff',
          beforeStatus: 'InProgress',
          afterStatus: 'Resolved',
          transition: 'Resolved',
          version: 3,
          resolvedAt,
          reopenDeadline: request.reopenDeadlineAt,
          createdAt: resolvedAt,
        },
      );
    });

    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(fixture) }),
      (error) => error?.code === 'SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS',
    );
    assert.deepEqual(mutations(fixture.operations), []);
  });

  it('rejects a Resolved history attributed to Staff other than the retained assignee', async () => {
    const fixture = makeFixture((data) => {
      const request = data.requests[0];
      const resolvedAt = new Date('2026-07-24T09:00:00.000Z');
      request.status = 'Resolved';
      request.handledBy = 'staff-1';
      request.assigneeId = 'staff-1';
      request.version = 3;
      request.resolvedAt = resolvedAt;
      request.closedAt = resolvedAt;
      request.reopenDeadlineAt = new Date('2026-07-27T09:00:00.000Z');
      request.updatedAt = resolvedAt;
      data.messages.push(
        {
          ticketId: request._id,
          actorId: request.customerId,
          actorRole: 'Customer',
          content: request.content,
          commandId: `SL008-MIGRATION-${request._id}-initial`,
          createdAt: request.createdAt,
        },
        {
          ticketId: request._id,
          actorId: 'staff-1',
          actorRole: 'Staff',
          content: 'Resolved by the retained assignee.',
          commandId: 'resolve-command-retained-assignee',
          createdAt: resolvedAt,
        },
      );
      data.histories.push(
        {
          ticketId: request._id,
          kind: 'Assignment',
          actorId: 'staff-1',
          actorRole: 'Staff',
          beforeAssigneeId: null,
          afterAssigneeId: 'staff-1',
          version: 2,
          createdAt: new Date('2026-07-24T08:30:00.000Z'),
        },
        {
          ticketId: request._id,
          kind: 'Resolution',
          actorId: 'staff-2',
          actorRole: 'Staff',
          beforeStatus: 'InProgress',
          afterStatus: 'Resolved',
          transition: 'Resolved',
          version: 3,
          resolvedAt,
          reopenDeadline: request.reopenDeadlineAt,
          createdAt: resolvedAt,
        },
      );
    });

    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(fixture) }),
      (error) => error?.code === 'SL008_SUPPORT_HISTORY_AMBIGUOUS',
    );
    assert.deepEqual(mutations(fixture.operations), []);
  });

  it('rejects Resolved rows without matching resolution history and final Staff message evidence', async () => {
    const fixture = makeFixture((data) => {
      const resolvedAt = new Date('2026-07-24T09:00:00.000Z');
      data.requests[0].status = 'Resolved';
      data.requests[0].handledBy = 'staff-1';
      data.requests[0].resolvedAt = resolvedAt;
      data.requests[0].closedAt = resolvedAt;
      data.requests[0].updatedAt = resolvedAt;
      data.requests[0].version = 3;
      data.histories.push({
        ticketId: 'ticket-legacy-1',
        kind: 'Assignment',
        actorId: 'staff-1',
        actorRole: 'Staff',
        beforeAssigneeId: null,
        afterAssigneeId: 'staff-1',
        version: 2,
        createdAt: new Date('2026-07-24T08:30:00.000Z'),
      });
    });

    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(fixture) }),
      (error) => error?.code === 'SL008_SUPPORT_RESOLUTION_AMBIGUOUS',
    );
    assert.deepEqual(mutations(fixture.operations), []);
  });

  it('rejects impossible state transition versions and histories older than request creation', async () => {
    const inProgressV1 = makeFixture((data) => {
      data.requests[0].status = 'InProgress';
      data.requests[0].handledBy = 'staff-1';
      data.requests[0].version = 1;
      data.histories.push({
        ticketId: 'ticket-legacy-1', kind: 'Assignment', actorId: 'staff-1',
        actorRole: 'Staff', beforeAssigneeId: null, afterAssigneeId: 'staff-1',
        version: 1, createdAt: data.requests[0].createdAt,
      });
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(inProgressV1) }),
      (error) => error?.code === 'SL008_SUPPORT_HISTORY_AMBIGUOUS',
    );
    assert.deepEqual(mutations(inProgressV1.operations), []);

    const historyBeforeCreation = makeFixture((data) => {
      data.requests[0].status = 'InProgress';
      data.requests[0].handledBy = 'staff-1';
      data.requests[0].version = 2;
      data.histories.push({
        ticketId: 'ticket-legacy-1', kind: 'Assignment', actorId: 'staff-1',
        actorRole: 'Staff', beforeAssigneeId: null, afterAssigneeId: 'staff-1',
        version: 2, createdAt: new Date('2026-07-24T07:59:59.999Z'),
      });
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(historyBeforeCreation) }),
      (error) => error?.code === 'SL008_SUPPORT_HISTORY_AMBIGUOUS',
    );
    assert.deepEqual(mutations(historyBeforeCreation.operations), []);

    for (const [name, mutate] of [
      ['System assignment', (data) => {
        data.requests[0].status = 'InProgress';
        data.requests[0].handledBy = 'staff-1';
        data.requests[0].version = 2;
        data.histories.push({
          ticketId: 'ticket-legacy-1', kind: 'Assignment', actorId: 'system-1',
          actorRole: 'System', beforeAssigneeId: null, afterAssigneeId: 'staff-1',
          version: 2, createdAt: new Date('2026-07-24T08:30:00.000Z'),
        });
      }],
      ['Staff unassignment', (data) => {
        data.requests[0].status = 'InProgress';
        data.requests[0].version = 3;
        data.histories.push(
          {
            ticketId: 'ticket-legacy-1', kind: 'Assignment', actorId: 'staff-1',
            actorRole: 'Staff', beforeAssigneeId: null, afterAssigneeId: 'staff-1',
            version: 2, createdAt: new Date('2026-07-24T08:20:00.000Z'),
          },
          {
            ticketId: 'ticket-legacy-1', kind: 'Assignment', actorId: 'staff-1',
            actorRole: 'Staff', beforeAssigneeId: 'staff-1', afterAssigneeId: null,
            version: 3, createdAt: new Date('2026-07-24T08:30:00.000Z'),
          },
        );
      }],
      ['Resolved without reopen', (data) => {
        data.requests[0].status = 'InProgress';
        data.requests[0].handledBy = 'staff-1';
        data.requests[0].version = 3;
        data.histories.push(
          {
            ticketId: 'ticket-legacy-1', kind: 'Assignment', actorId: 'staff-1',
            actorRole: 'Staff', beforeAssigneeId: null, afterAssigneeId: 'staff-1',
            version: 2, createdAt: new Date('2026-07-24T08:20:00.000Z'),
          },
          {
            ticketId: 'ticket-legacy-1', kind: 'Resolution', actorId: 'staff-1',
            actorRole: 'Staff', beforeStatus: 'InProgress', afterStatus: 'Resolved',
            transition: 'Resolved', version: 3,
            resolvedAt: new Date('2026-07-24T08:30:00.000Z'),
            reopenDeadline: new Date('2026-07-27T08:30:00.000Z'),
            createdAt: new Date('2026-07-24T08:30:00.000Z'),
          },
        );
      }],
    ]) {
      const fixture = makeFixture(mutate);
      await assert.rejects(
        () => migration.migrateSl008Support({ repository: repositoryFor(fixture) }),
        (error) => error?.code === 'SL008_SUPPORT_HISTORY_AMBIGUOUS',
        name,
      );
      assert.deepEqual(mutations(fixture.operations), [], name);
    }

    const resolvedWithLaterVersion = makeFixture((data) => {
      const request = data.requests[0];
      const resolvedAt = new Date('2026-07-24T09:00:00.000Z');
      request.status = 'Resolved';
      request.handledBy = 'staff-1';
      request.version = 4;
      request.resolvedAt = resolvedAt;
      request.closedAt = resolvedAt;
      request.reopenDeadlineAt = new Date('2026-07-27T09:00:00.000Z');
      request.updatedAt = new Date('2026-07-24T09:30:00.000Z');
      data.messages.push(
        {
          ticketId: request._id, actorId: request.customerId, actorRole: 'Customer',
          content: request.content, commandId: `SL008-MIGRATION-${request._id}-initial`,
          createdAt: request.createdAt,
        },
        {
          ticketId: request._id, actorId: 'staff-1', actorRole: 'Staff',
          content: 'Resolved.', commandId: 'resolve-command-1', createdAt: resolvedAt,
        },
      );
      data.histories.push(
        {
          ticketId: request._id, kind: 'Assignment', actorId: 'staff-1',
          actorRole: 'Staff', beforeAssigneeId: null, afterAssigneeId: 'staff-1',
          version: 2, createdAt: new Date('2026-07-24T08:30:00.000Z'),
        },
        {
          ticketId: request._id, kind: 'Resolution', actorId: 'staff-1',
          actorRole: 'Staff', beforeStatus: 'InProgress', afterStatus: 'Resolved',
          transition: 'Resolved', version: 3, resolvedAt,
          reopenDeadline: request.reopenDeadlineAt, createdAt: resolvedAt,
        },
      );
    });
    await assert.rejects(
      () => migration.migrateSl008Support({ repository: repositoryFor(resolvedWithLaterVersion) }),
      (error) => error?.code === 'SL008_SUPPORT_RESOLUTION_AMBIGUOUS',
    );
    assert.deepEqual(mutations(resolvedWithLaterVersion.operations), []);
  });

  it('dry-runs with no business/index writes and a second real run is zero-write', async () => {
    const fixture = makeFixture();
    const repository = repositoryFor(fixture);
    const before = clone(fixture.collections.requests.documents);
    const dryRun = await migration.migrateSl008Support({ repository, dryRun: true });
    assert.equal(dryRun.businessWrites, 0);
    assert.equal(dryRun.indexesCreated, 0);
    assert.deepEqual(fixture.collections.requests.documents, before);
    assert.deepEqual(mutations(fixture.operations), []);

    const first = await migration.migrateSl008Support({ repository });
    const afterFirst = fixture.operations.length;
    const second = await migration.migrateSl008Support({ repository });
    assert.ok(first.indexesCreated > 0);
    assert.equal(second.businessWrites, 0);
    assert.equal(second.indexesCreated, 0);
    assert.deepEqual(fixture.operations.slice(afterFirst), []);
  });

  it('replaces the obsolete actor-only command key with the canonical scoped identity', async () => {
    const fixture = makeFixture();
    fixture.collections.commands.indexes.push({
      name: 'actorId_1_idempotencyKey_1',
      key: { actorId: 1, idempotencyKey: 1 },
      unique: true,
    });

    await migration.migrateSl008Support({ repository: repositoryFor(fixture) });

    assert.equal(
      fixture.collections.commands.indexes.some(
        (index) => index.name === 'actorId_1_idempotencyKey_1',
      ),
      false,
    );
    assert.ok(
      fixture.collections.commands.indexes.some(
        (index) => index.name === 'support_command_identity_unique',
      ),
    );
  });

  it('formats diagnostics without private identifiers or user text', () => {
    const error = new Error(`secret support message ${'x'.repeat(2000)}`);
    error.code = 'SL008_SUPPORT_MESSAGE_AMBIGUOUS';
    error.ticketId = 'internal-ticket-1';
    assert.doesNotMatch(
      migration.formatDiagnostic(error),
      /secret support message|internal-ticket-1/u,
    );
    assert.match(migration.formatDiagnostic(error), /SL008_SUPPORT_MESSAGE_AMBIGUOUS/u);
  });
});
