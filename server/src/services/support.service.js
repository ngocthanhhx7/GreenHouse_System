const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const OrderDetail = require('../models/orderDetail.model');
const SupportRequest = require('../models/supportRequest.model');
const SupportMessage = require('../models/supportMessage.model');
const SupportHistory = require('../models/supportHistory.model');
const SupportCommand = require('../models/supportCommand.model');
const { logAudit } = require('../utils/auditLogger');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');
const {
  commandFingerprint,
} = require('./review.domain');

const REQUEST_TYPES = new Set([
  'Order', 'Payment', 'ReturnRefund', 'Exchange', 'Product', 'Account', 'Other',
]);
const ORDER_TYPES = new Set(['Order', 'Payment', 'ReturnRefund', 'Exchange']);
const PRIORITIES = new Set(['Low', 'Normal', 'High', 'Urgent']);
const STATUSES = new Set(['New', 'InProgress', 'Resolved', 'Withdrawn']);
const PAGE_MAX = 50;
const REOPEN_MS = 72 * 60 * 60 * 1000;

function supportError(statusCode, errorCode, message, data = null) {
  return new ApiError(statusCode, message, [], errorCode, data);
}

function idOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String(value.id ?? value._id ?? '');
  return String(value);
}

function actorRole(actor) {
  return typeof actor === 'object' ? actor.role : undefined;
}

function actorStatus(actor) {
  return typeof actor === 'object' ? actor.status : undefined;
}

