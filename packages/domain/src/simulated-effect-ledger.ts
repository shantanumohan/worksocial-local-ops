/**
 * In-memory simulated effect ledger for offline unit tests.
 * Records intent digests and outcomes without contacting providers.
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

  settle(operationId: string, outcome: Exclude<EffectOutcome, "INTENDED">): EffectRecord {
    const existing = this.byOperation.get(operationId);
    if (!existing) {
      throw new Error(`Unknown operation ${operationId}`);
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
