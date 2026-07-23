import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const queueSource = readFileSync(new URL('./ReturnRefundQueuePage.jsx', import.meta.url), 'utf8');
const inspectionSource = readFileSync(new URL('./ReturnRefundInspectionPage.jsx', import.meta.url), 'utf8');

describe('Warehouse COD recovery UI contract', () => {
  it('shows COD recovery work and records every physical order line', () => {
    assert.match(queueSource, /listCodRecoveryCandidates/);
    assert.match(queueSource, /CODRecoveryInProgress/);
    assert.match(inspectionSource, /recordCodRecoveryReceipt/);
    assert.match(inspectionSource, /receivedQuantity/);
    assert.match(inspectionSource, /getCodRecoveryCandidate/);
    assert.doesNotMatch(inspectionSource, /refundAmount|destinationReference/);
  });
});
