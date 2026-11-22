/**
 * Fixture Zoho CRM adapter for M5 / NEXT-16.
 * Write → verify fields → cleanup. Live Zoho remains NOT_WIRED.
 * No production mutations.
 */

import { randomBytes } from "node:crypto";
import {
  bindSyntheticFromServerGrant,
  parsePublicSyntheticClaim,
  verifyCanaryCrmFields,
  type CanaryRemoteReceipt,
  type CrmFieldVerifyResult,
} from "@worksocial/domain";

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

export type FixtureCrmLedgerEntry = {
  receipt: CanaryRemoteReceipt;
  cleaned: boolean;
  cleanedAtIso: string | null;
};

export type FixtureCrmWriteInput = {
  correlationId: string;
  moduleId?: string;
  fieldSnapshot: Record<string, string>;
  nowIso: string;
  /** Test hook: omit record id for ambiguous reconciliation. */
  omitRecordId?: boolean;
  /** Test hook: skip writing (delivery failure). */
  skipWrite?: boolean;
  /**
   * Host/gateway canary grant. Defaults true for host-driven fixture canaries.
   * Explicit false refuses public synthetic-flag abuse (T-X050).
   */
  serverCanaryGrantPresent?: boolean;
  /**
   * Test hook (T-X023): first N `getByCorrelation` reads return empty
   * (eventual-consistency false not-found) while the write remains on the ledger.
   */
  visibilityLagReads?: number;
};

export type FixtureCrmCleanupResult = {
  ok: boolean;
  code: string;
  cleanedRecordId: string | null;
  receiptId: string | null;
  details: string[];
};

export type ZohoCrmFixtureAdapter = {
  readonly mode: "FIXTURE";
  readonly liveZohoWiring: "NOT_WIRED";
  /** Counts every writeSyntheticLead call (including skipWrite). */
  writeAttemptCount(): number;
  writeSyntheticLead(input: FixtureCrmWriteInput): CanaryRemoteReceipt | null;
  verifyFields(input: {
    correlationId: string;
    expected: Record<string, string>;
  }): CrmFieldVerifyResult & { receipt: CanaryRemoteReceipt | null };
  cleanup(input: {
    correlationId: string;
    nowIso: string;
  }): FixtureCrmCleanupResult;
  listActive(): CanaryRemoteReceipt[];
  listAll(): FixtureCrmLedgerEntry[];
  getByCorrelation(correlationId: string): FixtureCrmLedgerEntry | null;
};

/**
 * In-memory fixture CRM ledger. Approved test destination only.
 */
export function createZohoCrmFixtureAdapter(): ZohoCrmFixtureAdapter {
  const ledger = new Map<string, FixtureCrmLedgerEntry>();
  const visibilityLagReads = new Map<string, number>();
  let writeAttempts = 0;

  return {
    mode: "FIXTURE",
    liveZohoWiring: "NOT_WIRED",

    writeAttemptCount() {
      return writeAttempts;
    },

    writeSyntheticLead(input) {
      writeAttempts += 1;
      if (input.skipWrite) {
        return null;
      }
      const claim = parsePublicSyntheticClaim(input.fieldSnapshot);
      const bind = bindSyntheticFromServerGrant({
        clientClaimedSynthetic: claim,
        // Host canary writes default to grant-present; explicit false denies abuse.
        serverCanaryGrantPresent: input.serverCanaryGrantPresent !== false,
      });
      if (!bind.synthetic) {
        throw new Error(
          `Fixture CRM refuses synthetic write without server canary grant (${bind.code})`,
        );
      }
      if (input.fieldSnapshot.ws_correlation_id !== input.correlationId) {
        throw new Error("Fixture CRM correlation mismatch on write");
      }
      const fieldSnapshot = {
        ...input.fieldSnapshot,
        ws_synthetic: "true",
      };
      const receipt: CanaryRemoteReceipt = {
        receiptId: newId("rcpt"),
        correlationId: input.correlationId,
        moduleId: input.moduleId ?? "Leads",
        recordId: input.omitRecordId ? null : newId("lead"),
        synthetic: true,
        observedAtIso: input.nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      };
      ledger.set(input.correlationId, {
        receipt,
        cleaned: false,
        cleanedAtIso: null,
      });
      const lag = Math.max(0, input.visibilityLagReads ?? 0);
      if (lag > 0) {
        visibilityLagReads.set(input.correlationId, lag);
      } else {
        visibilityLagReads.delete(input.correlationId);
      }
      return receipt;
    },

    verifyFields(input) {
      const entry = ledger.get(input.correlationId) ?? null;
      if (!entry || entry.cleaned) {
        return {
          passed: false,
          missingFields: ["record"],
          mismatchedFields: [],
          details: ["No active fixture CRM receipt for correlation"],
          receipt: null,
        };
      }
      const result = verifyCanaryCrmFields({
        correlationId: input.correlationId,
        expected: input.expected,
        observed: entry.receipt.fieldSnapshot,
      });
      return { ...result, receipt: entry.receipt };
    },

    cleanup(input) {
      const entry = ledger.get(input.correlationId);
      if (!entry) {
        return {
          ok: false,
          code: "NOT_FOUND",
          cleanedRecordId: null,
          receiptId: null,
          details: ["No fixture CRM receipt to clean up"],
        };
      }
      if (entry.cleaned) {
        return {
          ok: true,
          code: "ALREADY_CLEANED",
          cleanedRecordId: entry.receipt.recordId,
          receiptId: entry.receipt.receiptId,
          details: ["Synthetic receipt already cleaned"],
        };
      }
      if (!entry.receipt.synthetic) {
        return {
          ok: false,
          code: "REFUSE_NON_SYNTHETIC",
          cleanedRecordId: null,
          receiptId: entry.receipt.receiptId,
          details: ["Refuse to cleanup non-synthetic CRM records"],
        };
      }
      entry.cleaned = true;
      entry.cleanedAtIso = input.nowIso;
      ledger.set(input.correlationId, entry);
      return {
        ok: true,
        code: "CLEANED",
        cleanedRecordId: entry.receipt.recordId,
        receiptId: entry.receipt.receiptId,
        details: [
          `Cleaned synthetic fixture CRM record ${entry.receipt.recordId ?? "null"}`,
        ],
      };
    },

    listActive() {
      return [...ledger.values()]
        .filter((e) => !e.cleaned)
        .map((e) => e.receipt);
    },

    listAll() {
      return [...ledger.values()].map((e) => ({ ...e, receipt: { ...e.receipt } }));
    },

    getByCorrelation(correlationId) {
      const lag = visibilityLagReads.get(correlationId) ?? 0;
      if (lag > 0) {
        visibilityLagReads.set(correlationId, lag - 1);
        // Eventual-consistency false not-found: write exists, read empty.
        return null;
      }
      const entry = ledger.get(correlationId);
      return entry ? { ...entry, receipt: { ...entry.receipt } } : null;
    },
  };
}

/** Honest live Zoho stub — always NOT_WIRED. */
export function liveZohoCrmStub(): {
  wiring: "NOT_WIRED";
  write(): never;
  verify(): never;
  cleanup(): never;
} {
  return {
    wiring: "NOT_WIRED",
    write() {
      throw new Error("Live Zoho CRM write is NOT_WIRED");
    },
    verify() {
      throw new Error("Live Zoho CRM verify is NOT_WIRED");
    },
    cleanup() {
      throw new Error("Live Zoho CRM cleanup is NOT_WIRED");
    },
  };
}
