function createActiveAssignmentService({
  adapters = [],
  eventSink = { async emit() {} },
} = {}) {
  const emittedKeys = new Set();

  async function inspect(userId) {
    const activeAssignments = [];
    for (const adapter of adapters) {
      const result = await adapter.hasActiveAssignment(userId);
      if (result === true || result?.active) {
        activeAssignments.push({
          sliceId: adapter.sliceId,
          detail: result === true ? undefined : result?.detail,
        });
      }
    }
    return activeAssignments;
  }

  return {
    async hasActiveAssignments(userId) {
      const assignments = await inspect(userId);
      return { active: assignments.length > 0, assignments };
    },
    async handleDisabledAccount({ userId, idempotencyKey, reason }) {
      const activeAssignments = await inspect(userId);
      const key = String(idempotencyKey || `ACCOUNT_DISABLED:${userId}`);
      if (!emittedKeys.has(key)) {
        await eventSink.emit({
          eventType: 'ACCOUNT_DISABLED',
          idempotencyKey: key,
          userId: String(userId),
          reason,
          activeAssignments,
          impersonationAllowed: false,
        });
        emittedKeys.add(key);
      }
      return { activeAssignments };
    },
  };
}

module.exports = {
  createActiveAssignmentService,
  activeAssignmentService: createActiveAssignmentService(),
};
