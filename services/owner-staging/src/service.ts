/**
 * Owner staging workflow service (M4 / NEXT-13–15).
 * Orchestrates activation, collectors, missions, review, staging CMS.
 *
 * Temporal honesty: `/owner/status` uses the same binding probe as
 * `/roles/status` (frontend reachability). That label does not mean M4
 * missions enqueue on Temporal — staging CMS remains simulator/fixture.
 * External effects: NONE.
 */

import { randomBytes } from "node:crypto";
import {
  ActivationStepId,
  ActivationStepStatus,
  ConnectionKind,
  ConnectionMode,
  MeasurementMode,
  MissionStatus,
  ReviewDecision,
  StagingChangeStatus,
  activationProgress,
  createActivationChecklist,
  digestFields,
  ownerMissionSummary,
  setActivationStep,
  type ActivationStepIdValue,
  type ActivationStepStatusValue,
  type OwnerConnectionRecord,
  type OwnerEvidenceItem,
  type OwnerMissionRecord,
  type OwnerSiteRecord,
  type OwnerStagingState,
  type ReviewDecisionValue,
  type StagingPageFields,
} from "@worksocial/domain";
import type { OwnerStagingStore } from "@worksocial/persistence";
import {
  capturePageSnapshot,
  collectorCredentialHints,
  createStagingCmsSimulator,
  htmlFromStagingFields,
  readGa4Observations,
  readGscObservations,
  stagingCmsLiveAvailable,
  type StagingCmsSimulator,
} from "@worksocial/provider-adapters";
import {
  probeTemporalConnection,
  runtimeTemporalLabel,
} from "@worksocial/workflow-worker";

function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

const DEFAULT_DESIRED: StagingPageFields = {
  title: "Quiet desks near PATH — staging update",
  metaDescription: "Book a tour of our Jersey City pilot floor today.",
  h1: "Quiet desks near PATH",
  bodyExcerpt:
    "Updated staging copy for the pilot page. Simulator only — not a live CMS publish.",
};

/** Runtime Temporal labels shared with roles/API honesty. */
export type OwnerStagingTemporalWiring =
  | "NOT_WIRED"
  | "LOCAL_DURABLE"
  | "FIXTURE"
  | "TEMPORAL";

/**
 * Injectable Temporal probe for tests. Default dials the frontend via
 * `probeTemporalConnection` (same path as `/roles/status`).
 */
export type ProbeOwnerStagingTemporal = (
  env?: NodeJS.ProcessEnv,
) =>
  | OwnerStagingTemporalWiring
  | Promise<OwnerStagingTemporalWiring>;

