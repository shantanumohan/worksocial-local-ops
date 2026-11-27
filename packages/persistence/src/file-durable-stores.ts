/**
 * File-backed durable execution stores for LOCAL_DURABLE without Postgres.
 * Survives process restart; ACCEPTED_PENDING ≠ VERIFIED. External effects: none.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  DurableEffectIntent,
  DurableGatewayDecision,
  DurableJobRecord,
  EffectAttemptRecord,
  ExecutionReceipt,
  FakeProviderEffect,
  JobInsertInput,
  JobStatus,
} from "./execution-types.js";
import type { EffectStore } from "./effect-store.js";
import type { FakeProviderStore } from "./fake-provider-store.js";
import type { GatewayDecisionStore } from "./gateway-decision-store.js";
import type { JobStore } from "./job-store.js";
import type { ReceiptStore } from "./receipt-store.js";
import type { BudgetStore } from "./budget-store.js";
import { createMemoryBudgetStore } from "./budget-store.js";
import type { DurableExecutionStores } from "./durable-execution.js";

type LedgerSnapshot = {
  version: 1;
  jobs: DurableJobRecord[];
  intents: DurableEffectIntent[];
  attempts: EffectAttemptRecord[];
  decisions: DurableGatewayDecision[];
  receipts: ExecutionReceipt[];
  providerEffects: FakeProviderEffect[];
};

function emptySnapshot(): LedgerSnapshot {
  return {
    version: 1,
    jobs: [],
    intents: [],
    attempts: [],
    decisions: [],
    receipts: [],
    providerEffects: [],
  };
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function loadSnapshot(filePath: string): LedgerSnapshot {
  if (!existsSync(filePath)) return emptySnapshot();
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as LedgerSnapshot;
    if (!raw || raw.version !== 1) return emptySnapshot();
    return {
      version: 1,
      jobs: raw.jobs ?? [],
      intents: raw.intents ?? [],
      attempts: raw.attempts ?? [],
      decisions: raw.decisions ?? [],
      receipts: raw.receipts ?? [],
      providerEffects: raw.providerEffects ?? [],
    };
  } catch {
    return emptySnapshot();
  }
}

/**
 * Restart-safe durable stores under `<stateDir>/durable/ledger.json`.
 * Budgets remain in-memory (content distribute does not reserve budgets).
 */
