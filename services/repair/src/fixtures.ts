/**
 * Fixture golden incident + CTA canary for R1-10.
 * Offline only — no live CMS mutations.
 */

import {
  AdapterWiring,
  BindingKind,
  ConnectionState,
  DEFAULT_PILOT_EVIDENCE_KINDS,
  IncidentSeverity,
  IncidentStatus,
  RepairClass,
  RepairPatchOp,
  RepairProposalStatus,
  VerificationState,
  WriteReadiness,
  createIncident,
  createRepairProposal,
  createRepairTicket,
  digestTestBaseline,
  proveFixturePilotWritePath,
  type FixtureAssetSnapshot,
  type IncidentRecord,
  type JourneyRegistryEntry,
  type PilotWritePath,
  type ProductionMappingState,
  type RepairProposal,
  type RepairTicket,
  type SourceBinding,
} from "@worksocial/domain";

export const REPAIR_PILOT_ASSET_ID = "page-home-cta" as const;
export const REPAIR_PILOT_WRITE_PATH_ID = "wp-bounded-repair" as const;
export const REPAIR_PILOT_BINDING_ID = "bind-repair-cta" as const;
export const REPAIR_SITE_ID = "worksocial-pilot" as const;
export const REPAIR_INCIDENT_ID = "golden-inc-broken-cta" as const;
export const REPAIR_TICKET_ID = "golden-tkt-cta" as const;
export const REPAIR_PROPOSAL_ID = "golden-prop-restore-cta" as const;
export const REPAIR_PROBE_ID = "probe-cta-home" as const;
export const REPAIR_HEALTHY_CTA = "/day-pass" as const;
export const REPAIR_DEFECT_CTA = "/broken-cta" as const;
export const REPAIR_CTA_PATH = "sites/worksocial/home/cta.json" as const;
export const REPAIR_BASELINE_ASSERTIONS = [
  "cta_href_equals_healthy",
  "cta_visible",
] as const;

export type RepairAdapterResult =
  | {
      wiring: "FIXTURE";
      accepted: true;
      remoteId: string;
      summary: string;
      observedValue: string;
    }
  | {
      wiring: "NOT_WIRED";
      accepted: false;
      remoteId: null;
      summary: string;
      code: "NOT_WIRED";
      observedValue: null;
    };

export function repairTestBaselineDigest(): string {
  return digestTestBaseline(REPAIR_PROBE_ID, REPAIR_BASELINE_ASSERTIONS);
}

export function buildHealthyFixtureAsset(nowIso: string): FixtureAssetSnapshot {
  return {
    assetId: REPAIR_PILOT_ASSET_ID,
    fieldKey: "ctaHref",
    fieldValue: REPAIR_HEALTHY_CTA,
    healthyValue: REPAIR_HEALTHY_CTA,
    defectInjected: false,
    revision: "rev-repair-demo",
    updatedAtIso: nowIso,
  };
}

