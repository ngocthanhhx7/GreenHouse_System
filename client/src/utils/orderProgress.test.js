import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ORDER_PROGRESS_STATUSES,
  getOrderProgress,
} from './orderProgress.js';

describe('order fulfillment progress', () => {
  it('keeps one canonical Pending to Delivered ordering', () => {
    assert.deepEqual(
      ORDER_PROGRESS_STATUSES,
      ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'],
    );
  });

  it('marks previous, current and future steps for an active order', () => {
    assert.deepEqual(
      getOrderProgress('Packed').map(({ status, state }) => ({ status, state })),
      [
        { status: 'Pending', state: 'complete' },
        { status: 'Confirmed', state: 'complete' },
        { status: 'Packed', state: 'current' },
        { status: 'Shipped', state: 'upcoming' },
        { status: 'Delivered', state: 'upcoming' },
      ],
    );
  });

  it('marks every step complete when delivery is finished', () => {
    const progress = getOrderProgress('Delivered');
    assert.equal(progress.at(-1).state, 'current');
    assert.ok(progress.slice(0, -1).every((step) => step.state === 'complete'));
  });

  it('does not fabricate progress for a terminal exception state', () => {
    assert.ok(getOrderProgress('Cancelled').every((step) => step.state === 'terminal'));
  });
});
