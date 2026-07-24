const crypto = require('node:crypto');

const ApiError = require('../utils/apiError');
const { logAudit } = require('../utils/auditLogger');
const { canonicalizeSku } = require('../utils/sku');
const {
  buildProductSearchText,
  collapseWhitespace,
} = require('../utils/catalogNormalization');
const {
  availabilityStatusOf,
  compareProducts,
  getCategoryId,
  hasActivePopulatedCategory,
  matchesNormalizedKeyword,
  normalizeCatalogQuery,
  normalizePositiveInteger,
  toAdminProduct,
  toPublicProduct,
} = require('./catalogQuery');
const {
  assertNoProductStockInput,
  nextPriceVersion,
  normalizeCurrency,
  rethrowProductRepositoryError,
  validateManagedImages,
  validateProductInput,
} = require('./productRules');
const {
  createModelCategoryRepository,
  createModelDependencyRepository,
  createModelInventoryRepository,
  createModelMediaRepository,
  createModelProductCommandRepository,
  createModelProductRepository,
  createModelReviewRepository,
  createModelTransactionManager,
} = require('./productPersistence');
const {
  createModelBestSellerRepository,
  vietnamWindowStart,
} = require('./bestSeller.service');

function copyProductResult(result) {
  return typeof structuredClone === 'function'
    ? structuredClone(result)
    : JSON.parse(JSON.stringify(result));
}

function normalizeProductCreateCommand({
  actor,
  input,
  normalized,
  currency,
  options,
}) {
  const adminId = String(actor?.id || '').trim();
  if (!adminId) {
    throw new ApiError(
      403,
      'Authenticated Admin identity is required for Product creation',
      [],
      'PRODUCT_CREATE_ACTOR_REQUIRED',
    );
  }
  const idempotencyKey = String(options?.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new ApiError(
      400,
      'A valid Idempotency-Key is required for Product creation',
      [{ field: 'idempotencyKey', message: 'Use 8-128 safe characters' }],
      idempotencyKey
        ? 'PRODUCT_IDEMPOTENCY_KEY_INVALID'
        : 'PRODUCT_IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      name: normalized.name,
      sku: normalized.sku,
      description: normalized.description,
      imageUrls: normalized.imageUrls,
      price: normalized.price,
      unit: normalized.unit,
      categoryId: String(input.categoryId),
      currency,
      status: 'Inactive',
    }))
    .digest('hex');
  const identityHash = crypto
    .createHash('sha256')
    .update(`${adminId}:${idempotencyKey}`)
    .digest('hex');
  return {
    adminId,
    idempotencyKey,
    commandType: 'CreateProduct',
    requestHash,
    auditEventId: `PRODUCT_CREATE:${identityHash}`,
  };
}

