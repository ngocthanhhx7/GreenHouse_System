const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createCategoryService } = require('./category.service');

function createCategoryRepository() {
  const categories = [
    { _id: 'cat-1', name: 'Cookware', description: 'Pots and pans', status: 'Active' },
    { _id: 'cat-2', name: 'Old Tools', description: '', status: 'Inactive' },
  ];

  return {
    categories,
    async list() {
      return categories;
    },
    async findByName(name) {
      return categories.find((category) => category.name.toLowerCase() === name.toLowerCase()) || null;
    },
    async create(data) {
      const category = { _id: `cat-${categories.length + 1}`, ...data };
      categories.push(category);
      return category;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

describe('category service', () => {
  let categoryService;
  let auditLogger;

  beforeEach(() => {
    auditLogger = createAuditLogger();
    categoryService = createCategoryService({
      categoryRepository: createCategoryRepository(),
      auditLogger,
    });
  });

  it('lists only active categories for public catalog', async () => {
    const result = await categoryService.listPublicCategories();

    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Cookware');
    assert.equal(result[0].status, 'Active');
  });

  it('creates a category and writes audit log', async () => {
    const result = await categoryService.createCategory(
      { name: 'Kitchen Storage', description: 'Storage items', status: 'Active' },
      { id: 'admin-1' }
    );

    assert.equal(result.name, 'Kitchen Storage');
    assert.equal(auditLogger.entries[0].action, 'CATEGORY_CREATE');
  });

  it('rejects duplicate category names', async () => {
    await assert.rejects(
      () => categoryService.createCategory({ name: 'Cookware', description: '', status: 'Active' }, { id: 'admin-1' }),
      /Category name already exists/
    );
  });
});
