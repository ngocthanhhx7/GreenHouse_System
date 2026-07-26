import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createStaffQueueParams,
  normalizeStaffQueuePage,
} from './staffQueuePage.js';

describe('Staff queue page helpers', () => {
  it('creates a trimmed bounded query without sending empty filters', () => {
    assert.deepEqual(
      createStaffQueueParams({
        status: 'Pending',
        search: '  GH-001  ',
        page: 2,
        pageSize: 20,
      }),
      {
        status: 'Pending',
        search: 'GH-001',
        page: 2,
        pageSize: 20,
      },
    );
    assert.deepEqual(
      createStaffQueueParams({ status: '', search: ' ', page: 1, pageSize: 20 }),
      { page: 1, pageSize: 20 },
    );
  });

  it('normalizes canonical backend pagination metadata', () => {
    assert.deepEqual(
      normalizeStaffQueuePage({
        items: [{ id: 'row-1' }],
        total: 41,
        page: 2,
        pageSize: 20,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
      }),
      {
        items: [{ id: 'row-1' }],
        total: 41,
        page: 2,
        pageSize: 20,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
      },
    );
  });

  it('keeps older item-only responses usable during a rolling deployment', () => {
    assert.deepEqual(
      normalizeStaffQueuePage({ items: [{ id: 'row-1' }] }, 1, 20),
      {
        items: [{ id: 'row-1' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    );
  });
});
