/**
 * Bounded repair service: tickets, fail-closed gates, independent review,
 * gateway-gated fixture apply, canary verify. Live CMS remains NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  IncidentStatus,
  LocalRole,
  OutcomeEvidenceSource,
  REPAIR_RELATED_CASE_IDS,
  RepairAttemptOutcome,
  RepairProposalStatus,
  RepairReleaseDecision,
  RepairTicketStatus,
  acquireRepairLease,
  applyFixtureRepairPatches,
  applyRepairReleaseVerification,
  createRepairProposal,
  createTestEvidence,
  evaluateFixtureCanary,
  evaluateRepairReleaseGate,
  injectFixtureDefect,
  listRepairOutcomesForLearning,
  recordRepairAttempt,
  type CapabilityGrant,
  type FixtureAssetSnapshot,
  type IncidentRecord,
  type OperatingModeValue,
  type ProductionMappingState,
  type RepairAttempt,
  type RepairProposal,
  type RepairTicket,
  type StandingPolicy,
  type TestEvidence,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { ReviewVerdict } from "@worksocial/domain";
import type { RepairStore } from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
  type GatewayDecisionRecord,
} from "@worksocial/action-gateway";
import {
  REPAIR_BASELINE_ASSERTIONS,
  REPAIR_DEFECT_CTA,
  REPAIR_HEALTHY_CTA,
  REPAIR_INCIDENT_ID,
  REPAIR_PILOT_ASSET_ID,
  REPAIR_PILOT_WRITE_PATH_ID,
  REPAIR_PROBE_ID,
  REPAIR_PROPOSAL_ID,
  REPAIR_TICKET_ID,
  buildGoldenRepairBundle,
  createFixtureRepairPilotMapping,
  invokeRepairAdapter,
  proveFixtureRepairWritePath,
} from "./fixtures.js";

export type RepairServiceOptions = {
  gateway?: ActionGateway;
};

export type RepairAuthorityInput = {
  outboundStopped: boolean;
  operatingMode: OperatingModeValue;
  policies: StandingPolicy[];
  grants: CapabilityGrant[];
  /** Authenticated role; defaults to administrator for admin-gated callers. */
  actorRole?: string;
};

export type RepairService = {
  status(): ReturnType<RepairStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    learningHookNote: string;
  };
  listIncidents(limit?: number): IncidentRecord[];
  listTickets(limit?: number): RepairTicket[];
  listProposals(limit?: number): RepairProposal[];
  listAttempts(ticketId?: string, limit?: number): RepairAttempt[];
  listTestEvidence(limit?: number): TestEvidence[];
  getFixtureAsset(assetId?: string): FixtureAssetSnapshot | null;
  seedFixtures(nowIso?: string): {
    incident: IncidentRecord;
    ticket: RepairTicket;
    proposal: RepairProposal;
    asset: FixtureAssetSnapshot;
  };
  seedAndProveRepairMapping(nowIso?: string): {
    mapping: ProductionMappingState;
    writePathId: string;
  };
  injectDefect(input?: { nowIso?: string }): {
    ok: true;
    asset: FixtureAssetSnapshot;
    canaryPassed: false;
  } | { ok: false; code: string; reasons: string[] };
  submitForReview(input: {
    proposalId: string;
    nowIso?: string;
  }):
    | { ok: true; proposal: RepairProposal; reasons: string[] }
    | { ok: false; code: string; reasons: string[]; proposal: RepairProposal | null };
  recordIndependentReview(input: {
    proposalId: string;
    reviewerRoleId?: "A25";
    approved: boolean;
    reason: string;
    nowIso?: string;
  }):
    | { ok: true; proposal: RepairProposal; verdict: ReviewVerdict }
    | { ok: false; code: string; reasons: string[] };
  releaseRepair(input: {
    proposalId: string;
    authority: RepairAuthorityInput;
    productionMapping: ProductionMappingState;
    preferLive?: boolean;
    targetAccountId?: string;
    contentRevision?: string;
    nowIso?: string;
  }): {
    proposal: RepairProposal | null;
    gatewayDecision: GatewayDecisionRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    liveCmsRepairWiring: "NOT_WIRED" | "FIXTURE";
    acceptanceEqualsVerified: boolean;
    details: string[];
  };
  verifyRepair(input: {
    proposalId: string;
    nowIso?: string;
  }): {
    proposal: RepairProposal | null;
    evidence: TestEvidence | null;
    outcome: WritePathOutcomeEvidence | null;
    canaryPassed: boolean;
    liveCmsRepairWiring: "NOT_WIRED";
    details: string[];
  };
  listLearningOutcomes(includeFixture?: boolean): WritePathOutcomeEvidence[];
};

