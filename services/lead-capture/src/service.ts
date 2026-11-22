/**
 * M5 / NEXT-16 lead capture orchestrator.
 * Browser/form → fixture CRM → verify → cleanup;
 * delivery failure → incident → bounded repair → re-verify.
 * Integrates M1 action gateway + M2 durable accept/verify (LOCAL_DURABLE).
 * External effects: NONE. Live Zoho NOT_WIRED. Temporal NOT_WIRED.
 */

import { randomBytes } from "node:crypto";
import {
  ActionClass,
  CleanupStatus,
  IncidentSeverity,
  IncidentStatus,
  LeadCaptureJourneyStatus,
  LeadCaptureStage,
  LocalRole,
  MAX_REPAIR_ATTEMPTS,
  ProbeVerdict,
  RepairClass,
  RepairPatchOp,
  RepairProposalStatus,
  WeakenTestOperation,
  assertSyntheticExcludedFromCommercial,
  createIncident,
  createRepairProposal,
  createRepairTicket,
  createSyntheticLead,
  digestTestBaseline,
  evaluateProtectedPathGate,
  evaluateTestIntegrityGate,
  isCrmDeliveryFailure,
  linkRepairToJourney,
  markJourneyFailure,
  markJourneySuccess,
  markStageComplete,
  projectCommerceTotals,
  summarizeLeadCaptureStatus,
  type CapabilityGrant,
  type LeadCaptureJourney,
  type OperatingModeValue,
  type ProductionMappingState,
  type StandingPolicy,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createMemoryDurableStores,
  newJobId,
  type DurableExecutionService,
  type LeadCaptureStore,
  type RepairStore,
} from "@worksocial/persistence";
import {
  createZohoCrmFixtureAdapter,
  type ZohoCrmFixtureAdapter,
} from "@worksocial/provider-adapters";
import {
  createActionGateway,
  digestPayload,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
} from "@worksocial/action-gateway";
import { runBrowserFormSubmit } from "./browser-harness.js";