export type OwnerStagingServiceOptions = {
  probeTemporalWiring?: ProbeOwnerStagingTemporal;
  /** Env snapshot for the default probe (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
};

async function defaultProbeOwnerStagingTemporal(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OwnerStagingTemporalWiring> {
  const report = await probeTemporalConnection(env, { timeoutMs: 3_000 });
  return runtimeTemporalLabel(report);
}

export type OwnerStagingService = {
  status(): Promise<
    ReturnType<OwnerStagingStore["status"]> & {
      collectorCredentials: ReturnType<typeof collectorCredentialHints>;
      stagingCmsMode: "SIMULATOR" | "LIVE_UNAVAILABLE";
      liveCmsAvailable: boolean;
      temporalWiring: OwnerStagingTemporalWiring;
      /** Frontend reachability only — not an M4 Temporal enqueue claim. */
      temporalProbeScope: "FRONTEND_REACHABILITY";
      r1CompleteClaim: false;
    }
  >;
  readState(): OwnerStagingState;
  getActivation(): {
    checklist: OwnerStagingState["activation"];
    progress: ReturnType<typeof activationProgress> | null;
  };
  startActivation(input?: { timezone?: string; nowIso?: string }): {
    checklist: NonNullable<OwnerStagingState["activation"]>;
    progress: ReturnType<typeof activationProgress>;
  };
  completeActivationStep(input: {
    stepId: ActivationStepIdValue;
    status?: ActivationStepStatusValue;
    note?: string;
    nowIso?: string;
  }): {
    checklist: NonNullable<OwnerStagingState["activation"]>;
    progress: ReturnType<typeof activationProgress>;
  };
  listConnections(): OwnerConnectionRecord[];
  ensureFixtureConnections(nowIso?: string): OwnerConnectionRecord[];
  listSites(): OwnerSiteRecord[];
  registerSite(input: {
    displayName?: string;
    domain?: string;
    pilotPagePath?: string;
    pilotPageTitle?: string;
    nowIso?: string;
  }): OwnerSiteRecord;
  captureEvidence(input: {
    siteId: string;
    preferLive?: boolean;
    liveUrl?: string;
    nowIso?: string;
  }): Promise<{
    snapshot: OwnerStagingState["snapshots"][number];
    gsc: OwnerStagingState["measurements"][number];
    ga4: OwnerStagingState["measurements"][number];
    notes: string[];
  }>;
  listMissions(): ReturnType<typeof ownerMissionSummary>[];
  getMission(missionId: string): {
    summary: ReturnType<typeof ownerMissionSummary>;
    mission: OwnerMissionRecord;
    change: OwnerStagingState["changes"][number] | null;
    before: OwnerStagingState["snapshots"][number] | null;
  } | null;
  createPilotMission(input: {
    siteId: string;
    displayTitle?: string;
    summary?: string;
    desiredFields?: StagingPageFields;
    nowIso?: string;
  }): Promise<{
    mission: OwnerMissionRecord;
    summary: ReturnType<typeof ownerMissionSummary>;
    snapshotNote: string;
  }>;
  listReviewQueue(): Array<{
    missionId: string;
    title: string;
    summary: string;
    beforeTitle: string | null;
    desiredTitle: string;
    status: string;
  }>;
  reviewMission(input: {
    missionId: string;
    decision: ReviewDecisionValue;
    note?: string;
    nowIso?: string;
  }): {
    ok: boolean;
    mission: OwnerMissionRecord | null;
    reason: string;
  };
  /** Edit desired fields on a DRAFT mission and resubmit for review. */
  reviseMission(input: {
    missionId: string;
    desiredFields: StagingPageFields;
    nowIso?: string;
  }): {
    ok: boolean;
    mission: OwnerMissionRecord | null;
    reason: string;
  };
  applyStaging(input: {
    missionId: string;
    forceUnknownRemote?: boolean;
    nowIso?: string;
  }): {
    ok: boolean;
    mission: OwnerMissionRecord | null;
    change: OwnerStagingState["changes"][number] | null;
    note: string;
  };
  verifyStaging(input: {
    missionId: string;
    nowIso?: string;
  }): {
    ok: boolean;
    matched: boolean;
    mission: OwnerMissionRecord | null;
    change: OwnerStagingState["changes"][number] | null;
    observedFields: StagingPageFields | null;
    note: string;
    details: string[];
  };
  recoverStaging(input: {
    missionId: string;
    nowIso?: string;
  }): {
    ok: boolean;
    mission: OwnerMissionRecord | null;
    change: OwnerStagingState["changes"][number] | null;
    note: string;
  };
  listEvidence(limit?: number): OwnerEvidenceItem[];
  seedDemo(nowIso?: string): Promise<{
    site: OwnerSiteRecord;
    connections: OwnerConnectionRecord[];
    mission: OwnerMissionRecord;
    notes: string[];
  }>;
};