export function createRepairService(
  store: RepairStore,
  options: RepairServiceOptions = {},
): RepairService {
  const gateway = options.gateway ?? createActionGateway();

  return {
    status() {
      const status = store.status();
      return {
        ...status,
        acceptanceCaseIds: REPAIR_RELATED_CASE_IDS,
        learningHookNote:
          "Verified bounded-repair SUCCESS/FAILURE outcomes feed learning-worker; fixtures excluded by default; learning cannot expand grants.",
      };
    },

    listIncidents(limit = 100) {
      return store.listIncidents(limit);
    },
    listTickets(limit = 100) {
      return store.listTickets(limit);
    },
    listProposals(limit = 100) {
      return store.listProposals(limit);
    },
    listAttempts(ticketId, limit = 200) {
      return store.listAttempts(ticketId, limit);
    },
    listTestEvidence(limit = 100) {
      const rows = store.read().testEvidence;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    getFixtureAsset(assetId = REPAIR_PILOT_ASSET_ID) {
      return (
        store.read().fixtureAssets.find((a) => a.assetId === assetId) ?? null
      );
    },

    seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const bundle = buildGoldenRepairBundle(ts);
      store.upsertIncident(bundle.incident);
      const leased = acquireRepairLease({
        ticket: bundle.ticket,
        owner: "A24",
        nowIso: ts,
      });
      store.upsertTicket(leased);
      store.upsertProposal(bundle.proposal);
      store.upsertFixtureAsset(bundle.asset);
      return {
        incident: bundle.incident,
        ticket: leased,
        proposal: bundle.proposal,
        asset: bundle.asset,
      };
    },

    seedAndProveRepairMapping(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const { state, writePathId } = createFixtureRepairPilotMapping(ts);
      const proven = proveFixtureRepairWritePath(state, ts);
      return { mapping: proven, writePathId };
    },

    injectDefect(input) {
      const nowIso = input?.nowIso ?? new Date().toISOString();
      const asset =
        store
          .read()
          .fixtureAssets.find((a) => a.assetId === REPAIR_PILOT_ASSET_ID) ??
        null;
      if (!asset) {
        return {
          ok: false,
          code: "ASSET_MISSING",
          reasons: ["Seed fixtures before injecting a defect"],
        };
      }
      const defective = injectFixtureDefect({
        asset,
        defectValue: REPAIR_DEFECT_CTA,
        nowIso,
      });
      store.upsertFixtureAsset(defective);
      const incident = store
        .read()
        .incidents.find((i) => i.incidentId === REPAIR_INCIDENT_ID);
      if (incident) {
        store.upsertIncident({
          ...incident,
          status: IncidentStatus.REPAIRING,
          updatedAtIso: nowIso,
        });
      }
      return { ok: true, asset: defective, canaryPassed: false as const };
    },

    submitForReview(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;
      const ticket = proposal
        ? state.tickets.find((t) => t.ticketId === proposal.ticketId) ?? null
        : null;
      if (!proposal || !ticket) {
        return {
          ok: false,
          code: "NOT_FOUND",
          reasons: ["Unknown proposal or ticket"],
          proposal,
        };
      }

      const gate = evaluateRepairReleaseGate({
        proposal,
        ticket,
        startingNewAttempt: false,
      });
      if (!gate.allowed) {
        const blocked: RepairProposal = {
          ...proposal,
          status: RepairProposalStatus.BLOCKED,
          blockReasons: gate.reasons,
          updatedAtIso: nowIso,
        };
        store.upsertProposal(blocked);
        return {
          ok: false,
          code: gate.code,
          reasons: gate.reasons,
          proposal: blocked,
        };
      }

      const ready: RepairProposal = {
        ...proposal,
        status: RepairProposalStatus.READY_FOR_REVIEW,
        blockReasons: [],
        updatedAtIso: nowIso,
      };
      store.upsertProposal(ready);
      store.upsertTicket({
        ...ticket,
        status: RepairTicketStatus.IN_REVIEW,
        updatedAtIso: nowIso,
      });
      return { ok: true, proposal: ready, reasons: gate.reasons };
    },

    recordIndependentReview(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;
      if (!proposal) {
        return {
          ok: false,
          code: "NOT_FOUND",
          reasons: [`Unknown proposal ${input.proposalId}`],
        };
      }
      if (proposal.authorRoleId === (input.reviewerRoleId ?? "A25")) {
        return {
          ok: false,
          code: "SELF_APPROVAL_FORBIDDEN",
          reasons: ["Author cannot issue independent review"],
        };
      }

      const gate = evaluateRepairReleaseGate({
        proposal,
        ticket:
          state.tickets.find((t) => t.ticketId === proposal.ticketId) ??
          ({
            ticketId: proposal.ticketId,
            incidentId: proposal.incidentId,
            assetId: proposal.assetId,
            siteId: "worksocial-pilot",
            repairClass: proposal.repairClass,
            status: RepairTicketStatus.IN_REVIEW,
            attemptCount: 0,
            maxAttempts: 2,
            worktreeRef: "worktrees/unknown",
            sourceRevision: "unknown",
            leaseOwner: null,
            leaseExpiresAtIso: null,
            fixtureOnly: proposal.fixtureOnly,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          } satisfies RepairTicket),
        reviewerRoleId: input.reviewerRoleId ?? "A25",
      });

      // Review recording still blocked if weaken/protected gates fail.
      const integrityOnly = evaluateRepairReleaseGate({
        proposal: {
          ...proposal,
          selfApprovalAttempted: false,
        },
        ticket:
          state.tickets.find((t) => t.ticketId === proposal.ticketId)!,
        reviewerRoleId: input.reviewerRoleId ?? "A25",
        existingVerdict: {
          verdictId: "precheck",
          proposalId: proposal.proposalId,
          reviewerRoleId: input.reviewerRoleId ?? "A25",
          authorRoleId: proposal.authorRoleId,
          approved: true,
          reason: "precheck",
          decidedAtIso: nowIso,
        },
      });
      if (!integrityOnly.allowed && integrityOnly.code !== "REVIEW_MISMATCH") {
        // Allow REVIEW_* codes through; block integrity/scope/protected.
        if (
          integrityOnly.code === "TEST_INTEGRITY_VIOLATION" ||
          integrityOnly.code === "PROTECTED_PATH" ||
          integrityOnly.code === "SCOPE_EXCEEDED" ||
          integrityOnly.code === "ATTEMPT_LIMIT"
        ) {
          return {
            ok: false,
            code: integrityOnly.code,
            reasons: integrityOnly.reasons,
          };
        }
      }
      void gate;

      const verdict: ReviewVerdict = {
        verdictId: `rv-${randomUUID()}`,
        proposalId: proposal.proposalId,
        reviewerRoleId: input.reviewerRoleId ?? "A25",
        authorRoleId: proposal.authorRoleId,
        approved: input.approved,
        reason: input.reason,
        decidedAtIso: nowIso,
      };
      store.addReviewVerdict(verdict);

      const next: RepairProposal = {
        ...proposal,
        status: input.approved
          ? RepairProposalStatus.APPROVED
          : RepairProposalStatus.REJECTED,
        reviewVerdictId: verdict.verdictId,
        updatedAtIso: nowIso,
      };
      store.upsertProposal(next);
      const ticket = state.tickets.find((t) => t.ticketId === proposal.ticketId);
      if (ticket) {
        store.upsertTicket({
          ...ticket,
          status: input.approved
            ? RepairTicketStatus.APPROVED
            : RepairTicketStatus.FAILED,
          updatedAtIso: nowIso,
        });
      }
      return { ok: true, proposal: next, verdict };
    },

    releaseRepair(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;
      const ticket = proposal
        ? state.tickets.find((t) => t.ticketId === proposal.ticketId) ?? null
        : null;

      if (!proposal || !ticket) {
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details: ["Unknown proposal or ticket"],
        };
      }

      details.push(
        "Live CMS repair adapter is NOT_WIRED — fixture apply path only",
      );

      if (input.preferLive) {
        const live = invokeRepairAdapter({
          preferLive: true,
          proposalId: proposal.proposalId,
          assetId: proposal.assetId,
          afterValue: REPAIR_HEALTHY_CTA,
        });
        details.push(live.summary);
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      if (proposal.status !== RepairProposalStatus.APPROVED) {
        details.push(
          `Proposal status is ${proposal.status}; release requires APPROVED`,
        );
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const verdict =
        state.reviewVerdicts.find(
          (v) => v.verdictId === proposal.reviewVerdictId,
        ) ?? null;

      const gate = evaluateRepairReleaseGate({
        proposal,
        ticket,
        existingVerdict: verdict,
        startingNewAttempt: true,
      });
      if (!gate.allowed) {
        details.push(...gate.reasons);
        const { attempt, ticket: nextTicket } = recordRepairAttempt({
          attemptId: `att-${randomUUID()}`,
          ticket,
          proposalId: proposal.proposalId,
          outcome: RepairAttemptOutcome.GATE_DENIED,
          notes: gate.reasons.join("; "),
          createdAtIso: nowIso,
        });
        store.addAttempt(attempt);
        store.upsertTicket(nextTicket);
        const blocked: RepairProposal = {
          ...proposal,
          status: RepairProposalStatus.BLOCKED,
          blockReasons: gate.reasons,
          updatedAtIso: nowIso,
        };
        store.upsertProposal(blocked);
        return {
          proposal: blocked,
          gatewayDecision: null,
          outcome: null,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const asset =
        state.fixtureAssets.find((a) => a.assetId === proposal.assetId) ?? null;
      if (!asset) {
        details.push("Fixture asset missing — seed and inject defect first");
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const operationId = `repair-release-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        actorRole: input.authority.actorRole ?? LocalRole.ADMINISTRATOR,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: input.productionMapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.BOUNDED_REPAIR,
          channelId: "owned-site",
          targetAccountId: input.targetAccountId ?? "acct-demo",
          operation: "apply_bounded_repair",
          assetId: proposal.assetId || REPAIR_PILOT_ASSET_ID,
          contentRevision: input.contentRevision ?? "rev-repair-demo",
          writePathId: REPAIR_PILOT_WRITE_PATH_ID,
          payload: {
            proposalId: proposal.proposalId,
            patches: proposal.patches,
            fixtureOnly: proposal.fixtureOnly,
            liveCms: false,
          },
        },
        snapshot,
      );

      details.push(submitted.decision.reason);
      details.push(
        `Gateway outcome=${submitted.decision.outcome} (acceptance ≠ verified)`,
      );

      if (!submitted.decision.allowed) {
        const { attempt, ticket: nextTicket } = recordRepairAttempt({
          attemptId: `att-${randomUUID()}`,
          ticket,
          proposalId: proposal.proposalId,
          outcome: RepairAttemptOutcome.GATE_DENIED,
          notes: submitted.decision.reason,
          createdAtIso: nowIso,
        });
        store.addAttempt(attempt);
        store.upsertTicket(nextTicket);

        const applied = applyRepairReleaseVerification(store.read(), {
          proposalId: proposal.proposalId,
          decision: RepairReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: proposal.fixtureOnly,
          summary: `Gateway denied bounded repair: ${submitted.decision.code ?? submitted.decision.reason}`,
          outcomeId: `out-${randomUUID()}`,
          operationId,
          writePathId: REPAIR_PILOT_WRITE_PATH_ID,
          nowIso,
        });
        const failed: RepairProposal = {
          ...(applied.proposal ?? proposal),
          status: RepairProposalStatus.FAILED,
          gatewayOperationId: operationId,
          writePathId: REPAIR_PILOT_WRITE_PATH_ID,
          updatedAtIso: nowIso,
        };
        store.upsertProposal(failed);
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.ticket) store.upsertTicket(applied.ticket);

        return {
          proposal: failed,
          gatewayDecision: submitted.decision,
          outcome: applied.outcome,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const adapter = invokeRepairAdapter({
        preferLive: false,
        proposalId: proposal.proposalId,
        assetId: proposal.assetId,
        afterValue: REPAIR_HEALTHY_CTA,
      });
      details.push(adapter.summary);

      const appliedPatches = applyFixtureRepairPatches({
        asset,
        patches: proposal.patches,
        nowIso,
      });
      if (!appliedPatches.ok) {
        details.push(...appliedPatches.reasons);
        gateway.markFailed(operationId, nowIso, appliedPatches.reasons.join("; "));
        const { attempt, ticket: nextTicket } = recordRepairAttempt({
          attemptId: `att-${randomUUID()}`,
          ticket,
          proposalId: proposal.proposalId,
          outcome: RepairAttemptOutcome.TESTS_FAILED,
          notes: appliedPatches.reasons.join("; "),
          createdAtIso: nowIso,
        });
        store.addAttempt(attempt);
        store.upsertTicket(nextTicket);
        const failed: RepairProposal = {
          ...proposal,
          status: RepairProposalStatus.FAILED,
          gatewayOperationId: operationId,
          writePathId: REPAIR_PILOT_WRITE_PATH_ID,
          blockReasons: appliedPatches.reasons,
          updatedAtIso: nowIso,
        };
        store.upsertProposal(failed);
        return {
          proposal: failed,
          gatewayDecision: submitted.decision,
          outcome: null,
          liveCmsRepairWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      store.upsertFixtureAsset(appliedPatches.asset);

      const pending: RepairProposal = {
        ...proposal,
        status: RepairProposalStatus.RELEASED_PENDING,
        gatewayOperationId: operationId,
        writePathId: REPAIR_PILOT_WRITE_PATH_ID,
        updatedAtIso: nowIso,
      };
      store.upsertProposal(pending);

      const { attempt, ticket: nextTicket } = recordRepairAttempt({
        attemptId: `att-${randomUUID()}`,
        ticket,
        proposalId: proposal.proposalId,
        outcome: RepairAttemptOutcome.RELEASED,
        notes: "Fixture apply accepted pending canary verification",
        createdAtIso: nowIso,
      });
      store.addAttempt(attempt);
      store.upsertTicket({
        ...nextTicket,
        status: RepairTicketStatus.RELEASED_PENDING,
        updatedAtIso: nowIso,
      });

      details.push(
        "ACCEPTED_PENDING — call verifyRepair with fixture canary read-back",
      );

      return {
        proposal: pending,
        gatewayDecision: submitted.decision,
        outcome: null,
        liveCmsRepairWiring: "FIXTURE",
        acceptanceEqualsVerified: false,
        details,
      };
    },

    verifyRepair(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;

      if (!proposal) {
        return {
          proposal: null,
          evidence: null,
          outcome: null,
          canaryPassed: false,
          liveCmsRepairWiring: "NOT_WIRED",
          details: [`Unknown proposal ${input.proposalId}`],
        };
      }

      if (
        proposal.status !== RepairProposalStatus.RELEASED_PENDING &&
        proposal.status !== RepairProposalStatus.VERIFIED
      ) {
        details.push(
          `Proposal status ${proposal.status} is not released_pending`,
        );
        return {
          proposal,
          evidence: null,
          outcome: null,
          canaryPassed: false,
          liveCmsRepairWiring: "NOT_WIRED",
          details,
        };
      }

      const asset =
        state.fixtureAssets.find((a) => a.assetId === proposal.assetId) ?? null;
      if (!asset) {
        details.push("Fixture asset missing for canary");
        return {
          proposal,
          evidence: null,
          outcome: null,
          canaryPassed: false,
          liveCmsRepairWiring: "NOT_WIRED",
          details,
        };
      }

      const canary = evaluateFixtureCanary(asset);
      details.push(canary.summary);

      const evidence = createTestEvidence({
        evidenceId: `ev-${randomUUID()}`,
        proposalId: proposal.proposalId,
        probeId: proposal.regressionProbeId || REPAIR_PROBE_ID,
        passed: canary.passed,
        assertionFingerprints: [...REPAIR_BASELINE_ASSERTIONS],
        summary: canary.summary,
        fixtureOnly: proposal.fixtureOnly,
        recordedAtIso: nowIso,
      });
      store.addTestEvidence(evidence);

      const operationId =
        proposal.gatewayOperationId ?? `repair-verify-${randomUUID()}`;

      if (proposal.gatewayOperationId) {
        const existing = gateway.getDecision(proposal.gatewayOperationId);
        if (!existing) {
          gateway.rehydratePending({
            operationId: proposal.gatewayOperationId,
            writePathId: REPAIR_PILOT_WRITE_PATH_ID,
            decidedAtIso: proposal.updatedAtIso,
            reason: "Rehydrated for canary verification",
          });
        }
      }

      if (canary.passed) {
        if (proposal.gatewayOperationId) {
          gateway.markVerified(proposal.gatewayOperationId, nowIso);
        }
        const applied = applyRepairReleaseVerification(store.read(), {
          proposalId: proposal.proposalId,
          decision: RepairReleaseDecision.SUCCESS,
          source: OutcomeEvidenceSource.READ_BACK,
          fixtureOnly: proposal.fixtureOnly,
          summary: canary.summary,
          outcomeId: `out-${randomUUID()}`,
          operationId,
          writePathId: proposal.writePathId ?? REPAIR_PILOT_WRITE_PATH_ID,
          nowIso,
        });
        if (applied.proposal) store.upsertProposal(applied.proposal);
        if (applied.ticket) store.upsertTicket(applied.ticket);
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        // Sync incident from applied state
        for (const inc of applied.state.incidents) {
          store.upsertIncident(inc);
        }
        details.push("Canary verified — original failing journey recovered");
        return {
          proposal: applied.proposal,
          evidence,
          outcome: applied.outcome,
          canaryPassed: true,
          liveCmsRepairWiring: "NOT_WIRED",
          details,
        };
      }

      if (proposal.gatewayOperationId) {
        gateway.markFailed(
          proposal.gatewayOperationId,
          nowIso,
          canary.summary,
        );
      }
      const applied = applyRepairReleaseVerification(store.read(), {
        proposalId: proposal.proposalId,
        decision: RepairReleaseDecision.FAILURE,
        source: OutcomeEvidenceSource.READ_BACK,
        fixtureOnly: proposal.fixtureOnly,
        summary: canary.summary,
        outcomeId: `out-${randomUUID()}`,
        operationId,
        writePathId: proposal.writePathId ?? REPAIR_PILOT_WRITE_PATH_ID,
        nowIso,
      });
      if (applied.proposal) store.upsertProposal(applied.proposal);
      if (applied.ticket) store.upsertTicket(applied.ticket);
      if (applied.outcome) store.addReleaseOutcome(applied.outcome);
      details.push("Canary still failing — repair not verified");
      return {
        proposal: applied.proposal,
        evidence,
        outcome: applied.outcome,
        canaryPassed: false,
        liveCmsRepairWiring: "NOT_WIRED",
        details,
      };
    },

    listLearningOutcomes(includeFixture = false) {
      return listRepairOutcomesForLearning(store.read(), { includeFixture });
    },
  };
}

/** Re-export helpers used by API ensure-mapping. */
export {
  createRepairProposal,
  REPAIR_INCIDENT_ID,
  REPAIR_TICKET_ID,
  REPAIR_PROPOSAL_ID,
  REPAIR_PILOT_ASSET_ID,
  REPAIR_PILOT_WRITE_PATH_ID,
};