export function buildGoldenRepairBundle(nowIso: string): {
  incident: IncidentRecord;
  ticket: RepairTicket;
  proposal: RepairProposal;
  asset: FixtureAssetSnapshot;
  baselineDigest: string;
} {
  const baselineDigest = repairTestBaselineDigest();
  const incident = createIncident({
    incidentId: REPAIR_INCIDENT_ID,
    title: "Home CTA href broken",
    summary:
      "Deterministic probe found home CTA pointing at a dead path; restore known-good day-pass target.",
    severity: IncidentSeverity.P2,
    assetId: REPAIR_PILOT_ASSET_ID,
    siteId: REPAIR_SITE_ID,
    failingProbeId: REPAIR_PROBE_ID,
    businessImpact: "Day-pass conversion path unavailable on home",
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: IncidentStatus.REPRODUCED,
  });
  const ticket = createRepairTicket({
    ticketId: REPAIR_TICKET_ID,
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: `worktrees/${REPAIR_TICKET_ID}`,
    sourceRevision: "rev-repair-demo",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const proposal = createRepairProposal({
    proposalId: REPAIR_PROPOSAL_ID,
    ticket,
    authorRoleId: "A24",
    title: "Restore home CTA to /day-pass",
    summary: "Isolated restore of known-correct CTA href after probe failure",
    patches: [
      {
        path: REPAIR_CTA_PATH,
        op: RepairPatchOp.RESTORE_VALUE,
        before: REPAIR_DEFECT_CTA,
        after: REPAIR_HEALTHY_CTA,
      },
    ],
    testOperations: ["run_regression"],
    regressionProbeId: REPAIR_PROBE_ID,
    testBaselineDigest: baselineDigest,
    proposedTestBaselineDigest: baselineDigest,
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: RepairProposalStatus.READY_FOR_REVIEW,
  });
  return {
    incident,
    ticket,
    proposal,
    asset: buildHealthyFixtureAsset(nowIso),
    baselineDigest,
  };
}

export function fixtureRepairApply(input: {
  proposalId: string;
  assetId: string;
  afterValue: string;
}): RepairAdapterResult {
  return {
    wiring: "FIXTURE",
    accepted: true,
    remoteId: `fixture-repair-${input.proposalId}`,
    summary: `Fixture CMS accepted bounded repair for ${input.assetId}`,
    observedValue: input.afterValue,
  };
}

export function liveCmsRepairStub(): RepairAdapterResult {
  return {
    wiring: "NOT_WIRED",
    accepted: false,
    remoteId: null,
    summary:
      "Live CMS bounded repair is NOT_WIRED without owner credentials and verified source binding",
    code: "NOT_WIRED",
    observedValue: null,
  };
}

export function invokeRepairAdapter(input: {
  preferLive: boolean;
  proposalId: string;
  assetId: string;
  afterValue: string;
}): RepairAdapterResult {
  if (input.preferLive) {
    return liveCmsRepairStub();
  }
  return fixtureRepairApply({
    proposalId: input.proposalId,
    assetId: input.assetId,
    afterValue: input.afterValue,
  });
}

export function createFixtureRepairPilotMapping(nowIso: string): {
  state: ProductionMappingState;
  writePathId: string;
} {
  const binding: SourceBinding = {
    bindingId: REPAIR_PILOT_BINDING_ID,
    siteId: REPAIR_SITE_ID,
    kind: BindingKind.WEBSITE,
    resourceRef: "fixture://repair/home-cta",
    displayName: "Fixture home CTA asset",
    identityLabel: "acct-demo",
    connectionState: ConnectionState.NOT_CONFIGURED,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.NOT_VERIFIED,
    ownershipProven: false,
    observedRevision: null,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const writePath: PilotWritePath = {
    writePathId: REPAIR_PILOT_WRITE_PATH_ID,
    channelId: "owned-site",
    assetId: REPAIR_PILOT_ASSET_ID,
    operation: "apply_bounded_repair",
    siteId: REPAIR_SITE_ID,
    bindingId: REPAIR_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  const journey: JourneyRegistryEntry = {
    journeyId: "journey-bounded-repair-cta",
    siteId: REPAIR_SITE_ID,
    displayName: "Injected CTA defect → bounded repair",
    stages: ["detect", "propose", "review", "release", "verify"],
    writePathIds: [REPAIR_PILOT_WRITE_PATH_ID],
    createdAtIso: nowIso,
  };

  return {
    writePathId: REPAIR_PILOT_WRITE_PATH_ID,
    state: {
      version: 1,
      sites: [REPAIR_SITE_ID],
      bindings: [binding],
      forms: [],
      bookingOwnership: [],
      crmOwnership: [],
      writePaths: [writePath],
      journeys: [journey],
      readEvidence: [],
      writePathOutcomes: [],
      updatedAt: nowIso,
    },
  };
}

export function proveFixtureRepairWritePath(
  state: ProductionMappingState,
  nowIso: string,
): ProductionMappingState {
  return proveFixturePilotWritePath(state, REPAIR_PILOT_WRITE_PATH_ID, nowIso);
}

export function upsertFixtureRepairMapping(
  current: ProductionMappingState,
  nowIso: string,
): { state: ProductionMappingState; writePathId: string; created: boolean } {
  const { state: fixture, writePathId } =
    createFixtureRepairPilotMapping(nowIso);
  const existing = current.writePaths.find((p) => p.writePathId === writePathId);
  if (existing) {
    return { state: current, writePathId, created: false };
  }
  const missingBindings = fixture.bindings.filter(
    (fb) => !current.bindings.some((b) => b.bindingId === fb.bindingId),
  );
  const missingJourneys = fixture.journeys.filter(
    (fj) => !current.journeys.some((j) => j.journeyId === fj.journeyId),
  );
  return {
    writePathId,
    created: true,
    state: {
      ...current,
      sites: [...new Set([...current.sites, ...fixture.sites])],
      bindings: [...current.bindings, ...missingBindings],
      writePaths: [...current.writePaths, ...fixture.writePaths],
      journeys: [...current.journeys, ...missingJourneys],
      updatedAt: nowIso,
    },
  };
}
