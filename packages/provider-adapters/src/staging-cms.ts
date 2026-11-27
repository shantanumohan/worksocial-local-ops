/**
 * M4 / NEXT-15 — staging CMS adapter with independent read-back + recovery.
 * Uses an in-process simulator when no real CMS credentials exist.
 * Provider acknowledgement ≠ verified; independent read is required.
 */

import { randomBytes } from "node:crypto";
import {
  StagingChangeStatus,
  digestFields,
  evaluateCmsEnvironmentMutateWithLease,
  fieldsMatch,
  validateCmsEnvironmentOperation,
  type CmsEnvironmentGateResult,
  type CmsEnvironmentMutateWithLeaseDecision,
  type CmsEnvironmentValue,
  type StagingChangeRecord,
  type StagingCmsPageRecord,
  type StagingPageFields,
} from "@worksocial/domain";

export type StagingCmsApplyResult = {
  change: StagingChangeRecord;
  page: StagingCmsPageRecord | null;
  note: string;
  /** 0 when environment/lease gate refuses mutate (T-X007). */
  providerMutateCount: number;
  environmentGate: CmsEnvironmentGateResult;
  /** Mutate-time env+lease decision when leaseExpiresAtIso is supplied. */
  leaseGate: CmsEnvironmentMutateWithLeaseDecision | null;
};

export type StagingCmsSimulator = {
  readonly mode: "SIMULATOR" | "LIVE_UNAVAILABLE";
  getPage(pageId: string): StagingCmsPageRecord | undefined;
  listPages(): StagingCmsPageRecord[];
  seedPage(page: StagingCmsPageRecord): StagingCmsPageRecord;
  applyChange(input: {
    changeId: string;
    missionId: string;
    pageId: string;
    desiredFields: StagingPageFields;
    nowIso: string;
    /** CMS bound environment observed on the connection/site. */
    boundEnvironment: CmsEnvironmentValue | string;
    /** Environment the operator intended for this mutate. */
    intendedEnvironment: CmsEnvironmentValue | string;
    /** Mutate kind for the environment gate (default publish). */
    operation?: "publish" | "repair";
    /**
     * Optional credential lease expiry (ISO). When set, mutate-time lease
     * recheck runs (T-X007 lease-expire race) — expired → providerMutateCount=0.
     */
    leaseExpiresAtIso?: string | null;
    /** Simulate lost ack / unknown remote outcome. */
    forceUnknownRemote?: boolean;
  }): StagingCmsApplyResult;
  /**
   * Independent read — must not reuse desired fields from the caller.
   * Returns fields currently stored in the simulator ledger.
   */
  independentRead(input: {
    change: StagingChangeRecord;
    nowIso: string;
  }): {
    observedFields: StagingPageFields | null;
    observedDigest: string | null;
    matched: boolean;
    details: string[];
    change: StagingChangeRecord;
    note: string;
  };
  recoverUnknown(input: {
    change: StagingChangeRecord;
    nowIso: string;
  }): {
    change: StagingChangeRecord;
    page: StagingCmsPageRecord | null;
    note: string;
  };
};

function nextRevision(): string {
  return `rev_${randomBytes(4).toString("hex")}`;
}