export function createOwnerStagingService(
  store: OwnerStagingStore,
  cms: StagingCmsSimulator = createStagingCmsSimulator(),
  options: OwnerStagingServiceOptions = {},
): OwnerStagingService {
  const env = options.env ?? process.env;
  const probeTemporalWiring =
    options.probeTemporalWiring ?? defaultProbeOwnerStagingTemporal;

  const pushEvidence = (item: OwnerEvidenceItem) => {
    store.addEvidence(item);
  };

  const service: OwnerStagingService = {
    async status() {
      const base = store.status();
      const temporalWiring = await probeTemporalWiring(env);
      return {
        ...base,
        collectorCredentials: collectorCredentialHints(),
        stagingCmsMode: cms.mode,
        liveCmsAvailable: stagingCmsLiveAvailable(),
        temporalWiring,
        temporalProbeScope: "FRONTEND_REACHABILITY",
        r1CompleteClaim: false,
      };
    },
    readState: () => store.read(),
    getActivation() {
      const checklist = store.read().activation;
      return {
        checklist,
        progress: checklist ? activationProgress(checklist) : null,
      };
    },
    startActivation(input = {}) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      let checklist = createActivationChecklist({
        checklistId: id("act"),
        nowIso,
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      });
      checklist = setActivationStep({
        checklist,
        stepId: ActivationStepId.SIGN_IN,
        status: ActivationStepStatus.COMPLETE,
        note: "Local console session established",
        nowIso,
      });
      store.setActivation(checklist);
      return { checklist, progress: activationProgress(checklist) };
    },
    completeActivationStep(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const current = store.read().activation;
      if (!current) {
        service.startActivation({ nowIso });
        return service.completeActivationStep({ ...input, nowIso });
      }
      const checklist = setActivationStep({
        checklist: current,
        stepId: input.stepId,
        status: input.status ?? ActivationStepStatus.COMPLETE,
        note: input.note ?? null,
        nowIso,
      });
      store.setActivation(checklist);
      return { checklist, progress: activationProgress(checklist) };
    },
    listConnections: () => store.read().connections,
    ensureFixtureConnections(nowIso) {
      const now = nowIso ?? new Date().toISOString();
      const creds = collectorCredentialHints();
      const rows: OwnerConnectionRecord[] = [
        {
          connectionId: "conn_gsc",
          kind: ConnectionKind.GSC,
          displayName: "Google Search Console",
          mode:
            creds.gsc === "present"
              ? ConnectionMode.LIVE
              : ConnectionMode.FIXTURE,
          accountLabel:
            creds.gsc === "present"
              ? "Credentials present (query not executed)"
              : "fixture-gsc-property",
          capabilitySummary: "Read search analytics",
          writeReady: false,
          note:
            creds.gsc === "present"
              ? "Credentials present; measurements stay UNAVAILABLE until a query succeeds."
              : "FIXTURE connection — not a live Search Console property.",
          updatedAtIso: now,
        },
        {
          connectionId: "conn_ga4",
          kind: ConnectionKind.GA4,
          displayName: "Google Analytics 4",
          mode:
            creds.ga4 === "present"
              ? ConnectionMode.LIVE
              : ConnectionMode.FIXTURE,
          accountLabel:
            creds.ga4 === "present"
              ? "Credentials present (query not executed)"
              : "fixture-ga4-property",
          capabilitySummary: "Read traffic analytics",
          writeReady: false,
          note:
            creds.ga4 === "present"
              ? "Credentials present; measurements stay UNAVAILABLE until a query succeeds."
              : "FIXTURE connection — not a live GA4 property.",
          updatedAtIso: now,
        },
        {
          connectionId: "conn_cms_staging",
          kind: ConnectionKind.CMS_STAGING,
          displayName: "Staging CMS",
          mode: stagingCmsLiveAvailable()
            ? ConnectionMode.LIVE
            : ConnectionMode.FIXTURE,
          accountLabel: stagingCmsLiveAvailable()
            ? "Live staging CMS credentials present"
            : "staging-cms-simulator",
          capabilitySummary: "Stage page fields + independent read-back",
          writeReady: true,
          note: stagingCmsLiveAvailable()
            ? "Live CMS credentials present — M4 still uses simulator until adapter cutover."
            : "SIMULATOR staging CMS — apply ≠ verified; independent read-back required.",
          updatedAtIso: now,
        },
      ];
      for (const row of rows) store.upsertConnection(row);
      service.completeActivationStep({
        stepId: ActivationStepId.CONNECTIONS,
        note: "Fixture/simulator connections ready",
        nowIso: now,
      });
      return rows;
    },
    listSites: () => store.read().sites,
    registerSite(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const site: OwnerSiteRecord = {
        siteId: id("site"),
        displayName: input.displayName ?? "WorkSocial pilot site",
        domain: input.domain ?? "fixture.worksocial.local",
        pilotPagePath: input.pilotPagePath ?? "/pilot",
        pilotPageTitle: input.pilotPageTitle ?? "Quiet desks near the PATH",
        environment: "fixture",
        sourceBindingLabel: "Demo CMS binding / staging first",
        createdAtIso: nowIso,
      };
      store.upsertSite(site);

      const fields: StagingPageFields = {
        title: site.pilotPageTitle,
        metaDescription: "Book a tour of our Jersey City pilot floor.",
        h1: site.pilotPageTitle,
        bodyExcerpt: "Book a tour of our Jersey City pilot floor.",
      };
      const page = {
        pageId: `page_${site.siteId}`,
        siteId: site.siteId,
        path: site.pilotPagePath,
        fields,
        revision: "rev_seed",
        contentDigest: digestFields(fields),
        updatedAtIso: nowIso,
      };
      cms.seedPage(page);
      store.upsertCmsPage(page);

      service.completeActivationStep({
        stepId: ActivationStepId.PILOT_SITE,
        note: `Registered ${site.displayName}`,
        nowIso,
      });
      return site;
    },
    async captureEvidence(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const site = store.read().sites.find((s) => s.siteId === input.siteId);
      if (!site) {
        throw new Error(`Unknown site ${input.siteId}`);
      }
      const pageId = `page_${site.siteId}`;
      const cmsPage =
        cms.getPage(pageId) ??
        store.read().cmsPages.find((p) => p.pageId === pageId) ??
        null;
      const fixtureHtml = cmsPage
        ? htmlFromStagingFields(
            cmsPage.fields,
            site.pilotPagePath,
            site.domain,
          )
        : undefined;
      const snapResult = await capturePageSnapshot({
        snapshotId: id("snap"),
        siteId: site.siteId,
        pagePath: site.pilotPagePath,
        nowIso,
        allowedOrigins: [site.domain],
        ...(fixtureHtml !== undefined ? { fixtureHtml } : {}),
        ...(input.preferLive !== undefined
          ? { preferLive: input.preferLive }
          : {}),
        ...(input.liveUrl !== undefined ? { liveUrl: input.liveUrl } : {}),
      });
      store.addSnapshot(snapResult.snapshot);
      pushEvidence({
        evidenceId: id("ev"),
        missionId: null,
        kind: "page_snapshot",
        title: "Page snapshot",
        summary: `${snapResult.snapshot.title} · ${snapResult.measurementMode}`,
        measurementMode: snapResult.measurementMode,
        createdAtIso: nowIso,
      });
      pushEvidence({
        evidenceId: id("ev"),
        missionId: null,
        kind: "deterministic_checks",
        title: "Deterministic page checks",
        summary: `${snapResult.snapshot.checks.filter((c) => c.passed).length}/${snapResult.snapshot.checks.length} passed`,
        measurementMode: snapResult.measurementMode,
        createdAtIso: nowIso,
      });

      const gsc = readGscObservations({
        observationId: id("gsc"),
        nowIso,
      });
      store.addMeasurement(gsc.observation);
      pushEvidence({
        evidenceId: id("ev"),
        missionId: null,
        kind: "measurement",
        title: "Search Console observation",
        summary: gsc.note,
        measurementMode: gsc.measurementMode,
        createdAtIso: nowIso,
      });

      const ga4 = readGa4Observations({
        observationId: id("ga4"),
        nowIso,
      });
      store.addMeasurement(ga4.observation);
      pushEvidence({
        evidenceId: id("ev"),
        missionId: null,
        kind: "measurement",
        title: "GA4 observation",
        summary: ga4.note,
        measurementMode: ga4.measurementMode,
        createdAtIso: nowIso,
      });

      return {
        snapshot: snapResult.snapshot,
        gsc: gsc.observation,
        ga4: ga4.observation,
        notes: [snapResult.note, gsc.note, ga4.note],
      };
    },
    listMissions() {
      return store.read().missions.map(ownerMissionSummary);
    },
    getMission(missionId) {
      const state = store.read();
      const mission = state.missions.find((m) => m.missionId === missionId);
      if (!mission) return null;
      return {
        summary: ownerMissionSummary(mission),
        mission,
        change:
          state.changes.find((c) => c.changeId === mission.changeId) ?? null,
        before:
          state.snapshots.find((s) => s.snapshotId === mission.beforeSnapshotId) ??
          null,
      };
    },
    async createPilotMission(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const site = store.read().sites.find((s) => s.siteId === input.siteId);
      if (!site) {
        throw new Error(`Unknown site ${input.siteId}`);
      }
      const evidence = await service.captureEvidence({
        siteId: site.siteId,
        nowIso,
      });
      const desired = input.desiredFields ?? DEFAULT_DESIRED;
      const mission: OwnerMissionRecord = {
        missionId: id("mis"),
        siteId: site.siteId,
        displayTitle:
          input.displayTitle ?? "Improve pilot page title and meta",
        summary:
          input.summary ??
          "Bounded staging improvement for the pilot page. Review exact fields before apply.",
        status: MissionStatus.NEEDS_REVIEW,
        beforeSnapshotId: evidence.snapshot.snapshotId,
        afterSnapshotId: null,
        changeId: null,
        reviewDecision: null,
        reviewNote: null,
        desiredFields: desired,
        fixtureOnly: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      store.upsertMission(mission);
      service.completeActivationStep({
        stepId: ActivationStepId.READ_AND_DRAFT,
        note: "Pilot mission ready for review",
        nowIso,
      });
      return {
        mission,
        summary: ownerMissionSummary(mission),
        snapshotNote: evidence.notes[0] ?? "snapshot captured",
      };
    },
    listReviewQueue() {
      const state = store.read();
      return state.missions
        .filter(
          (m) =>
            m.status === MissionStatus.NEEDS_REVIEW ||
            m.status === MissionStatus.DRAFT ||
            m.status === MissionStatus.APPROVED ||
            m.status === MissionStatus.ACCEPTED_PENDING ||
            m.status === MissionStatus.RECOVERY_REQUIRED,
        )
        .map((m) => {
          const before = state.snapshots.find(
            (s) => s.snapshotId === m.beforeSnapshotId,
          );
          return {
            missionId: m.missionId,
            title: m.displayTitle,
            summary: m.summary,
            beforeTitle: before?.title ?? null,
            desiredTitle: m.desiredFields.title,
            status: m.status,
          };
        });
    },
    reviewMission(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const mission = state.missions.find((m) => m.missionId === input.missionId);
      if (!mission) {
        return { ok: false, mission: null, reason: "Mission not found" };
      }
      if (mission.status !== MissionStatus.NEEDS_REVIEW) {
        return {
          ok: false,
          mission,
          reason: `Mission status ${mission.status} is not reviewable`,
        };
      }
      let status: OwnerMissionRecord["status"] = MissionStatus.NEEDS_REVIEW;
      if (input.decision === ReviewDecision.APPROVE_EXACT) {
        status = MissionStatus.APPROVED;
      } else if (input.decision === ReviewDecision.REJECT) {
        status = MissionStatus.REJECTED;
      } else if (input.decision === ReviewDecision.REQUEST_REVISION) {
        status = MissionStatus.DRAFT;
      } else {
        status = MissionStatus.NEEDS_REVIEW;
      }
      const next: OwnerMissionRecord = {
        ...mission,
        status,
        reviewDecision: input.decision,
        reviewNote: input.note ?? null,
        updatedAtIso: nowIso,
      };
      store.upsertMission(next);
      return {
        ok: true,
        mission: next,
        reason:
          input.decision === ReviewDecision.APPROVE_EXACT
            ? "Exact revision approved — staging apply still required"
            : input.decision === ReviewDecision.REQUEST_REVISION
              ? "Revision requested — call reviseMission with updated fields to resubmit"
              : `Review recorded: ${input.decision}`,
      };
    },
    reviseMission(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const mission = store
        .read()
        .missions.find((m) => m.missionId === input.missionId);
      if (!mission) {
        return { ok: false, mission: null, reason: "Mission not found" };
      }
      if (mission.status !== MissionStatus.DRAFT) {
        return {
          ok: false,
          mission,
          reason: `Mission status ${mission.status} cannot be revised — expected DRAFT`,
        };
      }
      const next: OwnerMissionRecord = {
        ...mission,
        desiredFields: { ...input.desiredFields },
        status: MissionStatus.NEEDS_REVIEW,
        reviewDecision: null,
        reviewNote: null,
        updatedAtIso: nowIso,
      };
      store.upsertMission(next);
      return {
        ok: true,
        mission: next,
        reason: "Revised fields submitted — mission returned to NEEDS_REVIEW",
      };
    },
    applyStaging(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const mission = state.missions.find((m) => m.missionId === input.missionId);
      if (!mission) {
        return {
          ok: false,
          mission: null,
          change: null,
          note: "Mission not found",
        };
      }
      if (mission.status !== MissionStatus.APPROVED) {
        return {
          ok: false,
          mission,
          change: null,
          note:
            mission.status === MissionStatus.RECOVERY_REQUIRED
              ? "RECOVERY_REQUIRED missions must use recoverStaging — not apply"
              : "Mission must be APPROVED before staging apply",
        };
      }
      const pageId = `page_${mission.siteId}`;
      const site = state.sites.find((s) => s.siteId === mission.siteId);
      const siteEnv = site?.environment ?? "staging";
      const applied = cms.applyChange({
        changeId: id("chg"),
        missionId: mission.missionId,
        pageId,
        desiredFields: mission.desiredFields,
        nowIso,
        boundEnvironment: siteEnv,
        intendedEnvironment: siteEnv,
        ...(input.forceUnknownRemote !== undefined
          ? { forceUnknownRemote: input.forceUnknownRemote }
          : {}),
      });
      store.upsertChange(applied.change);
      if (applied.page) store.upsertCmsPage(applied.page);

      const nextStatus =
        applied.change.status === StagingChangeStatus.UNKNOWN_REMOTE_OUTCOME
          ? MissionStatus.RECOVERY_REQUIRED
          : applied.change.status === StagingChangeStatus.APPLIED_PENDING
            ? MissionStatus.ACCEPTED_PENDING
            : MissionStatus.FAILED;

      const next: OwnerMissionRecord = {
        ...mission,
        status: nextStatus,
        changeId: applied.change.changeId,
        updatedAtIso: nowIso,
      };
      store.upsertMission(next);
      pushEvidence({
        evidenceId: id("ev"),
        missionId: mission.missionId,
        kind: "staging_apply",
        title: "Staging CMS apply",
        summary: applied.note,
        measurementMode: MeasurementMode.FIXTURE,
        createdAtIso: nowIso,
      });
      return {
        ok: nextStatus !== MissionStatus.FAILED,
        mission: next,
        change: applied.change,
        note: applied.note,
      };
    },
    verifyStaging(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const mission = state.missions.find((m) => m.missionId === input.missionId);
      if (!mission || !mission.changeId) {
        return {
          ok: false,
          matched: false,
          mission: mission ?? null,
          change: null,
          observedFields: null,
          note: "Mission or change missing",
          details: [],
        };
      }
      const change = state.changes.find((c) => c.changeId === mission.changeId);
      if (!change) {
        return {
          ok: false,
          matched: false,
          mission,
          change: null,
          observedFields: null,
          note: "Change record missing",
          details: [],
        };
      }
      if (
        change.status !== StagingChangeStatus.APPLIED_PENDING &&
        change.status !== StagingChangeStatus.RECOVERED
      ) {
        return {
          ok: false,
          matched: false,
          mission,
          change,
          observedFields: null,
          note: `Change status ${change.status} cannot be verified yet`,
          details: [],
        };
      }

      // Independent read from CMS simulator — never copy mission.desiredFields.
      const read = cms.independentRead({ change, nowIso });
      store.upsertChange(read.change);

      const next: OwnerMissionRecord = {
        ...mission,
        status: read.matched ? MissionStatus.VERIFIED : MissionStatus.FAILED,
        updatedAtIso: nowIso,
      };
      store.upsertMission(next);
      pushEvidence({
        evidenceId: id("ev"),
        missionId: mission.missionId,
        kind: "independent_read",
        title: "Independent staging read-back",
        summary: read.note,
        measurementMode: MeasurementMode.FIXTURE,
        createdAtIso: nowIso,
      });
      return {
        ok: read.matched,
        matched: read.matched,
        mission: next,
        change: read.change,
        observedFields: read.observedFields,
        note: read.note,
        details: read.details,
      };
    },
    recoverStaging(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const mission = state.missions.find((m) => m.missionId === input.missionId);
      if (!mission || !mission.changeId) {
        return {
          ok: false,
          mission: mission ?? null,
          change: null,
          note: "Mission or change missing",
        };
      }
      if (mission.status !== MissionStatus.RECOVERY_REQUIRED) {
        return {
          ok: false,
          mission,
          change:
            state.changes.find((c) => c.changeId === mission.changeId) ?? null,
          note: `Mission status ${mission.status} is not eligible for recovery`,
        };
      }
      const change = state.changes.find((c) => c.changeId === mission.changeId);
      if (!change) {
        return {
          ok: false,
          mission,
          change: null,
          note: "Change record missing",
        };
      }
      if (change.status !== StagingChangeStatus.UNKNOWN_REMOTE_OUTCOME) {
        return {
          ok: false,
          mission,
          change,
          note: `Change status ${change.status} is not UNKNOWN_REMOTE_OUTCOME — recovery refused`,
        };
      }
      const recovered = cms.recoverUnknown({ change, nowIso });
      if (recovered.change.status !== StagingChangeStatus.RECOVERED) {
        return {
          ok: false,
          mission,
          change: recovered.change,
          note: recovered.note,
        };
      }
      store.upsertChange(recovered.change);
      if (recovered.page) store.upsertCmsPage(recovered.page);
      const next: OwnerMissionRecord = {
        ...mission,
        status: MissionStatus.ACCEPTED_PENDING,
        updatedAtIso: nowIso,
      };
      store.upsertMission(next);
      pushEvidence({
        evidenceId: id("ev"),
        missionId: mission.missionId,
        kind: "recovery",
        title: "Staging recovery",
        summary: recovered.note,
        measurementMode: MeasurementMode.FIXTURE,
        createdAtIso: nowIso,
      });
      return {
        ok: true,
        mission: next,
        change: recovered.change,
        note: recovered.note,
      };
    },
    listEvidence(limit = 50) {
      return store.read().evidence.slice(-limit).reverse();
    },
    async seedDemo(nowIso) {
      const now = nowIso ?? new Date().toISOString();
      service.startActivation({ nowIso: now });
      service.completeActivationStep({
        stepId: ActivationStepId.WORKSPACE,
        note: "America/New_York",
        nowIso: now,
      });
      service.completeActivationStep({
        stepId: ActivationStepId.HOST_DIAGNOSTICS,
        note: "Local host diagnostics acknowledged (fixture)",
        nowIso: now,
      });
      const connections = service.ensureFixtureConnections(now);
      const site = service.registerSite({ nowIso: now });
      const created = await service.createPilotMission({
        siteId: site.siteId,
        nowIso: now,
      });
      return {
        site,
        connections,
        mission: created.mission,
        notes: [
          "Demo seeded with fixture connections, pilot site, and reviewable mission.",
          "Approve exact revision → apply staging → independent verify.",
          "Temporal label comes from the binding probe (frontend reachability); staging CMS stays simulator. Not R1-complete.",
        ],
      };
    },
  };

  return service;
}