export function createFileDurableStores(stateDir: string): DurableExecutionStores {
  const ledgerPath = join(stateDir, "durable", "ledger.json");
  const snap = loadSnapshot(ledgerPath);

  const jobsById = new Map(snap.jobs.map((j) => [j.jobId, j]));
  const jobsByIdem = new Map(snap.jobs.map((j) => [j.idempotencyKey, j.jobId]));
  const intents = new Map(snap.intents.map((i) => [i.operationId, i]));
  const attempts = new Map<string, EffectAttemptRecord[]>();
  for (const a of snap.attempts) {
    const list = attempts.get(a.operationId) ?? [];
    list.push(a);
    attempts.set(a.operationId, list);
  }
  const decisions = new Map(snap.decisions.map((d) => [d.operationId, d]));
  const receiptsById = new Map(snap.receipts.map((r) => [r.receiptId, r]));
  const receiptsByOp = new Map<string, string[]>();
  for (const r of snap.receipts) {
    const list = receiptsByOp.get(r.operationId) ?? [];
    list.push(r.receiptId);
    receiptsByOp.set(r.operationId, list);
  }
  const providerByKey = new Map(
    snap.providerEffects.map((e) => [e.businessIdempotencyKey, e]),
  );
  const providerByOp = new Map(
    snap.providerEffects.map((e) => [e.operationId, e.businessIdempotencyKey]),
  );

  const persist = () => {
    const next: LedgerSnapshot = {
      version: 1,
      jobs: [...jobsById.values()],
      intents: [...intents.values()],
      attempts: [...attempts.values()].flat(),
      decisions: [...decisions.values()],
      receipts: [...receiptsById.values()],
      providerEffects: [...providerByKey.values()],
    };
    atomicWriteJson(ledgerPath, next);
  };

  const jobs: JobStore = {
    async insert(input: JobInsertInput) {
      if (jobsByIdem.has(input.idempotencyKey)) {
        throw new Error(
          `Job idempotency key already exists: ${input.idempotencyKey}`,
        );
      }
      const stamp = new Date().toISOString();
      const job: DurableJobRecord = {
        ...input,
        status: input.status ?? "queued",
        leaseHolder: null,
        leaseExpiresAtIso: null,
        attemptCount: 0,
        envelopeJson: input.envelopeJson ?? {},
        createdAtIso: stamp,
        updatedAtIso: stamp,
      };
      jobsById.set(job.jobId, job);
      jobsByIdem.set(job.idempotencyKey, job.jobId);
      persist();
      return job;
    },
    async insertIdempotent(input) {
      const existingId = jobsByIdem.get(input.idempotencyKey);
      if (existingId) {
        return { job: jobsById.get(existingId)!, created: false };
      }
      const job = await jobs.insert(input);
      return { job, created: true };
    },
    async get(jobId) {
      return jobsById.get(jobId);
    },
    async getByIdempotencyKey(key) {
      const id = jobsByIdem.get(key);
      return id ? jobsById.get(id) : undefined;
    },
    async updateStatus(jobId, status: JobStatus, nowIso: string) {
      const existing = jobsById.get(jobId);
      if (!existing) throw new Error(`Unknown job ${jobId}`);
      const updated = { ...existing, status, updatedAtIso: nowIso };
      jobsById.set(jobId, updated);
      persist();
      return updated;
    },
    async listByStatus(status) {
      return [...jobsById.values()].filter((j) => j.status === status);
    },
  };

  // Align with SimulatedEffectLedger / memory EffectStore — allow
  // ACCEPTED_PENDING → UNKNOWN_REMOTE_OUTCOME → VERIFIED (T-X020 timeout path).
  const TERMINAL = new Set(["VERIFIED", "RECONCILED_SKIPPED"]);
  const OUTCOME_RANK: Record<string, number> = {
    INTENDED: 0,
    ACCEPTED_PENDING: 1,
    UNKNOWN_REMOTE_OUTCOME: 2,
    FAILED: 3,
    RECONCILED_SKIPPED: 4,
    VERIFIED: 5,
  };

  const effects: EffectStore = {
    async recordIntent(input) {
      const existing = intents.get(input.operationId);
      if (existing) {
        if (existing.payloadDigest !== input.payloadDigest) {
          throw new Error(
            `Operation ${input.operationId} already recorded with a different payload digest`,
          );
        }
        return existing;
      }
      const stamp = input.recordedAtIso;
      const record: DurableEffectIntent = {
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        outcome: input.outcome ?? "INTENDED",
        recordedAtIso: stamp,
        jobId: input.jobId ?? null,
        effectState: input.effectState ?? "QUEUED",
        businessIdempotencyKey: input.businessIdempotencyKey ?? null,
        updatedAtIso: stamp,
      };
      intents.set(record.operationId, record);
      persist();
      return record;
    },
    async settle(operationId, outcome, effectState) {
      const existing = intents.get(operationId);
      if (!existing) throw new Error(`Unknown operation ${operationId}`);
      if (TERMINAL.has(existing.outcome)) {
        if (existing.outcome === outcome) return existing;
        throw new Error(
          `Operation ${operationId} is terminal (${existing.outcome}); cannot settle to ${outcome}`,
        );
      }
      if ((OUTCOME_RANK[outcome] ?? 0) < (OUTCOME_RANK[existing.outcome] ?? 0)) {
        throw new Error(
          `Operation ${operationId} cannot regress from ${existing.outcome} to ${outcome}`,
        );
      }
      const updated: DurableEffectIntent = {
        ...existing,
        outcome,
        effectState: effectState ?? existing.effectState,
        updatedAtIso: new Date().toISOString(),
      };
      intents.set(operationId, updated);
      persist();
      return updated;
    },
    async get(operationId) {
      return intents.get(operationId);
    },
    async list() {
      return [...intents.values()];
    },
    async recordAttempt(input) {
      const list = attempts.get(input.operationId) ?? [];
      const record: EffectAttemptRecord = {
        attemptId: `att-${randomBytes(6).toString("hex")}`,
        operationId: input.operationId,
        attemptNumber: input.attemptNumber,
        phase: input.phase,
        status: input.status,
        detail: input.detail ?? "",
        providerReceiptId: input.providerReceiptId ?? null,
        createdAtIso: new Date().toISOString(),
      };
      list.push(record);
      attempts.set(input.operationId, list);
      persist();
      return record;
    },
    async listAttempts(operationId) {
      return [...(attempts.get(operationId) ?? [])];
    },
    async countApplyAttempts(operationId) {
      return (attempts.get(operationId) ?? []).filter((a) => a.phase === "apply")
        .length;
    },
  };

  const decisionsStore: GatewayDecisionStore = {
    async put(decision) {
      decisions.set(decision.operationId, decision);
      persist();
      return decision;
    },
    async get(operationId) {
      return decisions.get(operationId);
    },
    async list() {
      return [...decisions.values()];
    },
  };

  const receipts: ReceiptStore = {
    async add(input) {
      const receipt: ExecutionReceipt = {
        receiptId: input.receiptId ?? `rcpt-${randomBytes(6).toString("hex")}`,
        operationId: input.operationId,
        kind: input.kind,
        observedDigest: input.observedDigest ?? null,
        observedPayload: input.observedPayload ?? {},
        verdict: input.verdict,
        detail: input.detail ?? "",
        recordedAtIso: input.recordedAtIso ?? new Date().toISOString(),
      };
      receiptsById.set(receipt.receiptId, receipt);
      const list = receiptsByOp.get(receipt.operationId) ?? [];
      list.push(receipt.receiptId);
      receiptsByOp.set(receipt.operationId, list);
      persist();
      return receipt;
    },
    async listForOperation(operationId) {
      return (receiptsByOp.get(operationId) ?? [])
        .map((id) => receiptsById.get(id)!)
        .filter(Boolean);
    },
    async get(receiptId) {
      return receiptsById.get(receiptId);
    },
  };

  const fakeProvider: FakeProviderStore = {
    async applyOnce(input) {
      const existing = providerByKey.get(input.businessIdempotencyKey);
      if (existing) {
        if (existing.payloadDigest !== input.payloadDigest) {
          throw new Error(
            `Fake provider key ${input.businessIdempotencyKey} bound to a different payload digest`,
          );
        }
        const touched = {
          ...existing,
          lastSeenAtIso: new Date().toISOString(),
        };
        providerByKey.set(input.businessIdempotencyKey, touched);
        persist();
        return { effect: touched, created: false };
      }
      const stamp = new Date().toISOString();
      const effect: FakeProviderEffect = {
        providerEffectId: `fpe-${randomBytes(6).toString("hex")}`,
        businessIdempotencyKey: input.businessIdempotencyKey,
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        applyCount: 1,
        remoteRef:
          input.remoteRef ?? `remote-${randomBytes(4).toString("hex")}`,
        appliedAtIso: stamp,
        lastSeenAtIso: stamp,
      };
      providerByKey.set(effect.businessIdempotencyKey, effect);
      providerByOp.set(effect.operationId, effect.businessIdempotencyKey);
      persist();
      return { effect, created: true };
    },
    async getByBusinessKey(key) {
      return providerByKey.get(key);
    },
    async getByOperation(operationId) {
      const key = providerByOp.get(operationId);
      return key ? providerByKey.get(key) : undefined;
    },
    async list() {
      return [...providerByKey.values()];
    },
  };

  // Budgets unused by content distribute; keep memory.
  const budgets: BudgetStore = createMemoryBudgetStore();

  return {
    jobs,
    effects,
    decisions: decisionsStore,
    receipts,
    budgets,
    fakeProvider,
  };
}

export function defaultDurableStateDir(baseDir: string): string {
  return join(baseDir, "durable");
}