export function createStagingCmsSimulator(
  initialPages: StagingCmsPageRecord[] = [],
): StagingCmsSimulator {
  const pages = new Map<string, StagingCmsPageRecord>(
    initialPages.map((p) => [p.pageId, p]),
  );
  const changes = new Map<string, StagingChangeRecord>();

  return {
    mode: "SIMULATOR",
    getPage(pageId) {
      return pages.get(pageId);
    },
    listPages() {
      return [...pages.values()];
    },
    seedPage(page) {
      pages.set(page.pageId, page);
      return page;
    },
    applyChange(input) {
      const operation = input.operation ?? "publish";
      let environmentGate = validateCmsEnvironmentOperation({
        boundEnvironment: input.boundEnvironment,
        intendedEnvironment: input.intendedEnvironment,
        operation,
      });
      let leaseGate: CmsEnvironmentMutateWithLeaseDecision | null = null;

      if (input.leaseExpiresAtIso !== undefined) {
        leaseGate = evaluateCmsEnvironmentMutateWithLease({
          boundEnvironment: input.boundEnvironment,
          intendedEnvironment: input.intendedEnvironment,
          operation,
          leaseExpiresAtIso: input.leaseExpiresAtIso,
          nowIso: input.nowIso,
        });
        if (!leaseGate.allowed) {
          if (leaseGate.environmentGate) {
            environmentGate = leaseGate.environmentGate;
          }
          const change: StagingChangeRecord = {
            changeId: input.changeId,
            missionId: input.missionId,
            pageId: input.pageId,
            desiredFields: input.desiredFields,
            desiredDigest: digestFields(input.desiredFields),
            status: StagingChangeStatus.MISMATCH,
            appliedRevision: null,
            observedDigest: null,
            recoveryNote: leaseGate.reasons.join("; "),
            createdAtIso: input.nowIso,
            updatedAtIso: input.nowIso,
          };
          changes.set(change.changeId, change);
          return {
            change,
            page: pages.get(input.pageId) ?? null,
            note: `CMS env+lease gate refused mutate (${leaseGate.code}) — no production op; providerMutateCount=0`,
            providerMutateCount: 0,
            environmentGate,
            leaseGate,
          };
        }
        if (leaseGate.environmentGate) {
          environmentGate = leaseGate.environmentGate;
        }
      } else if (!environmentGate.ok) {
        const change: StagingChangeRecord = {
          changeId: input.changeId,
          missionId: input.missionId,
          pageId: input.pageId,
          desiredFields: input.desiredFields,
          desiredDigest: digestFields(input.desiredFields),
          status: StagingChangeStatus.MISMATCH,
          appliedRevision: null,
          observedDigest: null,
          recoveryNote: environmentGate.reasons.join("; "),
          createdAtIso: input.nowIso,
          updatedAtIso: input.nowIso,
        };
        changes.set(change.changeId, change);
        return {
          change,
          page: pages.get(input.pageId) ?? null,
          note: `CMS environment gate refused mutate (${environmentGate.code}) — no production op; providerMutateCount=0`,
          providerMutateCount: 0,
          environmentGate,
          leaseGate: null,
        };
      }

      const existing = pages.get(input.pageId);
      if (!existing) {
        const change: StagingChangeRecord = {
          changeId: input.changeId,
          missionId: input.missionId,
          pageId: input.pageId,
          desiredFields: input.desiredFields,
          desiredDigest: digestFields(input.desiredFields),
          status: StagingChangeStatus.MISMATCH,
          appliedRevision: null,
          observedDigest: null,
          recoveryNote: "Page not found in staging CMS simulator",
          createdAtIso: input.nowIso,
          updatedAtIso: input.nowIso,
        };
        changes.set(change.changeId, change);
        return {
          change,
          page: null,
          note: "Staging apply failed — page missing in simulator.",
          providerMutateCount: 0,
          environmentGate,
          leaseGate,
        };
      }

      if (input.forceUnknownRemote) {
        const change: StagingChangeRecord = {
          changeId: input.changeId,
          missionId: input.missionId,
          pageId: input.pageId,
          desiredFields: input.desiredFields,
          desiredDigest: digestFields(input.desiredFields),
          status: StagingChangeStatus.UNKNOWN_REMOTE_OUTCOME,
          appliedRevision: null,
          observedDigest: null,
          recoveryNote:
            "Provider acknowledgement lost — recovery required before verify",
          createdAtIso: input.nowIso,
          updatedAtIso: input.nowIso,
        };
        changes.set(change.changeId, change);
        return {
          change,
          page: existing,
          note:
            "UNKNOWN_REMOTE_OUTCOME — do not treat as verified. Use recovery path.",
          providerMutateCount: 0,
          environmentGate,
          leaseGate,
        };
      }

      const revision = nextRevision();
      const updated: StagingCmsPageRecord = {
        ...existing,
        fields: { ...input.desiredFields },
        revision,
        contentDigest: digestFields(input.desiredFields),
        updatedAtIso: input.nowIso,
      };
      pages.set(updated.pageId, updated);

      const change: StagingChangeRecord = {
        changeId: input.changeId,
        missionId: input.missionId,
        pageId: input.pageId,
        desiredFields: input.desiredFields,
        desiredDigest: digestFields(input.desiredFields),
        status: StagingChangeStatus.APPLIED_PENDING,
        appliedRevision: revision,
        observedDigest: null,
        recoveryNote: null,
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
      };
      changes.set(change.changeId, change);
      return {
        change,
        page: updated,
        note:
          "Staging CMS simulator accepted apply (ACCEPTED_PENDING). Independent read-back required — acceptance ≠ verified.",
        providerMutateCount: 1,
        environmentGate,
        leaseGate,
      };
    },
    independentRead(input) {
      const page = pages.get(input.change.pageId);
      if (!page) {
        const failed: StagingChangeRecord = {
          ...input.change,
          status: StagingChangeStatus.MISMATCH,
          observedDigest: null,
          updatedAtIso: input.nowIso,
          recoveryNote: "Independent read: page missing",
        };
        changes.set(failed.changeId, failed);
        return {
          observedFields: null,
          observedDigest: null,
          matched: false,
          details: ["Page missing during independent read"],
          change: failed,
          note: "Independent read failed — page not found.",
        };
      }

      // Read from simulator ledger — never copy desiredFields from the change.
      const observedFields: StagingPageFields = { ...page.fields };
      const observedDigest = page.contentDigest;
      const comparison = fieldsMatch(input.change.desiredFields, observedFields);
      const next: StagingChangeRecord = {
        ...input.change,
        observedDigest,
        status: comparison.matched
          ? StagingChangeStatus.VERIFIED
          : StagingChangeStatus.MISMATCH,
        updatedAtIso: input.nowIso,
        recoveryNote: comparison.matched ? null : comparison.details.join("; "),
      };
      changes.set(next.changeId, next);
      return {
        observedFields,
        observedDigest,
        matched: comparison.matched,
        details: comparison.details,
        change: next,
        note: comparison.matched
          ? "Independent read-back matched. Change VERIFIED."
          : "Independent read-back mismatch — not verified.",
      };
    },
    recoverUnknown(input) {
      if (input.change.status !== StagingChangeStatus.UNKNOWN_REMOTE_OUTCOME) {
        return {
          change: input.change,
          page: pages.get(input.change.pageId) ?? null,
          note: "Recovery only applies to UNKNOWN_REMOTE_OUTCOME changes.",
        };
      }
      const existing = pages.get(input.change.pageId);
      if (!existing) {
        const failed: StagingChangeRecord = {
          ...input.change,
          status: StagingChangeStatus.MISMATCH,
          updatedAtIso: input.nowIso,
          recoveryNote: "Recovery failed — page missing",
        };
        changes.set(failed.changeId, failed);
        return {
          change: failed,
          page: null,
          note: "Recovery failed — page missing.",
        };
      }

      // Reconcile by applying desired fields once, then mark RECOVERED pending verify.
      const revision = nextRevision();
      const updated: StagingCmsPageRecord = {
        ...existing,
        fields: { ...input.change.desiredFields },
        revision,
        contentDigest: digestFields(input.change.desiredFields),
        updatedAtIso: input.nowIso,
      };
      pages.set(updated.pageId, updated);
      const recovered: StagingChangeRecord = {
        ...input.change,
        status: StagingChangeStatus.RECOVERED,
        appliedRevision: revision,
        updatedAtIso: input.nowIso,
        recoveryNote:
          "Recovered unknown remote outcome via simulator reconcile — verify with independent read",
      };
      changes.set(recovered.changeId, recovered);
      return {
        change: recovered,
        page: updated,
        note:
          "Recovered. Status RECOVERED — still requires independent read-back before VERIFIED.",
      };
    },
  };
}

export function stagingCmsLiveAvailable(): boolean {
  return Boolean(
    process.env.WORKSOCIAL_CMS_STAGING_TOKEN ||
      process.env.WORKSOCIAL_CMS_STAGING_URL,
  );
}

export function createStagingCmsAdapter(): StagingCmsSimulator {
  // Live CMS path remains unavailable without owner credentials — always simulator for M4.
  return createStagingCmsSimulator();
}