function clone(value) {
  if (value === undefined || value === null) return value;
  return structuredClone(value);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/[<>]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parsePage(filters = {}) {
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const pageSize = filters.pageSize === undefined ? 20 : Number(filters.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_MAX) {
    throw supportError(400, 'SUPPORT_FILTER_INVALID', 'Support filter is invalid');
  }
  return { page, pageSize };
}

function page(items, paging) {
  const total = items.length;
  const start = (paging.page - 1) * paging.pageSize;
  return {
    items: items.slice(start, start + paging.pageSize),
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.ceil(total / paging.pageSize),
  };
}

function validateEnvelope(command, options, { create = false } = {}) {
  const key = typeof options?.idempotencyKey === 'string' ? options.idempotencyKey.trim() : '';
  const expectedVersion = command?.expectedVersion;
  if (!command || typeof command !== 'object' || Array.isArray(command)
    || Object.prototype.hasOwnProperty.call(command, 'idempotencyKey')
    || key.length < 8 || key.length > 128
    || !Number.isInteger(expectedVersion) || expectedVersion < 0
    || (create && expectedVersion !== 0)) {
    throw supportError(400, 'COMMAND_VALIDATION_FAILED', 'Support command metadata is invalid');
  }
  return { idempotencyKey: key, expectedVersion };
}

function validateInputText(value, min, max) {
  const text = normalizeText(value);
  if (text.length < min || text.length > max) {
    throw supportError(400, 'SUPPORT_VALIDATION_FAILED', 'Support input is invalid');
  }
  return text;
}

function requireCustomer(actor) {
  if (actorRole(actor) !== 'Customer' || !idOf(actor) || actorStatus(actor) !== 'Active') {
    throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
  }
}

function requireStaff(actor) {
  if (actorRole(actor) !== 'Staff' || !idOf(actor) || actorStatus(actor) !== 'Active') {
    throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
  }
}

function ticketId(ticket) { return idOf(ticket?.id ?? ticket?._id); }

function ticketType(ticket) { return ticket.type || ticket.requestType; }

function publicTicket(ticket) {
  if (!ticket) return null;
  return {
    id: ticketId(ticket),
    ticketCode: ticket.ticketCode,
    type: ticketType(ticket),
    subject: ticket.subject,
    orderId: ticket.orderId ?? null,
    productId: ticket.productId ?? null,
    status: ticket.status,
    priority: ticket.priority || 'Normal',
    assigneeId: ticket.assigneeId ?? ticket.handledBy ?? null,
    resolvedAt: ticket.resolvedAt ?? ticket.closedAt ?? null,
    reopenDeadline: ticket.reopenDeadlineAt ?? null,
    version: Number(ticket.version || 1),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt || ticket.createdAt,
  };
}

function messageDto(message, { internal = false } = {}) {
  const result = {
    id: idOf(message.id ?? message._id),
    actorRole: message.actorRole || message.senderRole,
    content: message.content,
    createdAt: message.createdAt,
  };
  if (internal) {
    result.actorId = idOf(message.actorId ?? message.senderId);
    result.commandId = message.commandId;
  }
  return result;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function withSession(query, session) { return session ? query.session(session) : query; }

function createModelRepository() {
  return {
    async findUserById(id, session) {
      // User is deliberately lazy-loaded to avoid a circular import in older deployments.
      const User = require('../models/user.model');
      return withSession(User.findById(id), session).lean();
    },
    async findOrderById(id, session) { return withSession(Order.findById(id), session).lean(); },
    async findProductById(id, session) { return withSession(Product.findById(id), session).lean(); },
    async findOrderDetail(orderId, productId, session) {
      return withSession(OrderDetail.findOne({ orderId, productId }), session).lean();
    },
    async insertTicket(data, session) {
      const [created] = await SupportRequest.create([data], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
    async createRequest(data, session) { return this.insertTicket(data, session); },
    async findTicketById(id, session) { return withSession(SupportRequest.findById(id), session).lean(); },
    async findRequestById(id, session) { return this.findTicketById(id, session); },
    async updateTicketByVersion(id, expectedVersion, changes, session) {
      return withSession(
        SupportRequest.findOneAndUpdate(
          { _id: id, version: Number(expectedVersion) },
          { $set: changes, $inc: { version: 1 } },
          { new: true, runValidators: true },
        ),
        session,
      ).lean();
    },
    async updateRequest(id, changes, session) {
      return withSession(SupportRequest.findByIdAndUpdate(id, changes, { new: true, runValidators: true }), session).lean();
    },
    async appendMessage(entry, session) {
      const [created] = await SupportMessage.create([entry], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
    async appendAssignmentHistory(entry, session) {
      const [created] = await SupportHistory.create([{ ...entry, kind: 'Assignment' }], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
    async appendPriorityHistory(entry, session) {
      const [created] = await SupportHistory.create([{ ...entry, kind: 'Priority' }], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
    async appendResolutionHistory(entry, session) {
      const [created] = await SupportHistory.create([{ ...entry, kind: 'Resolution' }], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
    async listTickets(filter = {}, session) {
      const query = SupportRequest.find(filter).sort({ createdAt: -1, _id: -1 });
      return withSession(query, session).lean();
    },
    async listMessages(id, session) {
      return withSession(SupportMessage.find({ ticketId: id }).sort({ createdAt: 1, _id: 1 }), session).lean();
    },
    async findCommand(identity, session) {
      return withSession(SupportCommand.findOne({ actorId: identity.actorId, idempotencyKey: identity.idempotencyKey }), session).lean();
    },
    async recordCommand(entry, session) {
      const [created] = await SupportCommand.create([entry], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
  };
}

function createSupportService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
  transactionManager = createModelTransactionManager(),
  outbox = null,
  outboxRepository = outbox,
  assignmentCoordinator = defaultAssignmentCoordinator,
  clock = null,
  now = null,
} = {}) {
  const legacyOnly = !outboxRepository && !repository.appendMessage;
  const clockNow = () => (now ? new Date(now()) : clock?.now ? new Date(clock.now()) : new Date());
  const eventOutbox = outboxRepository || {
    async enqueue(entry, session) {
      const DomainOutbox = require('../models/domainOutbox.model');
      const [created] = await DomainOutbox.create([{
        identityKey: entry.idempotencyKey || `${entry.eventType}:${entry.aggregateId}:${entry.version}`,
        eventType: entry.eventType,
        payload: entry.payload,
      }], session ? { session } : undefined);
      return created.toObject ? created.toObject() : created;
    },
  };

  const findTicket = async (id, session) => {
    if (repository.findTicketById) return repository.findTicketById(id, session);
    if (repository.findRequestById) return repository.findRequestById(id, session);
    return null;
  };
  const insertTicket = async (data, session) => {
    if (repository.insertTicket) return repository.insertTicket(data, session);
    if (repository.createRequest) return repository.createRequest(data, session);
    throw new Error('Support repository cannot create requests');
  };
  const updateTicket = async (id, expectedVersion, changes, session) => {
    if (repository.updateTicketByVersion) return repository.updateTicketByVersion(id, expectedVersion, changes, session);
    const current = await findTicket(id, session);
    if (!current || Number(current.version || 1) !== Number(expectedVersion)) return null;
    if (repository.updateRequest) return repository.updateRequest(id, { ...changes, version: Number(expectedVersion) + 1 }, session);
    return null;
  };
  const appendMessage = async (entry, session) => {
    if (!repository.appendMessage) return null;
    return repository.appendMessage(entry, session);
  };
  const appendHistory = async (kind, entry, session) => {
    const method = repository[`append${kind}History`];
    if (method) return method.call(repository, entry, session);
    return null;
  };
  const findCommand = async (identity, session) => repository.findCommand ? repository.findCommand(identity, session) : null;
  const recordCommand = async (entry, session) => repository.recordCommand ? repository.recordCommand(entry, session) : null;
  const listTickets = async (filter, session) => {
    if (repository.listTickets) return repository.listTickets(filter, session);
    if (repository.listRequests) return repository.listRequests(filter, session);
    return [];
  };
  const listStoredMessages = async (id, session) => repository.listMessages ? repository.listMessages(id, session) : [];

  async function writeEffects({ actorId, operation, eventType, aggregateType, aggregateId, result, idempotencyKey, session, commandIdentity, history }) {
    const targetId = ticketId(result) || String(aggregateId);
    const version = Number(result?.version || 1);
    const occurredAt = clockNow();
    if (history) await appendHistory(history.kind, {
      ...history.entry,
      ticketId: targetId,
      actorId: String(actorId),
      version,
      createdAt: occurredAt,
    }, session);
    await auditLogger.log({
      actorId: String(actorId),
      action: eventType,
      targetEntity: aggregateType,
      targetId,
      aggregateType,
      aggregateId: targetId,
      version,
      occurredAt,
      idempotencyKey,
      metadata: {},
    }, session);
    await eventOutbox.enqueue({
      eventType,
      aggregateType,
      aggregateId: targetId,
      version,
      occurredAt,
      idempotencyKey,
      payload: { aggregateId: targetId, version },
    }, session);
    await recordCommand({
      actorId: String(actorId),
      aggregateId: String(commandIdentity.aggregateId),
      aggregateType,
      createdAt: occurredAt,
      currentResultId: targetId,
      currentResultVersion: version,
      fingerprint: commandIdentity.fingerprint,
      idempotencyKey,
      operation,
      result: clone(result),
    }, session);
  }

  async function mutate({ actor, aggregateId, operation, command, options, create = false, eventType, work, expectedVersionOverride }) {
    const envelopeCommand = expectedVersionOverride === undefined
      ? command
      : { ...command, expectedVersion: expectedVersionOverride };
    const envelope = validateEnvelope(envelopeCommand, options, { create });
    const commandAggregateId = String(aggregateId);
    const actorValue = idOf(actor);
    const fingerprint = commandFingerprint({
      actorId: actorValue,
      aggregateId: commandAggregateId,
      aggregateType: 'SupportRequest',
      operation,
      command,
    });
    return transactionManager.withTransaction(async (session) => {
      const identity = {
        actorId: actorValue,
        aggregateType: 'SupportRequest',
        aggregateId: commandAggregateId,
        operation,
        idempotencyKey: envelope.idempotencyKey,
        fingerprint,
      };
      const prior = await findCommand(identity, session);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw supportError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key was already used');
        return clone(prior.result);
      }
      const context = await work({ session, expectedVersion: envelope.expectedVersion, identity });
      const result = context.result;
      await writeEffects({
        actorId: context.auditActorId ?? actorValue,
        operation,
        eventType,
        aggregateType: 'SupportRequest',
        aggregateId: commandAggregateId,
        result,
        idempotencyKey: envelope.idempotencyKey,
        session,
        commandIdentity: identity,
        history: context.history,
      });
      return clone(result);
    });
  }

  async function getCurrentOrConflict(id, expectedVersion, session) {
    const found = await findTicket(id, session);
    const ticket = clone(found);
    if (!ticket) throw supportError(404, 'SUPPORT_NOT_FOUND', 'Support request not found');
    if (Number(ticket.version || 1) !== Number(expectedVersion)) {
      throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(ticket) });
    }
    return ticket;
  }

  async function ensureReference(type, customerId, input, session) {
    const orderId = input.orderId === undefined || input.orderId === null || input.orderId === '' ? undefined : String(input.orderId);
    const productId = input.productId === undefined || input.productId === null || input.productId === '' ? undefined : String(input.productId);
    let order = null;
    let product = null;
    if (ORDER_TYPES.has(type) && !orderId) throw supportError(404, 'SUPPORT_REFERENCE_NOT_FOUND', 'Support reference was not found');
    if (orderId) {
      order = repository.findOrderById ? await repository.findOrderById(orderId, session) : null;
      if (!order || String(order.customerId) !== String(customerId)) throw supportError(404, 'SUPPORT_REFERENCE_NOT_FOUND', 'Support reference was not found');
    }
    if (type === 'Product' && !productId) throw supportError(404, 'SUPPORT_REFERENCE_NOT_FOUND', 'Support reference was not found');
    if (productId) {
      product = repository.findProductById ? await repository.findProductById(productId, session) : null;
      if (!product || product.status !== 'Active') throw supportError(404, 'SUPPORT_REFERENCE_NOT_FOUND', 'Support reference was not found');
    }
    if (order && product) {
      const detail = repository.findOrderDetail
        ? await repository.findOrderDetail(orderId, productId, session)
        : null;
      if (!detail) throw supportError(404, 'SUPPORT_REFERENCE_NOT_FOUND', 'Support reference was not found');
    }
    return { orderId, productId, order, product };
  }

  function actorCanRead(actor, ticket) {
    if (actorRole(actor) === 'Customer' && actorStatus(actor) === 'Active') return idOf(ticket.customerId) === idOf(actor);
    return actorRole(actor) === 'Staff' && actorStatus(actor) === 'Active';
  }

  async function listMessages(actor, id, filters = {}, { internal = false } = {}) {
    const ticket = await findTicket(id);
    if (!ticket || !actorCanRead(actor, ticket)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
    const paging = parsePage(filters);
    const messages = (await listStoredMessages(id)).slice().sort((left, right) => {
      const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return delta || idOf(left.id ?? left._id).localeCompare(idOf(right.id ?? right._id));
    });
    return page(messages.map((entry) => messageDto(entry, { internal: internal || true })), paging);
  }

  async function createRequest(actor, input = {}, options = {}) {
    requireCustomer(actor);
    const type = input.type || input.requestType;
    if (!REQUEST_TYPES.has(type)) throw supportError(400, 'SUPPORT_VALIDATION_FAILED', 'Support input is invalid');
    const subject = validateInputText(input.subject, 5, 120);
    const initialMessage = validateInputText(input.initialMessage ?? input.content, 10, 2000);
    const refs = await ensureReference(type, idOf(actor), input);
    const keyAggregateId = idOf(actor);
    return mutate({
      actor,
      aggregateId: keyAggregateId,
      operation: 'createRequest',
      command: input,
      options,
      create: true,
      eventType: 'SUPPORT_CREATED',
      work: async ({ session, identity }) => {
        const timestamp = clockNow();
        const ticket = await insertTicket({
          customerId: idOf(actor),
          ticketCode: `SUP-${timestamp.toISOString().slice(0, 10).replace(/-/gu, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
          type,
          requestType: type,
          orderId: refs.orderId,
          productId: refs.productId,
          subject,
          content: initialMessage,
          status: 'New',
          assigneeId: null,
          handledBy: null,
          priority: 'Normal',
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }, session);
        const id = ticketId(ticket);
        await appendMessage({
          ticketId: id,
          actorId: idOf(actor),
          actorRole: 'Customer',
          content: initialMessage,
          commandId: options.idempotencyKey.trim(),
          createdAt: timestamp,
        }, session);
        return { result: ticket, identity };
      },
    });
  }

  async function claim(actor, id, command = {}, options = {}) {
    requireStaff(actor);
    return mutate({
      actor,
      aggregateId: id,
      operation: 'claim',
      command,
      options,
      eventType: 'SUPPORT_CLAIMED',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        if (!(ticket.status === 'New' && (ticket.assigneeId ?? ticket.handledBy) == null)
          && !(ticket.status === 'InProgress' && (ticket.assigneeId ?? ticket.handledBy) == null)) {
          throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        }
        const updated = await updateTicket(id, expectedVersion, {
          status: 'InProgress', assigneeId: idOf(actor), handledBy: idOf(actor), updatedAt: clockNow(),
        }, session);
        if (!updated) {
          const current = await findTicket(id, session);
          throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(current) });
        }
        return {
          result: updated,
          history: {
            kind: 'Assignment',
            entry: {
              actorRole: 'Staff', beforeAssigneeId: ticket.assigneeId ?? ticket.handledBy ?? null,
              afterAssigneeId: idOf(actor), reason: null,
            },
          },
        };
      },
    });
  }

  async function appendMessageCommand(actor, id, command = {}, options = {}) {
    const actorValue = idOf(actor);
    const content = validateInputText(command.message, 1, 2000);
    if (actorRole(actor) === 'Customer') requireCustomer(actor);
    else if (actorRole(actor) === 'Staff') requireStaff(actor);
    else throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
    return mutate({
      actor,
      aggregateId: id,
      operation: 'appendMessage',
      command,
      options,
      eventType: 'SUPPORT_MESSAGE_APPENDED',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        const owner = String(ticket.customerId) === actorValue;
        const assignee = String(ticket.assigneeId ?? ticket.handledBy ?? '') === actorValue;
        if (actorRole(actor) === 'Customer' && (!owner || !['New', 'InProgress'].includes(ticket.status))) {
          if (ticket.status === 'Resolved' || ticket.status === 'Withdrawn') throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
          throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        }
        if (actorRole(actor) === 'Staff' && !assignee) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        if (actorRole(actor) === 'Staff' && !['New', 'InProgress'].includes(ticket.status)) throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        const updated = await updateTicket(id, expectedVersion, { updatedAt: clockNow() }, session);
        if (!updated) {
          const current = await findTicket(id, session);
          throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(current) });
        }
        await appendMessage({ ticketId: id, actorId: actorValue, actorRole: actorRole(actor), content, commandId: options.idempotencyKey.trim(), createdAt: clockNow() }, session);
        return { result: updated };
      },
    });
  }

  async function changePriority(actor, id, command = {}, options = {}) {
    requireStaff(actor);
    const reason = validateInputText(command.reason, 5, 500);
    if (!PRIORITIES.has(command.priority)) throw supportError(400, 'SUPPORT_VALIDATION_FAILED', 'Support input is invalid');
    return mutate({
      actor, aggregateId: id, operation: 'changePriority', command, options, eventType: 'SUPPORT_PRIORITY_CHANGED',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        if (ticket.status !== 'InProgress') throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        if (String(ticket.assigneeId ?? ticket.handledBy ?? '') !== idOf(actor)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        const updated = await updateTicket(id, expectedVersion, { priority: command.priority, updatedAt: clockNow() }, session);
        if (!updated) throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(await findTicket(id, session)) });
        return { result: updated, history: { kind: 'Priority', entry: { actorRole: 'Staff', beforePriority: ticket.priority || 'Normal', afterPriority: command.priority, reason } } };
      },
    });
  }

  async function transfer(actor, id, command = {}, options = {}) {
    requireStaff(actor);
    const reason = validateInputText(command.reason, 5, 500);
    return mutate({
      actor, aggregateId: id, operation: 'transfer', command, options, eventType: 'SUPPORT_TRANSFERRED',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        if (String(ticket.assigneeId ?? ticket.handledBy ?? '') !== idOf(actor)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        if (ticket.status !== 'InProgress') throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        const target = repository.findUserById ? await repository.findUserById(command.assigneeId, session) : null;
        if (!target || target.role !== 'Staff' || target.status !== 'Active') throw supportError(409, 'SUPPORT_TRANSFER_TARGET_INVALID', 'Support transfer target is invalid');
        const updated = await updateTicket(id, expectedVersion, { assigneeId: idOf(target), handledBy: idOf(target), updatedAt: clockNow() }, session);
        if (!updated) throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(await findTicket(id, session)) });
        return { result: updated, history: { kind: 'Assignment', entry: { actorRole: 'Staff', beforeAssigneeId: ticket.assigneeId ?? ticket.handledBy ?? null, afterAssigneeId: idOf(target), reason } } };
      },
    });
  }

  async function withdraw(actor, id, command = {}, options = {}) {
    requireCustomer(actor);
    return mutate({
      actor, aggregateId: id, operation: 'withdraw', command, options, eventType: 'SUPPORT_WITHDRAWN',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        if (String(ticket.customerId) !== idOf(actor)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        if (ticket.status !== 'New' || (ticket.assigneeId ?? ticket.handledBy) != null) throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        const updated = await updateTicket(id, expectedVersion, { status: 'Withdrawn', updatedAt: clockNow() }, session);
        if (!updated) throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(await findTicket(id, session)) });
        return { result: updated };
      },
    });
  }

  async function resolve(actor, id, command = {}, options = {}) {
    requireStaff(actor);
    const finalMessage = validateInputText(command.finalMessage, 1, 2000);
    return mutate({
      actor, aggregateId: id, operation: 'resolve', command, options, eventType: 'SUPPORT_RESOLVED',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        if (ticket.status !== 'InProgress') throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        if (String(ticket.assigneeId ?? ticket.handledBy ?? '') !== idOf(actor)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        const resolvedAt = clockNow();
        const reopenDeadline = new Date(resolvedAt.getTime() + REOPEN_MS);
        const updated = await updateTicket(id, expectedVersion, { status: 'Resolved', resolvedAt, closedAt: resolvedAt, reopenDeadlineAt: reopenDeadline, updatedAt: resolvedAt }, session);
        if (!updated) throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(await findTicket(id, session)) });
        await appendMessage({ ticketId: id, actorId: idOf(actor), actorRole: 'Staff', content: finalMessage, commandId: options.idempotencyKey.trim(), createdAt: resolvedAt }, session);
        return { result: updated, history: { kind: 'Resolution', entry: { actorRole: 'Staff', beforeStatus: 'InProgress', afterStatus: 'Resolved', transition: 'Resolved', resolvedAt, reopenDeadline } } };
      },
    });
  }

  async function reopen(actor, id, command = {}, options = {}) {
    requireCustomer(actor);
    const message = validateInputText(command.message, 1, 2000);
    return mutate({
      actor, aggregateId: id, operation: 'reopen', command, options, eventType: 'SUPPORT_REOPENED',
      work: async ({ session, expectedVersion }) => {
        const ticket = await getCurrentOrConflict(id, expectedVersion, session);
        if (String(ticket.customerId) !== idOf(actor)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
        if (ticket.status !== 'Resolved') throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Support transition is invalid');
        const resolvedAt = ticket.resolvedAt ?? ticket.closedAt;
        const deadline = ticket.reopenDeadlineAt ?? (resolvedAt ? new Date(new Date(resolvedAt).getTime() + REOPEN_MS) : null);
        if (!deadline || clockNow().getTime() > new Date(deadline).getTime()) throw supportError(409, 'SUPPORT_REOPEN_WINDOW_EXPIRED', 'Support reopen window expired');
        let assigneeId = ticket.assigneeId ?? ticket.handledBy ?? null;
        let clearHistory = null;
        if (assigneeId && repository.findUserById) {
          const assignee = await repository.findUserById(assigneeId, session);
          if (!assignee || assignee.status !== 'Active') {
            clearHistory = { kind: 'Assignment', entry: { actorRole: 'System', beforeAssigneeId: assigneeId, afterAssigneeId: null, reason: 'ASSIGNEE_DISABLED' } };
            assigneeId = null;
          }
        }
        const reopenedAt = clockNow();
        const updated = await updateTicket(id, expectedVersion, { status: 'InProgress', assigneeId, handledBy: assigneeId, updatedAt: reopenedAt }, session);
        if (!updated) throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(await findTicket(id, session)) });
        if (clearHistory) {
          await appendHistory('Assignment', { ...clearHistory.entry, ticketId: id, actorId: idOf(actor), version: updated.version, createdAt: reopenedAt }, session);
          await auditLogger.log({ actorId: idOf(actor), action: 'ASSIGNEE_CLEARED', targetEntity: 'SupportRequest', targetId: id, aggregateType: 'SupportRequest', aggregateId: id, version: updated.version, occurredAt: reopenedAt, idempotencyKey: options.idempotencyKey.trim(), metadata: {} }, session);
          await eventOutbox.enqueue({ eventType: 'ASSIGNEE_CLEARED', aggregateType: 'SupportRequest', aggregateId: id, version: updated.version, occurredAt: reopenedAt, idempotencyKey: options.idempotencyKey.trim(), payload: { aggregateId: id, version: updated.version } }, session);
        }
        await appendMessage({ ticketId: id, actorId: idOf(actor), actorRole: 'Customer', content: message, commandId: options.idempotencyKey.trim(), createdAt: reopenedAt }, session);
        return { result: updated, history: { kind: 'Resolution', entry: { actorRole: 'Customer', beforeStatus: 'Resolved', afterStatus: 'InProgress', transition: 'Reopened', resolvedAt: new Date(resolvedAt), reopenDeadline: new Date(deadline) } } };
      },
    });
  }

  async function clearDisabledAssignee(userId, command = {}, options = {}) {
    const actor = typeof userId === 'object' ? userId : { id: String(userId), role: 'System', status: 'Active' };
    const rawId = idOf(userId);
    // Recovery is invoked by the SL-007 disable transaction and may be replayed
    // after the assignment has already been cleared. Resolve the durable command
    // before looking up currently assigned tickets so the exact prior result wins.
    if (options?.idempotencyKey && repository.findCommand) {
      const prior = await repository.findCommand({
        actorId: rawId,
        aggregateType: 'SupportRequest',
        aggregateId: rawId,
        operation: 'clearDisabledAssignee',
        idempotencyKey: String(options.idempotencyKey).trim(),
        fingerprint: '0'.repeat(64),
      });
      if (prior) return clone(prior.result);
    }
    const tickets = await listTickets({ assigneeId: rawId });
    const ticket = tickets.find((item) => (item.assigneeId ?? item.handledBy) === rawId)
      || (await listTickets({ handledBy: rawId })).find((item) => (item.assigneeId ?? item.handledBy) === rawId);
    if (!ticket) return null;
    return mutate({
      actor,
      aggregateId: ticketId(ticket),
      operation: 'clearDisabledAssignee',
      command,
      options,
      eventType: 'ASSIGNEE_CLEARED',
      expectedVersionOverride: Number(ticket.version || 1),
      work: async ({ session, expectedVersion }) => {
        const current = await getCurrentOrConflict(ticketId(ticket), expectedVersion, session);
        if ((current.assigneeId ?? current.handledBy) !== rawId) return { result: current };
        const updated = await updateTicket(ticketId(ticket), expectedVersion, { assigneeId: null, handledBy: null, updatedAt: clockNow() }, session);
        if (!updated) throw supportError(409, 'SUPPORT_VERSION_CONFLICT', 'Support request changed', { ticket: clone(await findTicket(ticketId(ticket), session)) });
        return { result: updated, auditActorId: rawId, history: { kind: 'Assignment', entry: { actorRole: 'System', beforeAssigneeId: rawId, afterAssigneeId: null, reason: 'ASSIGNEE_DISABLED' } } };
      },
    });
  }

  async function listOwn(actor, filters = {}) {
    requireCustomer(actor);
    const paging = parsePage(filters);
    const requests = await listTickets({ customerId: idOf(actor) });
    const sorted = requests.slice().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || ticketId(right).localeCompare(ticketId(left)));
    return page(sorted.map(publicTicket), paging);
  }

  async function listOperational(actor, filters = {}) {
    requireStaff(actor);
    const paging = parsePage(filters);
    const allowed = ['type', 'status', 'priority', 'assigneeId', 'dateFrom', 'dateTo', 'page', 'pageSize'];
    if (Object.keys(filters).some((key) => !allowed.includes(key))
      || (filters.type !== undefined && !REQUEST_TYPES.has(filters.type))
      || (filters.status !== undefined && !STATUSES.has(filters.status))
      || (filters.priority !== undefined && !PRIORITIES.has(filters.priority))) {
      throw supportError(400, 'SUPPORT_FILTER_INVALID', 'Support filter is invalid');
    }
    let requests = await listTickets({});
    requests = requests.filter((ticket) => {
      if (filters.type && ticketType(ticket) !== filters.type) return false;
      if (filters.status && ticket.status !== filters.status) return false;
      if (filters.priority && (ticket.priority || 'Normal') !== filters.priority) return false;
      if (filters.assigneeId === 'unassigned' && (ticket.assigneeId ?? ticket.handledBy) != null) return false;
      if (filters.assigneeId && filters.assigneeId !== 'unassigned' && String(ticket.assigneeId ?? ticket.handledBy ?? '') !== String(filters.assigneeId)) return false;
      if (filters.dateFrom && new Date(ticket.createdAt) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(ticket.createdAt) > new Date(`${filters.dateTo}T23:59:59.999Z`)) return false;
      return true;
    });
    requests.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || ticketId(right).localeCompare(ticketId(left)));
    return page(requests.map(publicTicket), paging);
  }

  async function getDetail(actor, id, filters = {}) {
    const ticket = await findTicket(id);
    if (!ticket || !actorCanRead(actor, ticket)) throw supportError(403, 'SUPPORT_FORBIDDEN', 'Support operation is forbidden');
    const messages = await listMessages(actor, id, filters, { internal: true });
    const historyFilter = { ticketId: id };
    const assignmentHistory = repository.listHistory ? await repository.listHistory(historyFilter, 'Assignment') : [];
    const priorityHistory = repository.listHistory ? await repository.listHistory(historyFilter, 'Priority') : [];
    const resolutionHistory = repository.listHistory ? await repository.listHistory(historyFilter, 'Resolution') : [];
    return {
      ...publicTicket(ticket),
      messages: { ...messages, items: messages.items.map((item) => ({ id: item.id, actorRole: item.actorRole, content: item.content, createdAt: item.createdAt })) },
      assignmentHistory,
      priorityHistory,
      resolutionHistory,
    };
  }

  async function createCustomerRequest(customerId, input = {}) {
    if (legacyOnly && repository.createRequest) {
      if (!String(input.subject || '').trim()) throw new ApiError(400, 'Support subject is required');
      if (!String(input.content || '').trim()) throw new ApiError(400, 'Support content is required');
      let order = null;
      if (input.orderId) {
        order = repository.findOrderById ? await repository.findOrderById(input.orderId) : null;
        if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      }
      const request = await repository.createRequest({
        customerId,
        orderId: input.orderId || null,
        subject: String(input.subject).trim(),
        content: String(input.content).trim(),
        status: 'New',
      });
      return {
        ...request,
        id: ticketId(request),
        customerId: idOf(customerId),
        orderCode: order?.orderCode,
        handledBy: request.handledBy ?? null,
        response: request.response || '',
        respondedAt: request.respondedAt || null,
        closedAt: request.closedAt || null,
      };
    }
    const actor = { id: idOf(customerId), role: 'Customer', status: 'Active' };
    const command = {
      type: input.type || input.requestType || 'Order',
      subject: input.subject,
      initialMessage: input.initialMessage ?? input.content,
      orderId: input.orderId,
      productId: input.productId,
      expectedVersion: 0,
    };
    const result = await createRequest(actor, command, { idempotencyKey: `legacy-support-${Date.now()}-${Math.random()}` });
    const order = result.orderId && repository.findOrderById ? await repository.findOrderById(result.orderId) : null;
    return { ...result, id: ticketId(result), customerId: idOf(customerId), orderCode: order?.orderCode, content: result.content, handledBy: result.assigneeId, response: '', respondedAt: null, closedAt: result.resolvedAt };
  }

  async function respondToRequest(staffId, id, input = {}) {
    // Preserve the legacy endpoint contract for old callers that have not yet migrated.
    if (!repository.appendMessage) {
      return transactionManager.withTransaction(async (session) => {
        await assignmentCoordinator.coordinate({ userId: staffId, expectedRole: 'Staff', session });
        const request = await findTicket(id, session);
        if (!request) throw supportError(404, 'SUPPORT_NOT_FOUND', 'Support request not found');
        const currentStatus = request.status === 'Open' ? 'New' : request.status;
        const next = input.status;
        if (!((currentStatus === 'New' && next === 'InProgress') || (currentStatus === 'InProgress' && next === 'Resolved'))) throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Invalid support status transition');
        const result = repository.updateRequest ? await repository.updateRequest(id, { status: next, response: normalizeText(input.response), handledBy: staffId, respondedAt: new Date(), closedAt: next === 'Resolved' ? new Date() : null }, session) : request;
        return { ...result, id: ticketId(result), handledBy: staffId };
      });
    }
    const actor = { id: idOf(staffId), role: 'Staff', status: 'Active' };
    const ticket = await findTicket(id);
    if (!ticket) throw supportError(404, 'SUPPORT_NOT_FOUND', 'Support request not found');
    if (input.status === 'InProgress' && ticket.status === 'New') {
      const claimed = await claim(actor, id, { expectedVersion: ticket.version }, { idempotencyKey: `legacy-claim-${Date.now()}` });
      return appendMessageCommand(actor, id, { message: input.response, expectedVersion: claimed.version }, { idempotencyKey: `legacy-message-${Date.now()}` });
    }
    if (input.status === 'Resolved' && ticket.status === 'InProgress') return resolve(actor, id, { finalMessage: input.response, expectedVersion: ticket.version }, { idempotencyKey: `legacy-resolve-${Date.now()}` });
    throw supportError(409, 'SUPPORT_TRANSITION_INVALID', 'Invalid support status transition');
  }

  return {
    createRequest,
    appendMessage: appendMessageCommand,
    claim,
    changePriority,
    transfer,
    withdraw,
    resolve,
    reopen,
    clearDisabledAssignee,
    listMessages,
    listOwn,
    listOperational,
    getDetail,
    // Route/legacy aliases retained for backwards compatibility.
    createCustomerRequest,
    listMyRequests: listOwn,
    listStaffRequests: listOperational,
    getStaffRequest: async (id) => {
      const ticket = await findTicket(id);
      if (!ticket) throw supportError(404, 'SUPPORT_NOT_FOUND', 'Support request not found');
      return publicTicket(ticket);
    },
    respondToRequest,
  };
}

module.exports = {
  createSupportService,
  createModelTransactionManager,
  createMongoTransactionManager: createModelTransactionManager,
  supportService: createSupportService(),
};
