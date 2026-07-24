const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');
const {
  actorId,
  boundedPage,
  commandFingerprint,
  isCastError,
  normalizedReview,
  parsePaging,
  requireActiveStaff,
  requireCustomer,
  reviewError,
  toManagementDto,
  toModerationDto,
  toOwnDto,
  toPublicDto,
  validateCommandEnvelope,
  validateContentCommand,
  validateModerationCommand,
  validatePublicationCommand,
  valueId,
} = require('./review.domain');
const {
  createModelAuditLogger,
  createModelOutboxRepository,
  createModelRepository,
  createModelTransactionManager,
} = require('./review.persistence');

function createReviewService(options = {}) {
  const repository = options.repository || createModelRepository();
  const transactionManager = options.transactionManager || createModelTransactionManager();
  const auditLogger = options.auditLogger || createModelAuditLogger();
  const outboxRepository = options.outboxRepository
    || options.outbox
    || createModelOutboxRepository();
  const now = options.now
    || (options.clock?.now ? () => options.clock.now() : () => new Date());
  const inFlight = new Map();
  const aggregateLocks = new Map();

  function duplicateError(review) {
    return reviewError(
      409,
      'REVIEW_ALREADY_EXISTS',
      'This product was already reviewed',
      { review: toManagementDto(review) },
    );
  }

  function forbidden() {
    return reviewError(403, 'REVIEW_FORBIDDEN', 'Review operation is forbidden');
  }

  function notEligible() {
    return reviewError(404, 'REVIEW_NOT_ELIGIBLE', 'Review is not eligible');
  }

  function versionConflict() {
    return reviewError(409, 'REVIEW_VERSION_CONFLICT', 'Review version conflict');
  }

  function idempotencyConflict() {
    return reviewError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key was reused');
  }

  function identityFor(actor, aggregateId, operation, command, idempotencyKey) {
    const identity = {
      actorId: actorId(actor),
      aggregateType: 'Review',
      aggregateId: String(aggregateId),
      operation,
      idempotencyKey,
    };
    return {
      ...identity,
      fingerprint: commandFingerprint({ ...identity, command }),
    };
  }

  function sameCommand(left, right) {
    return (
      String(left.actorId) === String(right.actorId)
      && left.aggregateType === right.aggregateType
      && String(left.aggregateId) === String(right.aggregateId)
      && left.operation === right.operation
      && left.idempotencyKey === right.idempotencyKey
      && left.fingerprint === right.fingerprint
    );
  }

  async function replay(identity) {
    const stored = await repository.findCommand(identity);
    if (!stored) return null;
    if (!sameCommand(stored, identity)) throw idempotencyConflict();
    return structuredClone(stored.result);
  }

  async function executeCommand(identity, work) {
    const existing = await replay(identity);
    if (existing) return existing;

    const scope = `${identity.actorId}\u0000${identity.idempotencyKey}`;
    const pending = inFlight.get(scope);
    if (pending) {
      if (!sameCommand(pending.identity, identity)) throw idempotencyConflict();
      return pending.promise;
    }

    const promise = (async () => {
      const rechecked = await replay(identity);
      if (rechecked) return rechecked;
      try {
        return await work();
      } catch (error) {
        if (
          error?.code === 11000
          || error?.errorCode === 'REVIEW_VERSION_CONFLICT'
          || error?.errorCode === 'REVIEW_ALREADY_EXISTS'
        ) {
          const racedReplay = await replay(identity);
          if (racedReplay) return racedReplay;
        }
        throw error;
      }
    })();
    inFlight.set(scope, { identity, promise });
    try {
      return await promise;
    } finally {
      if (inFlight.get(scope)?.promise === promise) inFlight.delete(scope);
    }
  }

  async function withAggregateLock(scope, work) {
    const previous = aggregateLocks.get(scope);
    let release;
    const turn = new Promise((resolve) => {
      release = resolve;
    });
    const tail = (previous || Promise.resolve()).then(
      () => turn,
      () => turn,
    );
    aggregateLocks.set(scope, tail);
    if (previous) await previous.catch(() => {});
    try {
      return await work();
    } finally {
      release();
      if (aggregateLocks.get(scope) === tail) aggregateLocks.delete(scope);
    }
  }

  async function writeEnvelope({
    identity,
    idempotencyKey,
    eventType,
    result,
    aggregateScopeId,
    occurredAt,
    session,
  }) {
    const aggregateId = String(result.id);
    const version = Number(result.version);
    await auditLogger.log({
      actorId: String(identity.actorId),
      action: eventType,
      targetEntity: 'Review',
      targetId: aggregateId,
      aggregateType: 'Review',
      aggregateId,
      version,
      occurredAt,
      idempotencyKey,
      metadata: {},
    }, session);
    await outboxRepository.enqueue({
      eventType,
      aggregateType: 'Review',
      aggregateId,
      version,
      occurredAt,
      idempotencyKey,
      payload: { aggregateId, version },
    }, session);
    await repository.recordCommand({
      actorId: String(identity.actorId),
      aggregateId: String(aggregateScopeId),
      aggregateType: 'Review',
      createdAt: occurredAt,
      currentResultId: aggregateId,
      currentResultVersion: version,
      fingerprint: identity.fingerprint,
      idempotencyKey,
      operation: identity.operation,
      result,
    }, session);
  }

  async function resolveEligibility(customerId, productId, orderDetailId) {
    try {
      const product = await repository.findProductById(productId);
      if (!product) throw notEligible();

      if (orderDetailId !== undefined && orderDetailId !== null) {
        const detail = await repository.findOrderDetailById(orderDetailId);
        if (!detail || valueId(detail.productId) !== String(productId)) throw notEligible();
        const order = await repository.findOrderById(detail.orderId);
        if (
          !order
          || valueId(order.customerId) !== String(customerId)
          || !order.deliveredAt
        ) {
          throw notEligible();
        }
        return { product, detail, order };
      }

      const candidates = await repository.listOwnedDeliveredOrderDetails(
        customerId,
        productId,
      );
      const eligible = candidates
        .filter((detail) => (
          valueId(detail.productId) === String(productId)
          && valueId(detail.order?.customerId) === String(customerId)
          && detail.order?.deliveredAt
        ))
        .sort((left, right) => {
          const deliveredDifference = new Date(right.order.deliveredAt).getTime()
            - new Date(left.order.deliveredAt).getTime();
          if (deliveredDifference !== 0) return deliveredDifference;
          return valueId(right).localeCompare(valueId(left), 'en');
        });
      if (eligible.length === 0) throw notEligible();
      return {
        product,
        detail: eligible[0],
        order: eligible[0].order,
      };
    } catch (error) {
      if (isCastError(error)) throw notEligible();
      throw error;
    }
  }

  async function createReview(actor, productId, command = {}, finalOptions = {}) {
    requireCustomer(actor);
    const { idempotencyKey } = validateCommandEnvelope(
      command,
      finalOptions,
      { create: true },
    );
    const input = validateContentCommand(command);
    const identity = identityFor(
      actor,
      productId,
      'createReview',
      command,
      idempotencyKey,
    );

    return executeCommand(identity, () => withAggregateLock(
      `${actorId(actor)}\u0000${String(productId)}`,
      async () => {
        let existing;
        try {
          existing = await repository.findReviewByIdentity(actorId(actor), productId);
        } catch (error) {
          if (isCastError(error)) throw notEligible();
          throw error;
        }
        if (existing) throw duplicateError(existing);
        const { detail, order } = await resolveEligibility(
          actorId(actor),
          String(productId),
          command.orderDetailId,
        );
        const occurredAt = new Date(now());

        try {
          return await transactionManager.withTransaction(async (session) => {
            const raced = await repository.findReviewByIdentity(
              actorId(actor),
              productId,
              session,
            );
            if (raced) throw duplicateError(raced);
            const review = await repository.insertReview({
              customerId: actorId(actor),
              productId: String(productId),
              orderId: valueId(order),
              orderDetailId: valueId(detail),
              rating: input.rating,
              content: input.content,
              publicationStatus: 'Published',
              moderationStatus: 'Allowed',
              moderationReason: '',
              status: 'Visible',
              createdAt: occurredAt,
              updatedAt: occurredAt,
            }, session);
            const result = toManagementDto(review);
            await repository.appendContentHistory({
              reviewId: result.id,
              actorId: actorId(actor),
              version: result.version,
              rating: result.rating,
              content: result.content,
              createdAt: occurredAt,
            }, session);
            await writeEnvelope({
              identity,
              idempotencyKey,
              eventType: 'REVIEW_CREATED',
              result,
              aggregateScopeId: productId,
              occurredAt,
              session,
            });
            return result;
          });
        } catch (error) {
          if (error?.code === 11000) {
            const duplicate = await repository.findReviewByIdentity(actorId(actor), productId);
            if (duplicate) throw duplicateError(duplicate);
          }
          throw error;
        }
      },
    ));
  }

  async function mutateReview({
    actor,
    reviewId,
    command,
    finalOptions,
    operation,
    eventType,
    authorize,
    validate,
    changes,
    appendHistory,
    mapResult = toManagementDto,
  }) {
    authorize(actor);
    const { idempotencyKey, expectedVersion } = validateCommandEnvelope(
      command,
      finalOptions,
    );
    const input = validate(command);
    const identity = identityFor(
      actor,
      reviewId,
      operation,
      command,
      idempotencyKey,
    );

    return executeCommand(identity, async () => {
      let observed;
      try {
        observed = await repository.findReviewById(reviewId);
      } catch (error) {
        if (isCastError(error)) throw forbidden();
        throw error;
      }
      if (!observed) throw forbidden();
      if (authorize === requireCustomer && valueId(observed.customerId) !== actorId(actor)) {
        throw forbidden();
      }
      if (Number(observed.version || 1) !== expectedVersion) throw versionConflict();
      const occurredAt = new Date(now());

      return transactionManager.withTransaction(async (session) => {
        let current;
        try {
          current = await repository.findReviewById(reviewId, session);
        } catch (error) {
          if (isCastError(error)) throw forbidden();
          throw error;
        }
        if (!current) throw forbidden();
        if (authorize === requireCustomer && valueId(current.customerId) !== actorId(actor)) {
          throw forbidden();
        }
        if (Number(current.version || 1) !== expectedVersion) throw versionConflict();
        const update = changes(current, input, occurredAt);
        const updated = await repository.updateReviewByVersion(
          reviewId,
          expectedVersion,
          update,
          session,
        );
        if (!updated) throw versionConflict();
        const result = mapResult(updated);
        await appendHistory({
          current: normalizedReview(current),
          updated: normalizedReview(updated),
          input,
          result,
          occurredAt,
          actor: actorId(actor),
          session,
        });
        await writeEnvelope({
          identity,
          idempotencyKey,
          eventType,
          result,
          aggregateScopeId: reviewId,
          occurredAt,
          session,
        });
        return result;
      });
    });
  }

  async function updateReview(actor, reviewId, command = {}, finalOptions = {}) {
    return mutateReview({
      actor,
      reviewId,
      command,
      finalOptions,
      operation: 'updateReview',
      eventType: 'REVIEW_UPDATED',
      authorize: requireCustomer,
      validate: validateContentCommand,
      changes: (_current, input, occurredAt) => ({
        rating: input.rating,
        content: input.content,
        updatedAt: occurredAt,
      }),
      appendHistory: ({ result, occurredAt, actor: commandActor, session }) => (
        repository.appendContentHistory({
          reviewId: result.id,
          actorId: commandActor,
          version: result.version,
          rating: result.rating,
          content: result.content,
          createdAt: occurredAt,
        }, session)
      ),
    });
  }

  async function setPublication(actor, reviewId, command = {}, finalOptions = {}) {
    return mutateReview({
      actor,
      reviewId,
      command,
      finalOptions,
      operation: 'setPublication',
      eventType: 'REVIEW_PUBLICATION_CHANGED',
      authorize: requireCustomer,
      validate: validatePublicationCommand,
      changes: (current, input, occurredAt) => ({
        publicationStatus: input.publicationStatus,
        status: (
          input.publicationStatus === 'Published'
          && normalizedReview(current).moderationStatus === 'Allowed'
        ) ? 'Visible' : 'Hidden',
        updatedAt: occurredAt,
      }),
      appendHistory: ({
        current,
        result,
        input,
        occurredAt,
        actor: commandActor,
        session,
      }) => repository.appendPublicationHistory({
        reviewId: result.id,
        actorId: commandActor,
        version: result.version,
        beforeStatus: current.publicationStatus,
        afterStatus: input.publicationStatus,
        createdAt: occurredAt,
      }, session),
    });
  }

  async function moderate(actor, reviewId, command = {}, finalOptions = {}) {
    return mutateReview({
      actor,
      reviewId,
      command,
      finalOptions,
      operation: 'moderate',
      eventType: 'REVIEW_MODERATION_CHANGED',
      authorize: requireActiveStaff,
      validate: validateModerationCommand,
      changes: (current, input, occurredAt) => ({
        moderationStatus: input.moderationStatus,
        moderationReason: input.reason,
        status: (
          normalizedReview(current).publicationStatus === 'Published'
          && input.moderationStatus === 'Allowed'
        ) ? 'Visible' : 'Hidden',
        updatedAt: occurredAt,
      }),
      appendHistory: ({
        current,
        result,
        input,
        occurredAt,
        actor: commandActor,
        session,
      }) => repository.appendModerationHistory({
        reviewId: result.id,
        actorId: commandActor,
        version: result.version,
        beforeStatus: current.moderationStatus,
        afterStatus: input.moderationStatus,
        reason: input.reason,
        createdAt: occurredAt,
      }, session),
      mapResult: toModerationDto,
    });
  }

  async function listPublic(productId, filters = {}) {
    const paging = parsePaging(filters);
    let product;
    try {
      product = await repository.findProductById(productId);
    } catch (error) {
      if (isCastError(error)) return boundedPage([], paging, 0, { averageRating: 0 });
      throw error;
    }
    if (!product || product.status !== 'Active') {
      return boundedPage([], paging, 0, { averageRating: 0 });
    }
    let category;
    try {
      category = await repository.findCategoryById(product.categoryId);
    } catch (error) {
      if (isCastError(error)) return boundedPage([], paging, 0, { averageRating: 0 });
      throw error;
    }
    if (!category || category.status !== 'Active') {
      return boundedPage([], paging, 0, { averageRating: 0 });
    }
    let query;
    try {
      query = await repository.queryPublicReviews(productId, {
        skip: (paging.page - 1) * paging.pageSize,
        limit: paging.pageSize,
      });
    } catch (error) {
      if (isCastError(error)) return boundedPage([], paging, 0, { averageRating: 0 });
      throw error;
    }
    const reviews = query.items.map(normalizedReview);
    const items = [];
    for (const review of reviews) {
      const user = await repository.findUserById(review.customerId);
      items.push(toPublicDto(review, user));
    }
    const averageRating = Number(query.total || 0) === 0
      ? 0
      : Number((
        Number(query.ratingSum || 0) / Number(query.total)
      ).toFixed(1));
    return boundedPage(items, paging, query.total, { averageRating });
  }

  async function listOwn(actor, filters = {}) {
    requireCustomer(actor);
    const paging = parsePaging(filters);
    let query;
    try {
      query = await repository.queryReviews(
        { customerId: actorId(actor) },
        {
          skip: (paging.page - 1) * paging.pageSize,
          limit: paging.pageSize,
        },
      );
    } catch (error) {
      if (isCastError(error)) throw forbidden();
      throw error;
    }
    const reviews = query.items;
    const summaries = await repository.summarizeReviewHistories(
      reviews.map((review) => valueId(review)),
    );
    const items = reviews.map((review) => (
      toOwnDto(review, summaries[valueId(review)])
    ));
    return boundedPage(items, paging, query.total);
  }

  async function listModeration(actor, filters = {}) {
    requireActiveStaff(actor);
    const paging = parsePaging(filters);
    if (
      filters.productId !== undefined
      && (typeof filters.productId !== 'string' || !filters.productId.trim())
    ) {
      throw reviewError(400, 'REVIEW_FILTER_INVALID', 'Review filter is invalid');
    }
    if (
      filters.publicationStatus !== undefined
      && !['Published', 'Withdrawn'].includes(filters.publicationStatus)
    ) {
      throw reviewError(400, 'REVIEW_FILTER_INVALID', 'Review filter is invalid');
    }
    if (
      filters.moderationStatus !== undefined
      && !['Allowed', 'HiddenByStaff'].includes(filters.moderationStatus)
    ) {
      throw reviewError(400, 'REVIEW_FILTER_INVALID', 'Review filter is invalid');
    }
    let query;
    try {
      query = await repository.queryReviews(
        {
          productId: filters.productId,
          publicationStatus: filters.publicationStatus,
          moderationStatus: filters.moderationStatus,
        },
        {
          skip: (paging.page - 1) * paging.pageSize,
          limit: paging.pageSize,
        },
      );
    } catch (error) {
      if (isCastError(error)) {
        throw reviewError(400, 'REVIEW_FILTER_INVALID', 'Review filter is invalid');
      }
      throw error;
    }
    return boundedPage(query.items.map(toModerationDto), paging, query.total);
  }

  const service = {
    createReview,
    updateReview,
    setPublication,
    moderate,
    listPublic,
    listOwn,
    listModeration,

    async listProductReviews(productId) {
      return listPublic(productId, { page: 1, pageSize: 50 });
    },

    async createCustomerReview(customerId, productId, input = {}) {
      const order = await repository.findOrderById(input.orderId);
      if (!order || valueId(order.customerId) !== String(customerId)) {
        throw new ApiError(404, 'Order not found');
      }
      if (!order.deliveredAt) {
        throw new ApiError(409, 'Only delivered orders can be reviewed');
      }
      const detail = await repository.findOrderDetail(input.orderId, productId);
      if (!detail) throw new ApiError(400, 'Order does not contain this product');
      const product = await repository.findProductById(productId);
      const result = await createReview(
        { id: String(customerId), role: 'Customer', status: 'Active' },
        productId,
        {
          orderDetailId: valueId(detail),
          rating: input.rating,
          content: input.content,
          expectedVersion: 0,
        },
        { idempotencyKey: `legacy-${crypto.randomUUID()}` },
      );
      return {
        ...result,
        productName: product?.name || detail.productNameSnapshot || '',
        status: (
          result.publicationStatus === 'Published'
          && result.moderationStatus === 'Allowed'
        ) ? 'Visible' : 'Hidden',
      };
    },
  };

  return service;
}

module.exports = {
  createModelRepository,
  createModelTransactionManager,
  createMongoTransactionManager: createModelTransactionManager,
  createReviewService,
  reviewService: createReviewService(),
};
