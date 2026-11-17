/**
 * In-memory simulated effect ledger for offline unit tests.
 * Records intent digests and outcomes without contacting providers.
 * Terminal VERIFIED (and RECONCILED_SKIPPED) reject regressive weaker outcomes.
 */

export type EffectOutcome =
  | "INTENDED"
  | "ACCEPTED_PENDING"
  | "VERIFIED"
  | "FAILED"
  | "UNKNOWN_REMOTE_OUTCOME"
  | "RECONCILED_SKIPPED";

export type EffectRecord = {
  operationId: string;
  payloadDigest: string;
  outcome: EffectOutcome;
  recordedAtIso: string;
};

const TERMINAL: ReadonlySet<EffectOutcome> = new Set([
  "VERIFIED",
  "RECONCILED_SKIPPED",
]);

const OUTCOME_RANK: Record<EffectOutcome, number> = {
  INTENDED: 0,
  ACCEPTED_PENDING: 1,
  UNKNOWN_REMOTE_OUTCOME: 2,
  FAILED: 3,
  RECONCILED_SKIPPED: 4,
  VERIFIED: 5,
};

export class SimulatedEffectLedger {
  private readonly byOperation = new Map<string, EffectRecord>();

  recordIntent(
    operationId: string,
    payloadDigest: string,
    recordedAtIso: string,
  ): EffectRecord {
    const existing = this.byOperation.get(operationId);
    if (existing) {
      if (existing.payloadDigest !== payloadDigest) {
        throw new Error(
          `Operation ${operationId} already recorded with a different payload digest`,
        );
      }
      return existing;
    }
    const record: EffectRecord = {
      operationId,
      payloadDigest,
      outcome: "INTENDED",
      recordedAtIso,
    };
    this.byOperation.set(operationId, record);
    return record;
  }

  settle(
    operationId: string,
    outcome: Exclude<EffectOutcome, "INTENDED">,
  ): EffectRecord {
    const existing = this.byOperation.get(operationId);
    if (!existing) {
      throw new Error(`Unknown operation ${operationId}`);
    }
    if (TERMINAL.has(existing.outcome)) {
      if (existing.outcome === outcome) {
        return existing;
      }
      throw new Error(
        `Operation ${operationId} is terminal (${existing.outcome}); cannot settle to ${outcome}`,
      );
    }
    if (OUTCOME_RANK[outcome] < OUTCOME_RANK[existing.outcome]) {
      throw new Error(
        `Operation ${operationId} cannot regress from ${existing.outcome} to ${outcome}`,
      );
    }
    const updated: EffectRecord = { ...existing, outcome };
    this.byOperation.set(operationId, updated);
    return updated;
  }

  get(operationId: string): EffectRecord | undefined {
    return this.byOperation.get(operationId);
  }

  hasVerified(operationId: string): boolean {
    return this.byOperation.get(operationId)?.outcome === "VERIFIED";
  }

  list(): EffectRecord[] {
    return [...this.byOperation.values()];
  }
}
