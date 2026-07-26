const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  buildStaffQueuePage,
  escapeRegex,
  parseStaffQueueQuery,
} = require('./staffQueueQuery');

describe('bounded Staff queue query contract', () => {
  const allowedStatuses = new Set(['Pending', 'Confirmed']);

  it('applies stable defaults and trims an optional search term', () => {
    assert.deepEqual(
      parseStaffQueueQuery({ search: '  GH-001  ' }, { allowedStatuses }),
      {
        page: 1,
        pageSize: 20,
        search: 'GH-001',
        status: '',
        skip: 0,
      },
    );
  });

  it('accepts bounded positive paging and an allowed status', () => {
    assert.deepEqual(
      parseStaffQueueQuery(
        { page: '3', pageSize: '25', status: 'Confirmed' },
        { allowedStatuses },
      ),
      {
        page: 3,
        pageSize: 25,
        search: '',
        status: 'Confirmed',
        skip: 50,
      },
    );
  });

  it('rejects invalid, excessive, and ambiguous queue inputs', () => {
    for (const query of [
      { page: '0' },
      { page: '1.5' },
      { pageSize: '51' },
      { pageSize: ['10', '20'] },
      { status: 'Delivered' },
      { search: 'x'.repeat(81) },
      { search: 'valid\u0000invalid' },
    ]) {
      assert.throws(
        () => parseStaffQueueQuery(query, { allowedStatuses }),
        (error) => error.statusCode === 400,
      );
    }
  });

  it('escapes regex metacharacters before a code search reaches MongoDB', () => {
    assert.equal(escapeRegex('GH.*(01)?'), 'GH\\.\\*\\(01\\)\\?');
  });

  it('returns deterministic page metadata without dropping the legacy total field', () => {
    assert.deepEqual(
      buildStaffQueuePage(['row-1', 'row-2'], 42, { page: 2, pageSize: 20 }),
      {
        items: ['row-1', 'row-2'],
        total: 42,
        page: 2,
        pageSize: 20,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
      },
    );
  });
});