function createProductService({
  productRepository = createModelProductRepository(),
  categoryRepository = createModelCategoryRepository(),
  auditLogger = { log: logAudit },
  inventoryRepository = null,
  mediaRepository = null,
  dependencyRepository = null,
  reviewRepository = null,
  bestSellerRepository = null,
  commandRepository = null,
  transactionManager = null,
  clock = () => new Date(),
} = {}) {
  if (!inventoryRepository && productRepository?.isModelRepository) {
    inventoryRepository = createModelInventoryRepository();
  }
  if (!mediaRepository && productRepository?.isModelRepository) {
    mediaRepository = createModelMediaRepository();
  }
  if (!dependencyRepository && productRepository?.isModelRepository) {
    dependencyRepository = createModelDependencyRepository();
  }
  if (!reviewRepository && productRepository?.isModelRepository) {
    reviewRepository = createModelReviewRepository();
  }
  if (!bestSellerRepository && productRepository?.isModelRepository) {
    bestSellerRepository = createModelBestSellerRepository();
  }
  if (!commandRepository && productRepository?.isModelRepository) {
    commandRepository = createModelProductCommandRepository();
  }
  if (!transactionManager && productRepository?.isModelRepository) {
    transactionManager = createModelTransactionManager();
  }
  const localCreateCommands = new Map();

  async function findCreateCommand(command, session = null) {
    const localIdentity = `${command.adminId}:${command.idempotencyKey}`;
    const existing = commandRepository?.findByAdminAndKey
      ? await commandRepository.findByAdminAndKey(
        command.adminId,
        command.idempotencyKey,
        session,
      )
      : localCreateCommands.get(localIdentity);
    if (!existing) return null;
    if (
      existing.commandType !== command.commandType
      || existing.requestHash !== command.requestHash
    ) {
      throw new ApiError(
        409,
        'Idempotency-Key was already used for different Product creation facts',
        [{ field: 'idempotencyKey', message: 'Use a new key for a different Product' }],
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    return copyProductResult(existing.resultSnapshot);
  }

  async function persistCreateCommand(command, productId, resultSnapshot, session) {
    const record = {
      adminId: command.adminId,
      idempotencyKey: command.idempotencyKey,
      commandType: command.commandType,
      requestHash: command.requestHash,
      productId,
      resultSnapshot: copyProductResult(resultSnapshot),
    };
    if (commandRepository?.create) {
      await commandRepository.create(record, session);
      return;
    }
    localCreateCommands.set(`${command.adminId}:${command.idempotencyKey}`, record);
  }

  async function ensureActiveCategory(categoryId) {
    const category = await categoryRepository.findById(categoryId);
    if (!category) {
      throw new ApiError(
        400,
        'Product category does not exist',
        [{ field: 'categoryId', message: 'Select an existing Category' }],
        'PRODUCT_CATEGORY_NOT_FOUND',
      );
    }
    if (category.status !== 'Active') {
      throw new ApiError(
        400,
        'Product category must be active',
        [{ field: 'categoryId', message: 'Select an Active Category' }],
        'PRODUCT_CATEGORY_INACTIVE',
      );
    }
    return category;
  }

  async function loadInventories(products) {
    if (!inventoryRepository?.findByProductIds || !products.length) return new Map();
    const inventories = await inventoryRepository.findByProductIds(
      products.map((product) => product._id),
    );
    return new Map(inventories.map(
      (inventory) => [String(inventory.productId), inventory],
    ));
  }

  async function assertActivationGuards(product, effective = {}) {
    const merged = { ...product, ...effective };
    const errors = [];
    if (!collapseWhitespace(merged.name)) errors.push({ field: 'name', message: 'Name is required' });
    if (!canonicalizeSku(merged.sku)) errors.push({ field: 'sku', message: 'SKU is required' });
    if (!String(merged.description || '').trim()) {
      errors.push({ field: 'description', message: 'Description is required' });
    }
    if (!collapseWhitespace(merged.unit)) errors.push({ field: 'unit', message: 'Unit is required' });
    if (!Number.isInteger(Number(merged.price)) || Number(merged.price) <= 0) {
      errors.push({ field: 'price', message: 'Positive integer VND price is required' });
    }
    try {
      validateManagedImages(merged.imageUrls);
    } catch {
      errors.push({ field: 'imageUrls', message: 'One to five managed images are required' });
    }
    try {
      await ensureActiveCategory(getCategoryId(merged.categoryId));
    } catch {
      errors.push({ field: 'categoryId', message: 'An Active Category is required' });
    }
    if (inventoryRepository) {
      const count = inventoryRepository.countByProductId
        ? await inventoryRepository.countByProductId(product._id)
        : (await inventoryRepository.findByProductId(product._id) ? 1 : 0);
      if (count !== 1) {
        errors.push({ field: 'inventory', message: 'Exactly one Inventory is required' });
      }
    }
    if (errors.length) {
      throw new ApiError(
        409,
        'Product activation guards failed',
        errors,
        'PRODUCT_ACTIVATION_GUARDS_FAILED',
      );
    }
  }

  async function listNewestPublicProducts(limit = 10) {
    const boundedLimit = Math.min(10, normalizePositiveInteger(limit, 'limit', {
      defaultValue: 10,
      max: 10,
    }));
    let products = productRepository.listNewestPublic
      ? await productRepository.listNewestPublic(boundedLimit)
      : await productRepository.list();
    products = products
      .filter((product) => product.status === 'Active' && hasActivePopulatedCategory(product))
      .sort(compareProducts('newest'))
      .slice(0, boundedLimit);
    const inventoryByProductId = await loadInventories(products);
    return products.map((product) => toPublicProduct(
      product,
      inventoryByProductId.get(String(product._id)),
    ));
  }

  async function createProduct(input, actor = {}, options = {}) {
    const normalized = validateProductInput(input);
    const currency = normalizeCurrency(input.currency);
    const command = normalizeProductCreateCommand({
      actor,
      input,
      normalized,
      currency,
      options,
    });
    const existingResult = await findCreateCommand(command);
    if (existingResult) return existingResult;

    await ensureActiveCategory(input.categoryId);
    if (productRepository.findBySkuAlias) {
      const conflict = await productRepository.findBySkuAlias(normalized.sku);
      if (conflict) {
        throw new ApiError(
          409,
          'Product SKU already exists or was previously used',
          [{ field: 'sku', message: 'Current and former SKUs cannot be reused' }],
          'PRODUCT_SKU_CONFLICT',
        );
      }
    }

    const productData = {
      ...normalized,
      currency,
      categoryId: input.categoryId,
      status: 'Inactive',
      priceVersion: nextPriceVersion(null, clock()),
      priceHistory: [],
      skuAliases: [normalized.sku],
      skuHistory: [],
    };
    const work = async (session) => {
      const transactionReplay = await findCreateCommand(command, session);
      if (transactionReplay) return transactionReplay;
      if (mediaRepository?.assertOwnedForAttachment) {
        await mediaRepository.assertOwnedForAttachment(
          normalized.imageUrls,
          actor.id,
          null,
          session,
        );
      }
      let product;
      try {
        product = await productRepository.create(productData, session);
      } catch (error) {
        rethrowProductRepositoryError(error);
      }
      let inventory;
      try {
        inventory = inventoryRepository
          ? await inventoryRepository.create({
            productId: product._id,
            stockQuantity: 0,
            sellableQuantity: 0,
            reservedQuantity: 0,
            quarantinedQuantity: 0,
            damagedQuantity: 0,
            lowStockThreshold: 5,
            inventoryHealth: 'Normal',
            lastUpdatedBy: actor.id || null,
          }, session)
          : null;
        if (mediaRepository?.attach) {
          await mediaRepository.attach(
            normalized.imageUrls,
            actor.id,
            product._id,
            session,
          );
        }
        await auditLogger.log({
          userId: actor.id,
          action: 'PRODUCT_CREATE',
          eventId: command.auditEventId,
          targetEntity: 'Product',
          targetId: String(product._id),
          description: `Product created Inactive: ${product.name}`,
          after: { sku: product.sku, price: product.price, status: 'Inactive' },
        }, session);
      } catch (error) {
        if (!session && productRepository.deleteById) {
          await productRepository.deleteById(product._id);
        }
        throw error;
      }
      const resultSnapshot = toAdminProduct(product, inventory);
      await persistCreateCommand(
        command,
        String(product._id),
        resultSnapshot,
        session,
      );
      return resultSnapshot;
    };

    try {
      return transactionManager
        ? await transactionManager.withTransaction(work)
        : await work(null);
    } catch (error) {
      if (error?.code === 11000) {
        const committedReplay = await findCreateCommand(command);
        if (committedReplay) return committedReplay;
      }
      rethrowProductRepositoryError(error);
    }
  }

  async function updateProduct(id, input, actor = {}) {
    assertNoProductStockInput(input);
    const existing = await productRepository.findById(id);
    if (!existing) throw new ApiError(404, 'Product not found', [], 'PRODUCT_NOT_FOUND');
    const data = {};
    for (const field of ['name', 'description', 'unit']) {
      if (input[field] !== undefined) data[field] = collapseWhitespace(input[field]);
    }
    if (input.description !== undefined && /<[^>]+>/u.test(String(input.description))) {
      throw new ApiError(
        400,
        'Product description must be plain text',
        [{ field: 'description', message: 'HTML markup is not accepted' }],
        'PRODUCT_VALIDATION_FAILED',
      );
    }
    if (input.categoryId !== undefined) {
      await ensureActiveCategory(input.categoryId);
      data.categoryId = input.categoryId;
    }
    if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
    if (input.imageUrls !== undefined) {
      data.imageUrls = validateManagedImages(input.imageUrls);
      if (mediaRepository?.assertOwnedForAttachment) {
        await mediaRepository.assertOwnedForAttachment(
          data.imageUrls,
          actor.id,
          existing._id,
        );
      }
    }

    const requestedSku = input.sku !== undefined
      ? canonicalizeSku(input.sku)
      : canonicalizeSku(existing.sku);
    if (!requestedSku) {
      throw new ApiError(
        400,
        'Product SKU is required',
        [{ field: 'sku', message: 'Canonical Product SKU is required' }],
        'PRODUCT_VALIDATION_FAILED',
      );
    }
    if (requestedSku !== canonicalizeSku(existing.sku)) {
      const reason = String(input.skuCorrectionReason || '').trim();
      if (!reason) {
        throw new ApiError(
          400,
          'SKU correction reason is required',
          [{ field: 'skuCorrectionReason', message: 'Explain the attributable identity correction' }],
          'SKU_CORRECTION_REASON_REQUIRED',
        );
      }
      if (productRepository.findBySkuAlias) {
        const conflict = await productRepository.findBySkuAlias(requestedSku, id);
        if (conflict) {
          throw new ApiError(
            409,
            'Product SKU already exists or was previously used',
            [{ field: 'sku', message: 'Current and former SKUs cannot be reused' }],
            'PRODUCT_SKU_CONFLICT',
          );
        }
      }
      data.sku = requestedSku;
      data.skuAliases = [...new Set([
        ...(existing.skuAliases || []),
        canonicalizeSku(existing.sku),
        requestedSku,
      ])];
      data.skuHistory = [
        ...(existing.skuHistory || []),
        {
          sku: canonicalizeSku(existing.sku),
          reason,
          changedAt: new Date(clock()),
          changedBy: actor.id || null,
        },
      ];
    }

    if (input.unit !== undefined && data.unit !== collapseWhitespace(existing.unit)) {
      const hasUsage = dependencyRepository?.hasUnitUsage
        ? await dependencyRepository.hasUnitUsage(existing._id)
        : false;
      if (hasUsage) {
        throw new ApiError(
          409,
          'Product unit is immutable after Inventory or Order use',
          [{ field: 'unit', message: 'Create a new Product identity for a different unit' }],
          'PRODUCT_UNIT_IMMUTABLE',
        );
      }
    }

    if (input.price !== undefined) {
      const price = Number(input.price);
      if (!Number.isInteger(price) || price <= 0) {
        throw new ApiError(
          400,
          'Product price must be a positive integer VND amount',
          [{ field: 'price', message: 'Enter a positive whole-number VND price' }],
          'PRODUCT_PRICE_INVALID',
        );
      }
      if (price !== Number(existing.price)) {
        const version = nextPriceVersion(existing.priceVersion || existing.updatedAt, clock());
        data.price = price;
        data.priceVersion = version;
        data.priceHistory = [
          ...(existing.priceHistory || []),
          {
            oldPrice: Number(existing.price),
            newPrice: price,
            version,
            changedAt: new Date(clock()),
            changedBy: actor.id || null,
          },
        ];
      }
    }

    if (input.status !== undefined) {
      const status = String(input.status).trim();
      if (!['Active', 'Inactive'].includes(status)) {
        throw new ApiError(
          400,
          'Product status is invalid',
          [{ field: 'status', message: 'Status must be Active or Inactive' }],
          'PRODUCT_STATUS_INVALID',
        );
      }
      if (status === 'Active' && existing.status !== 'Active') {
        if (mediaRepository?.assertOwnedForAttachment) {
          await mediaRepository.assertOwnedForAttachment(
            data.imageUrls || existing.imageUrls,
            actor.id,
            existing._id,
          );
        }
        await assertActivationGuards(existing, data);
      }
      data.status = status;
    }

    data.searchTextNormalized = buildProductSearchText({ ...existing, ...data });
    let product;
    try {
      product = await productRepository.updateById(id, data);
    } catch (error) {
      rethrowProductRepositoryError(error);
    }
    if (!product) throw new ApiError(404, 'Product not found', [], 'PRODUCT_NOT_FOUND');
    if (data.imageUrls && mediaRepository?.attach) {
      await mediaRepository.attach(data.imageUrls, actor.id, product._id);
    }

    await auditLogger.log({
      userId: actor.id,
      action: input.status !== undefined && Object.keys(input).length === 1
        ? 'PRODUCT_STATUS_UPDATE'
        : 'PRODUCT_UPDATE',
      targetEntity: 'Product',
      targetId: String(id),
      description: `Product updated: ${product.name}`,
      before: { sku: existing.sku, price: existing.price, status: existing.status },
      after: { sku: product.sku, price: product.price, status: product.status },
    });

    const inventory = inventoryRepository?.findByProductId
      ? await inventoryRepository.findByProductId(product._id)
      : null;
    return toAdminProduct(product, inventory);
  }

  return {
    async listPublicProducts(query = {}) {
      const filters = normalizeCatalogQuery(query);
      let products = productRepository.listPublicCandidates
        ? await productRepository.listPublicCandidates(filters)
        : await productRepository.list();
      products = products
        .filter((product) => product.status === 'Active' && hasActivePopulatedCategory(product))
        .filter((product) => !filters.categoryId
          || String(getCategoryId(product.categoryId)) === filters.categoryId)
        .filter((product) => filters.minPrice === undefined
          || Number(product.price) >= filters.minPrice)
        .filter((product) => filters.maxPrice === undefined
          || Number(product.price) <= filters.maxPrice)
        .filter((product) => matchesNormalizedKeyword(product, filters.keyword))
        .sort(compareProducts(filters.sort));
      const inventoryByProductId = await loadInventories(products);
      if (filters.availability) {
        products = products.filter((product) => availabilityStatusOf(
          inventoryByProductId.get(String(product._id)),
        ) === filters.availability);
      }
      const total = products.length;
      const totalPages = total ? Math.ceil(total / filters.pageSize) : 0;
      const start = (filters.page - 1) * filters.pageSize;
      return {
        items: products.slice(start, start + filters.pageSize).map(
          (product) => toPublicProduct(
            product,
            inventoryByProductId.get(String(product._id)),
          ),
        ),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages,
      };
    },

    async getPublicProductById(id) {
      const product = await productRepository.findPublicById(id);
      if (!product || !hasActivePopulatedCategory(product)) {
        throw new ApiError(404, 'Product not found', [], 'PRODUCT_NOT_FOUND');
      }
      const [inventory, reviews] = await Promise.all([
        inventoryRepository?.findByProductId
          ? inventoryRepository.findByProductId(product._id)
          : null,
        reviewRepository?.listActiveByProduct
          ? reviewRepository.listActiveByProduct(product._id)
          : (product.activeReviews || []),
      ]);
      return toPublicProduct(product, inventory, reviews);
    },

    async listAdminProducts() {
      const products = await productRepository.list();
      const inventoryByProductId = await loadInventories(products);
      return products.map((product) => toAdminProduct(
        product,
        inventoryByProductId.get(String(product._id)),
      ));
    },

    createProduct,
    updateProduct,
    listNewestPublicProducts,

    async listBestSellers({ limit = 10, now = clock() } = {}) {
      const boundedLimit = Math.min(10, normalizePositiveInteger(limit, 'limit', {
        defaultValue: 10,
        max: 10,
      }));
      const rows = bestSellerRepository?.aggregateQualifying
        ? await bestSellerRepository.aggregateQualifying(vietnamWindowStart(now), new Date(now))
        : [];
      const productIds = rows.map((row) => row._id || row.productId);
      const products = productIds.length && productRepository.findPublicByIds
        ? await productRepository.findPublicByIds(productIds)
        : [];
      const publicById = new Map(
        products
          .filter((product) => (
            product.status === 'Active' && hasActivePopulatedCategory(product)
          ))
          .map((product) => [String(product._id), product]),
      );
      const qualifying = rows
        .map((row) => ({
          product: publicById.get(String(row._id || row.productId)),
          quantity: Number(row.quantity || 0),
          revenue: Number(row.revenue || 0),
        }))
        .filter((row) => row.product)
        .sort((left, right) => (
          right.quantity - left.quantity
          || right.revenue - left.revenue
          || canonicalizeSku(left.product.sku).localeCompare(canonicalizeSku(right.product.sku))
        ))
        .slice(0, boundedLimit);

      if (!qualifying.length) {
        return {
          type: 'Newest',
          label: 'Sản phẩm mới',
          items: await listNewestPublicProducts(boundedLimit),
        };
      }
      const inventoryByProductId = await loadInventories(
        qualifying.map((row) => row.product),
      );
      return {
        type: 'BestSeller',
        label: 'Bán chạy',
        items: qualifying.map((row) => ({
          ...toPublicProduct(
            row.product,
            inventoryByProductId.get(String(row.product._id)),
          ),
          bestSellerQuantity: row.quantity,
          bestSellerRevenue: row.revenue,
        })),
      };
    },
  };
}

module.exports = {
  createProductService,
  productService: createProductService(),
  normalizeCatalogQuery,
  vietnamWindowStart,
};