function id(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

const DELIVERY_BASELINE = digestTestBaseline("probe-form-crm-canary", [
  "crm_receipt_present",
  "fields_match",
  "synthetic_excluded",
]);

export type LeadCaptureAuthority = {
  outboundStopped: boolean;
  operatingMode: OperatingModeValue;
  policies: StandingPolicy[];
  grants: CapabilityGrant[];
  productionMapping: ProductionMappingState;
  actorRole?: string;
};

export type LeadCaptureServiceOptions = {
  gateway?: ActionGateway;
  crm?: ZohoCrmFixtureAdapter;
  durable?: DurableExecutionService;
  /** Persist incidents/tickets/proposals into the repair ledger. */
  repairStore?: RepairStore;
};

export type LeadCaptureService = {
  status(): ReturnType<typeof summarizeLeadCaptureStatus> & {
    store: ReturnType<LeadCaptureStore["status"]>;
    honestNote: string;
  };
  listJourneys(limit?: number): LeadCaptureJourney[];
  getJourney(journeyId: string): LeadCaptureJourney | null;
  runJourney(input: {
    authority: LeadCaptureAuthority;
    nowIso?: string;
    writePathId?: string;
    failDelivery?: boolean;
    preferLiveBrowser?: boolean;
    skipCleanup?: boolean;
    targetAccountId?: string;
  }): Promise<{
    journey: LeadCaptureJourney;
    details: string[];
  }>;
  cleanup(input: {
    correlationId: string;
    nowIso?: string;
  }): {
    ok: boolean;
    journey: LeadCaptureJourney | null;
    details: string[];
  };
  openIncidentFromFailure(input: {
    journeyId: string;
    nowIso?: string;
  }): {
    ok: boolean;
    code?: string;
    journey: LeadCaptureJourney | null;
    incidentId?: string;
    ticketId?: string;
    proposalId?: string;
    details: string[];
  };
  runBoundedRepairRecovery(input: {
    journeyId: string;
    authority: LeadCaptureAuthority;
    nowIso?: string;
    attemptWeakenTest?: boolean;
    targetAccountId?: string;
  }): Promise<{
    ok: boolean;
    weakenTestBlocked: boolean;
    journey: LeadCaptureJourney | null;
    details: string[];
  }>;
};

export function createLeadCaptureService(
  store: LeadCaptureStore,
  options: LeadCaptureServiceOptions = {},
): LeadCaptureService {
  const gateway = options.gateway ?? createActionGateway();
  const crm = options.crm ?? createZohoCrmFixtureAdapter();
  const durable =
    options.durable ?? createDurableExecutionService(createMemoryDurableStores());
  const repairStore = options.repairStore;

  return {
    status() {
      const summary = summarizeLeadCaptureStatus(store.read());
      const storeStatus = store.status();
      return {
        ...summary,
        store: storeStatus,
        honestNote:
          "M5 fixture lead-capture: browser→CRM→verify→cleanup; incident→repair→verify. Live Zoho NOT_WIRED. Temporal NOT_WIRED. Not R1-complete.",
      };
    },

    listJourneys(limit = 50) {
      return store
        .read()
        .journeys.slice()
        .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso))
        .slice(0, limit);
    },

    getJourney(journeyId) {
      return store.read().journeys.find((j) => j.journeyId === journeyId) ?? null;
    },

    async runJourney(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const correlationId = id("corr");
      let journey = createLeadCaptureJourneyLocal({
        journeyId: id("journey"),
        correlationId,
        createdAtIso: nowIso,
        playwrightMode: input.preferLiveBrowser ? "OPTIONAL_LIVE" : "FIXTURE",
      });

      const lead = createSyntheticLead({ correlationId });
      assertSyntheticExcludedFromCommercial(lead);

      const browser = await runBrowserFormSubmit({
        correlationId,
        fieldValues: lead.fieldValues,
        preferLive: input.preferLiveBrowser === true,
        // Host canary journey — server grant present (not public-flag abuse).
        serverCanaryGrantPresent: true,
      });
      details.push(...browser.details);
      journey = {
        ...journey,
        artifactRefs: browser.artifactRefs,
        playwrightMode: browser.mode,
      };
      if (!browser.ok) {
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.BROWSER,
          verdict: browser.mode === "NOT_WIRED" ? ProbeVerdict.NOT_WIRED : "FAILURE",
          details: browser.details,
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { journey, details };
      }
      journey = markStageComplete(journey, LeadCaptureStage.BROWSER, nowIso);

      const mapping = input.authority.productionMapping;
      const writePathId =
        input.writePathId ??
        mapping.writePaths.find((p) => p.operation === "submit_form_canary")
          ?.writePathId ??
        null;
      if (!writePathId) {
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.FORM_ACCEPT,
          verdict: "FAILURE",
          details: ["No form-to-CRM write path mapped"],
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        details.push("WRITE_PATH_MISSING");
        return { journey, details };
      }
      const path = mapping.writePaths.find((p) => p.writePathId === writePathId)!;
      const form = path.formId
        ? mapping.forms.find((f) => f.formId === path.formId)
        : undefined;
      const crmOwn = path.crmOwnershipId
        ? mapping.crmOwnership.find((c) => c.crmOwnershipId === path.crmOwnershipId)
        : undefined;

      const payload: Record<string, unknown> = {
        ...lead.fieldValues,
        synthetic: true,
        correlationId,
        commercialExcluded: true,
      };
      const payloadDigest = digestPayload(payload);
      const operationId = id("op");

      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        actorRole: input.authority.actorRole ?? LocalRole.ADMINISTRATOR,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: mapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
          channelId: path.channelId,
          targetAccountId: input.targetAccountId ?? "acct-fixture-canary",
          operation: path.operation,
          assetId: path.assetId,
          contentRevision: null,
          writePathId,
          payload,
        },
        snapshot,
      );
      journey = {
        ...journey,
        gatewayDecisionId: submitted.decision.decisionId,
      };
      if (!submitted.decision.allowed) {
        details.push(submitted.decision.reason);
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.FORM_ACCEPT,
          verdict: "FAILURE",
          details: [submitted.decision.reason],
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { journey, details };
      }
      journey = markStageComplete(journey, LeadCaptureStage.FORM_ACCEPT, nowIso);
      journey = {
        ...journey,
        submission: {
          operationId,
          writePathId,
          formId: path.formId ?? "unknown",
          correlationId,
          payloadDigest,
          synthetic: true,
          submittedAtIso: nowIso,
        },
      };

      const durableOpId = operationId;
      try {
        await durable.acceptPending({
          job: {
            jobId: newJobId(),
            roleId: "A21",
            workflowId: "wf-lead-capture-canary",
            siteId: "worksocial-pilot",
            assetId: path.assetId,
            trigger: "scheduled_form_canary",
            policyVersion: "1",
            inputArtifactIds: [
              browser.artifactRefs.screenshotId,
              browser.artifactRefs.traceId,
            ].filter(Boolean) as string[],
            capabilityGrantId: submitted.decision.grantId ?? "grant-fixture-canary",
            sourceRevision: "rev-m5-fixture",
            maxAttempts: 2,
            deadlineSeconds: 600,
            idempotencyKey: `canary:${correlationId}`,
            expectedOutcome: "verified_crm_receipt",
          },
          operationId: durableOpId,
          payloadDigest,
          businessIdempotencyKey: `biz-canary:${correlationId}`,
          nowIso,
          decision: {
            decisionId: submitted.decision.decisionId,
            operationId: durableOpId,
            payloadDigest,
            allowed: true,
            code: null,
            reason: submitted.decision.reason,
            grantId: submitted.decision.grantId,
            policyId: submitted.decision.policyId,
            decidedAtIso: submitted.decision.decidedAtIso,
            writePathId,
            gateDetails: [],
          },
        });
        journey = { ...journey, durableOperationId: durableOpId };
        details.push("Durable effect ACCEPTED_PENDING (LOCAL_DURABLE)");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        details.push(`Durable accept failed: ${msg}`);
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.FORM_ACCEPT,
          verdict: "FAILURE",
          details: [`Durable accept failed — aborting before CRM write: ${msg}`],
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { journey, details };
      }

      const receipt = crm.writeSyntheticLead({
        correlationId,
        moduleId: crmOwn?.moduleId ?? form?.crmModuleId ?? "Leads",
        fieldSnapshot: lead.fieldValues,
        nowIso,
        skipWrite: input.failDelivery === true,
      });
      if (!receipt) {
        details.push("CRM delivery failed — no fixture receipt");
        // Do NOT mark CRM_WRITE complete — delivery produced no receipt.
        journey = {
          ...journey,
          crmReceipt: null,
          fieldVerifyPassed: false,
        };
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.CRM_WRITE,
          verdict: ProbeVerdict.FAILURE,
          details: ["MISSING_REMOTE: fixture CRM write skipped/failed"],
          atIso: nowIso,
        });
        store.addCommerceLead({
          recordId: `pending-${correlationId}`,
          synthetic: true,
          revenueMinor: 0,
          countedInCommerce: false,
        });
        store.upsertJourney(journey);
        return { journey, details };
      }
      journey = {
        ...journey,
        crmReceipt: receipt,
      };
      journey = markStageComplete(journey, LeadCaptureStage.CRM_WRITE, nowIso);
      details.push(`Fixture CRM wrote synthetic record ${receipt.recordId}`);

      store.addCommerceLead({
        recordId: receipt.recordId ?? receipt.receiptId,
        synthetic: true,
        revenueMinor: 0,
        countedInCommerce: false,
      });

      const verified = crm.verifyFields({
        correlationId,
        expected: lead.fieldValues,
      });
      journey = {
        ...journey,
        fieldVerifyPassed: verified.passed,
      };
      details.push(...verified.details);
      if (!verified.passed) {
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.VERIFY,
          verdict: ProbeVerdict.FAILURE,
          details: verified.details,
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { journey, details };
      }
      journey = markStageComplete(journey, LeadCaptureStage.VERIFY, nowIso);

      if (journey.durableOperationId) {
        try {
          const v = await durable.verifyIndependent({
            operationId: journey.durableOperationId,
            observedDigest: payloadDigest,
            observedPayload: { correlationId, recordId: receipt.recordId },
            nowIso,
          });
          if (!v.matched) {
            details.push("Durable verify mismatched");
            journey = markJourneyFailure(journey, {
              stage: LeadCaptureStage.VERIFY,
              verdict: ProbeVerdict.FAILURE,
              details: ["Durable independent verify mismatched — journey quarantined"],
              atIso: nowIso,
            });
            store.upsertJourney(journey);
            return { journey, details };
          }
          details.push(
            `Durable verify VERIFIED (applyCount=${v.applyAttemptCount})`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          details.push(`Durable verify error: ${msg}`);
          journey = markJourneyFailure(journey, {
            stage: LeadCaptureStage.VERIFY,
            verdict: ProbeVerdict.FAILURE,
            details: [`Durable verify error — refusing SUCCESS: ${msg}`],
            atIso: nowIso,
          });
          store.upsertJourney(journey);
          return { journey, details };
        }
      }

      gateway.markVerified(operationId, nowIso);
      journey = markJourneySuccess(journey, nowIso);

      if (!input.skipCleanup) {
        const cleaned = crm.cleanup({ correlationId, nowIso });
        details.push(...cleaned.details);
        if (!cleaned.ok) {
          journey = {
            ...journey,
            cleanup: {
              status: CleanupStatus.FAILED,
              cleanedRecordId: cleaned.cleanedRecordId,
              cleanedAtIso: null,
              details: cleaned.details,
            },
          };
          journey = markJourneyFailure(journey, {
            stage: LeadCaptureStage.CLEANUP,
            verdict: ProbeVerdict.FAILURE,
            details: [
              "Synthetic cleanup failed — journey not SUCCESS while CRM record remains",
              ...cleaned.details,
            ],
            atIso: nowIso,
          });
          store.upsertJourney(journey);
          return { journey, details };
        }
        journey = {
          ...journey,
          cleanup: {
            status: CleanupStatus.DONE,
            cleanedRecordId: cleaned.cleanedRecordId,
            cleanedAtIso: nowIso,
            details: cleaned.details,
          },
          status: LeadCaptureJourneyStatus.CLEANED,
        };
        journey = markStageComplete(journey, LeadCaptureStage.CLEANUP, nowIso);
        if (cleaned.receiptId) {
          store.addCleanupEvent({
            cleanupId: id("cleanup"),
            correlationId,
            receiptId: cleaned.receiptId,
            recordId: cleaned.cleanedRecordId,
            cleanedAtIso: nowIso,
          });
        }
      } else {
        journey = {
          ...journey,
          cleanup: {
            status: CleanupStatus.SKIPPED,
            cleanedRecordId: null,
            cleanedAtIso: null,
            details: ["Cleanup skipped by caller"],
          },
        };
      }

      store.upsertJourney(journey);
      return { journey, details };
    },

    cleanup(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const cleaned = crm.cleanup({
        correlationId: input.correlationId,
        nowIso,
      });
      const state = store.read();
      const journey =
        state.journeys.find((j) => j.correlationId === input.correlationId) ??
        null;
      if (!journey) {
        return { ok: cleaned.ok, journey: null, details: cleaned.details };
      }
      let next: LeadCaptureJourney = {
        ...journey,
        cleanup: {
          status: cleaned.ok ? CleanupStatus.DONE : CleanupStatus.FAILED,
          cleanedRecordId: cleaned.cleanedRecordId,
          cleanedAtIso: cleaned.ok ? nowIso : null,
          details: cleaned.details,
        },
        updatedAtIso: nowIso,
      };
      if (cleaned.ok) {
        next = {
          ...markStageComplete(next, LeadCaptureStage.CLEANUP, nowIso),
          status: LeadCaptureJourneyStatus.CLEANED,
          currentFailure: null,
        };
        if (cleaned.receiptId) {
          store.addCleanupEvent({
            cleanupId: id("cleanup"),
            correlationId: input.correlationId,
            receiptId: cleaned.receiptId,
            recordId: cleaned.cleanedRecordId,
            cleanedAtIso: nowIso,
          });
        }
      } else {
        next = markJourneyFailure(next, {
          stage: LeadCaptureStage.CLEANUP,
          verdict: ProbeVerdict.FAILURE,
          details: cleaned.details,
          atIso: nowIso,
        });
      }
      store.upsertJourney(next);
      return { ok: cleaned.ok, journey: next, details: cleaned.details };
    },

    openIncidentFromFailure(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const journey = store
        .read()
        .journeys.find((j) => j.journeyId === input.journeyId);
      if (!journey) {
        return {
          ok: false,
          code: "JOURNEY_NOT_FOUND",
          journey: null,
          details: ["Unknown journey"],
        };
      }
      if (!journey.currentFailure) {
        return {
          ok: false,
          code: "NO_FAILURE",
          journey,
          details: ["Journey has no current failure to open an incident from"],
        };
      }
      if (!isCrmDeliveryFailure(journey)) {
        return {
          ok: false,
          code: "NOT_CRM_DELIVERY_FAILURE",
          journey,
          details: [
            "Incidents for bounded CRM repair require a CRM delivery/verify/cleanup failure with an authorized submission — pre-submit browser/gateway failures are not eligible",
          ],
        };
      }
      if (journey.repair?.incidentId) {
        const linked: {
          ok: true;
          journey: LeadCaptureJourney;
          incidentId: string;
          details: string[];
          ticketId?: string;
          proposalId?: string;
        } = {
          ok: true,
          journey,
          incidentId: journey.repair.incidentId,
          details: ["Incident already linked"],
        };
        if (journey.repair.ticketId) linked.ticketId = journey.repair.ticketId;
        if (journey.repair.proposalId) linked.proposalId = journey.repair.proposalId;
        return linked;
      }

      const incidentId = id("inc");
      const ticketId = id("tkt");
      const proposalId = id("prop");
      const incident = createIncident({
        incidentId,
        title: `Form→CRM delivery failure (${journey.correlationId})`,
        summary: journey.currentFailure.details.join("; "),
        severity: IncidentSeverity.P1,
        assetId: "page-contact",
        siteId: "worksocial-pilot",
        failingProbeId: journey.probeRunId ?? journey.journeyId,
        businessImpact: "Lead capture canary failed — CRM receipt missing or mismatched",
        fixtureOnly: true,
        createdAtIso: nowIso,
        status: IncidentStatus.REPRODUCED,
      });
      const ticket = createRepairTicket({
        ticketId,
        incident,
        repairClass: RepairClass.IDEMPOTENT_RETRY,
        worktreeRef: `worktrees/${ticketId}`,
        sourceRevision: "rev-m5-delivery",
        fixtureOnly: true,
        createdAtIso: nowIso,
      });
      const proposal = createRepairProposal({
        proposalId,
        ticket,
        authorRoleId: "A24",
        title: "Retry fixture CRM delivery for synthetic canary",
        summary:
          "Bounded idempotent retry of fixture CRM write path after delivery failure. Does not touch tests or standing policies.",
        patches: [
          {
            path: "fixtures/crm/delivery.json",
            op: RepairPatchOp.RETRY_DELIVERY,
            before: "delivery_failed",
            after: "delivery_restored",
          },
        ],
        testOperations: [],
        regressionProbeId: "probe-form-crm-canary",
        testBaselineDigest: DELIVERY_BASELINE,
        proposedTestBaselineDigest: DELIVERY_BASELINE,
        fixtureOnly: true,
        createdAtIso: nowIso,
        status: RepairProposalStatus.READY_FOR_REVIEW,
      });

      const integrity = evaluateTestIntegrityGate(proposal);
      const protectedPaths = evaluateProtectedPathGate(proposal);
      if (!integrity.allowed || !protectedPaths.allowed) {
        return {
          ok: false,
          code: "PROPOSAL_GATE_DENIED",
          journey,
          details: [
            ...(!integrity.allowed ? integrity.reasons : []),
            ...(!protectedPaths.allowed ? protectedPaths.reasons : []),
          ],
        };
      }

      if (repairStore) {
        repairStore.upsertIncident(incident);
        repairStore.upsertTicket(ticket);
        repairStore.upsertProposal(proposal);
      }

      const next = linkRepairToJourney(
        journey,
        {
          incidentId,
          ticketId,
          proposalId,
          state: `incident_open:${incident.status}:${ticket.repairClass}`,
          attemptCount: 0,
        },
        nowIso,
      );
      // Retain currentFailure while REPAIRING so monitoring still shows it.
      store.upsertJourney(next);
      return {
        ok: true,
        journey: next,
        incidentId,
        ticketId,
        proposalId,
        details: [
          `Opened incident ${incidentId} from delivery failure`,
          `Ticket ${ticketId} / proposal ${proposalId} (idempotent_retry)`,
          repairStore
            ? "Persisted incident bundle to repair ledger"
            : "Repair store not wired — IDs linked on journey only",
          "Test integrity + protected path gates passed",
        ],
      };
    },

    async runBoundedRepairRecovery(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      let journey = store
        .read()
        .journeys.find((j) => j.journeyId === input.journeyId);
      if (!journey) {
        return {
          ok: false,
          weakenTestBlocked: false,
          journey: null,
          details: ["Unknown journey"],
        };
      }

      if (
        journey.status === LeadCaptureJourneyStatus.RECOVERED ||
        journey.status === LeadCaptureJourneyStatus.CLEANED ||
        journey.status === LeadCaptureJourneyStatus.SUCCESS
      ) {
        return {
          ok: false,
          weakenTestBlocked: false,
          journey,
          details: [
            `Refuse repeated recovery — journey already ${journey.status}`,
          ],
        };
      }

      if (!journey.currentFailure || !isCrmDeliveryFailure(journey)) {
        return {
          ok: false,
          weakenTestBlocked: false,
          journey,
          details: [
            "Recovery restricted to CRM delivery/verify/cleanup failures with an authorized submission",
          ],
        };
      }

      const priorAttempts = journey.repair?.attemptCount ?? 0;
      if (priorAttempts >= MAX_REPAIR_ATTEMPTS) {
        journey = {
          ...journey,
          status: LeadCaptureJourneyStatus.ESCALATED,
          repair: journey.repair
            ? { ...journey.repair, state: "escalated_attempt_limit" }
            : journey.repair,
          updatedAtIso: nowIso,
        };
        store.upsertJourney(journey);
        return {
          ok: false,
          weakenTestBlocked: false,
          journey,
          details: [
            `Repair attempt limit (${MAX_REPAIR_ATTEMPTS}) reached — escalate`,
          ],
        };
      }

      if (!journey.repair?.incidentId) {
        const opened = this.openIncidentFromFailure({
          journeyId: input.journeyId,
          nowIso,
        });
        details.push(...opened.details);
        if (!opened.ok || !opened.journey) {
          return {
            ok: false,
            weakenTestBlocked: false,
            journey: opened.journey,
            details,
          };
        }
        journey = opened.journey;
      }

      let weakenTestBlocked = false;
      if (input.attemptWeakenTest) {
        const badProposal = createRepairProposal({
          proposalId: id("prop-bad"),
          ticket: createRepairTicket({
            ticketId: id("tkt-bad"),
            incident: createIncident({
              incidentId: journey.repair!.incidentId,
              title: "x",
              summary: "x",
              severity: IncidentSeverity.P2,
              assetId: "page-contact",
              siteId: "worksocial-pilot",
              failingProbeId: journey.journeyId,
              businessImpact: "x",
              fixtureOnly: true,
              createdAtIso: nowIso,
            }),
            repairClass: RepairClass.FIXTURE_INTEGRATION,
            worktreeRef: "worktrees/bad",
            sourceRevision: "rev-bad",
            fixtureOnly: true,
            createdAtIso: nowIso,
          }),
          authorRoleId: "A24",
          title: "Weaken tests",
          summary: "Illegal",
          patches: [
            {
              path: "tests/contract/form-crm-canary.contract.test.ts",
              op: RepairPatchOp.REPLACE_FIELD,
              before: "expect",
              after: "skip",
            },
          ],
          testOperations: [WeakenTestOperation.DISABLE_TEST],
          regressionProbeId: "probe-form-crm-canary",
          testBaselineDigest: DELIVERY_BASELINE,
          proposedTestBaselineDigest: "mutated-baseline",
          fixtureOnly: true,
          createdAtIso: nowIso,
        });
        const gate = evaluateTestIntegrityGate(badProposal);
        const pathGate = evaluateProtectedPathGate(badProposal);
        weakenTestBlocked = !gate.allowed || !pathGate.allowed;
        details.push(
          weakenTestBlocked
            ? "Weaken-test proposal blocked by integrity/protected-path gates"
            : "ERROR: weaken-test proposal was not blocked",
        );
        if (!weakenTestBlocked) {
          return { ok: false, weakenTestBlocked, journey, details };
        }
      }

      // Authorize repair CRM rewrite via action gateway (stop switch / grants).
      const mapping = input.authority.productionMapping;
      const writePathId =
        journey.submission?.writePathId ??
        mapping.writePaths.find((p) => p.operation === "submit_form_canary")
          ?.writePathId ??
        null;
      if (!writePathId || !journey.submission) {
        return {
          ok: false,
          weakenTestBlocked,
          journey,
          details: ["Missing write path or submission for authorized recovery"],
        };
      }
      const path = mapping.writePaths.find((p) => p.writePathId === writePathId);
      if (!path) {
        return {
          ok: false,
          weakenTestBlocked,
          journey,
          details: [`Unknown write path ${writePathId}`],
        };
      }

      const lead = createSyntheticLead({ correlationId: journey.correlationId });
      const repairOpId = id("op-repair");
      const repairPayload: Record<string, unknown> = {
        ...lead.fieldValues,
        synthetic: true,
        correlationId: journey.correlationId,
        commercialExcluded: true,
        repairRetry: true,
      };
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        actorRole: input.authority.actorRole ?? LocalRole.ADMINISTRATOR,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: mapping,
      };
      const authorized = gateway.submitIntent(
        {
          operationId: repairOpId,
          actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
          channelId: path.channelId,
          targetAccountId: input.targetAccountId ?? "acct-fixture-canary",
          operation: path.operation,
          assetId: path.assetId,
          contentRevision: null,
          writePathId,
          payload: repairPayload,
        },
        snapshot,
      );
      if (!authorized.decision.allowed) {
        details.push(
          `Repair CRM write denied by gateway: ${authorized.decision.code ?? authorized.decision.reason}`,
        );
        journey = {
          ...journey,
          status: LeadCaptureJourneyStatus.FAILED,
          repair: journey.repair
            ? {
                ...journey.repair,
                state: "gate_denied",
                attemptCount: priorAttempts + 1,
              }
            : journey.repair,
          gatewayDecisionId: authorized.decision.decisionId,
          updatedAtIso: nowIso,
        };
        store.upsertJourney(journey);
        return { ok: false, weakenTestBlocked, journey, details };
      }

      journey = {
        ...journey,
        repair: journey.repair
          ? {
              ...journey.repair,
              state: "repairing",
              attemptCount: priorAttempts + 1,
            }
          : journey.repair,
        status: LeadCaptureJourneyStatus.REPAIRING,
        gatewayDecisionId: authorized.decision.decisionId,
      };
      journey = markStageComplete(journey, LeadCaptureStage.REPAIR, nowIso);
      store.upsertJourney(journey);

      const receipt = crm.writeSyntheticLead({
        correlationId: journey.correlationId,
        fieldSnapshot: lead.fieldValues,
        nowIso,
      });
      if (!receipt) {
        details.push("Repair CRM rewrite failed");
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.REVERIFY,
          verdict: ProbeVerdict.FAILURE,
          details: ["Repair CRM rewrite produced no receipt"],
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { ok: false, weakenTestBlocked, journey, details };
      }
      const verified = crm.verifyFields({
        correlationId: journey.correlationId,
        expected: lead.fieldValues,
      });
      details.push(...verified.details);
      if (!verified.passed) {
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.REVERIFY,
          verdict: ProbeVerdict.FAILURE,
          details: verified.details,
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { ok: false, weakenTestBlocked, journey, details };
      }

      gateway.markVerified(repairOpId, nowIso);

      const cleaned = crm.cleanup({
        correlationId: journey.correlationId,
        nowIso,
      });
      details.push(...cleaned.details);
      if (!cleaned.ok) {
        journey = {
          ...journey,
          crmReceipt: receipt,
          fieldVerifyPassed: true,
          cleanup: {
            status: CleanupStatus.FAILED,
            cleanedRecordId: cleaned.cleanedRecordId,
            cleanedAtIso: null,
            details: cleaned.details,
          },
        };
        journey = markJourneyFailure(journey, {
          stage: LeadCaptureStage.CLEANUP,
          verdict: ProbeVerdict.FAILURE,
          details: [
            "Recovery verify passed but synthetic cleanup failed",
            ...cleaned.details,
          ],
          atIso: nowIso,
        });
        store.upsertJourney(journey);
        return { ok: false, weakenTestBlocked, journey, details };
      }

      journey = {
        ...journey,
        crmReceipt: receipt,
        fieldVerifyPassed: true,
        // Keep original authorized submission — never fabricate.
        submission: journey.submission,
        lastSuccessAtIso: nowIso,
        currentFailure: null,
        status: LeadCaptureJourneyStatus.RECOVERED,
        cleanup: {
          status: CleanupStatus.DONE,
          cleanedRecordId: cleaned.cleanedRecordId,
          cleanedAtIso: nowIso,
          details: cleaned.details,
        },
        repair: journey.repair
          ? { ...journey.repair, state: "verified_recovered" }
          : null,
        updatedAtIso: nowIso,
      };
      journey = markStageComplete(journey, LeadCaptureStage.REVERIFY, nowIso);
      journey = markStageComplete(journey, LeadCaptureStage.CLEANUP, nowIso);
      store.upsertJourney(journey);
      if (cleaned.receiptId) {
        store.addCleanupEvent({
          cleanupId: id("cleanup"),
          correlationId: journey.correlationId,
          receiptId: cleaned.receiptId,
          recordId: cleaned.cleanedRecordId,
          cleanedAtIso: nowIso,
        });
      }
      details.push(
        `Recovered journey ${journey.journeyId}: incident→repair→verify complete`,
      );
      const commerce = projectCommerceTotals(store.read().commerceLeads);
      details.push(
        `Commerce totals: leads=${commerce.leadCount} syntheticExcluded=${commerce.syntheticExcludedCount}`,
      );

      return { ok: true, weakenTestBlocked, journey, details };
    },
  };
}

function createLeadCaptureJourneyLocal(input: {
  journeyId: string;
  correlationId: string;
  createdAtIso: string;
  playwrightMode: LeadCaptureJourney["playwrightMode"];
}): LeadCaptureJourney {
  return {
    journeyId: input.journeyId,
    correlationId: input.correlationId,
    status: LeadCaptureJourneyStatus.RUNNING,
    stagesCompleted: [],
    lastSuccessAtIso: null,
    currentFailure: null,
    submission: null,
    crmReceipt: null,
    artifactRefs: {
      screenshotId: null,
      traceId: null,
      htmlSnapshotId: null,
    },
    repair: null,
    cleanup: {
      status: CleanupStatus.PENDING,
      cleanedRecordId: null,
      cleanedAtIso: null,
      details: [],
    },
    durableOperationId: null,
    probeRunId: null,
    gatewayDecisionId: null,
    fieldVerifyPassed: null,
    commercialExcluded: true,
    fixtureOnly: true,
    playwrightMode: input.playwrightMode,
    liveZohoWiring: "NOT_WIRED",
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}
