import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MissionStatus, ReviewDecision } from "@worksocial/domain";
import { createFileOwnerStagingStore } from "@worksocial/persistence";
import { createStagingCmsSimulator } from "@worksocial/provider-adapters";
import { createOwnerStagingService } from "./service.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeService() {
  const dir = mkdtempSync(join(tmpdir(), "ws-owner-staging-"));
  dirs.push(dir);
  const store = createFileOwnerStagingStore(dir);
  const cms = createStagingCmsSimulator();
  return createOwnerStagingService(store, cms);
}

describe("owner staging service (M4)", () => {
  it("runs activation → mission → review → apply → independent verify", async () => {
    const svc = makeService();
    const seeded = await svc.seedDemo("2026-11-20T16:00:00.000Z");
    expect(seeded.connections).toHaveLength(3);
    expect(seeded.mission.status).toBe(MissionStatus.NEEDS_REVIEW);

    const reviewed = svc.reviewMission({
      missionId: seeded.mission.missionId,
      decision: ReviewDecision.APPROVE_EXACT,
      nowIso: "2026-11-20T16:01:00.000Z",
    });
    expect(reviewed.ok).toBe(true);
    expect(reviewed.mission?.status).toBe(MissionStatus.APPROVED);

    const applied = svc.applyStaging({
      missionId: seeded.mission.missionId,
      nowIso: "2026-11-20T16:02:00.000Z",
    });
    expect(applied.ok).toBe(true);
    expect(applied.mission?.status).toBe(MissionStatus.ACCEPTED_PENDING);
    expect(applied.change?.status).toBe("APPLIED_PENDING");

    const verified = svc.verifyStaging({
      missionId: seeded.mission.missionId,
      nowIso: "2026-11-20T16:03:00.000Z",
    });
    expect(verified.matched).toBe(true);
    expect(verified.mission?.status).toBe(MissionStatus.VERIFIED);
    expect(verified.observedFields?.title).toBe(
      seeded.mission.desiredFields.title,
    );
    // Observed must come from CMS read, not by returning the desired object alias.
    expect(verified.observedFields).not.toBe(seeded.mission.desiredFields);

    const evidence = svc.listEvidence();
    expect(evidence.some((e) => e.kind === "independent_read")).toBe(true);
    expect(svc.status().r1CompleteClaim).toBe(false);
    expect(svc.status().temporalWiring).toBe("NOT_WIRED");
  });

  it("recovers UNKNOWN_REMOTE_OUTCOME then verifies", async () => {
    const svc = makeService();
    const seeded = await svc.seedDemo("2026-11-20T17:00:00.000Z");
    svc.reviewMission({
      missionId: seeded.mission.missionId,
      decision: ReviewDecision.APPROVE_EXACT,
      nowIso: "2026-11-20T17:01:00.000Z",
    });
    const applied = svc.applyStaging({
      missionId: seeded.mission.missionId,
      forceUnknownRemote: true,
      nowIso: "2026-11-20T17:02:00.000Z",
    });
    expect(applied.mission?.status).toBe(MissionStatus.RECOVERY_REQUIRED);

    // Apply must refuse recovery-required missions.
    const reapply = svc.applyStaging({
      missionId: seeded.mission.missionId,
      nowIso: "2026-11-20T17:02:30.000Z",
    });
    expect(reapply.ok).toBe(false);
    expect(reapply.note).toMatch(/recoverStaging/i);

    const recovered = svc.recoverStaging({
      missionId: seeded.mission.missionId,
      nowIso: "2026-11-20T17:03:00.000Z",
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.mission?.status).toBe(MissionStatus.ACCEPTED_PENDING);

    // Recovery on non-UNKNOWN state must not corrupt the mission.
    const badRecover = svc.recoverStaging({
      missionId: seeded.mission.missionId,
      nowIso: "2026-11-20T17:03:30.000Z",
    });
    expect(badRecover.ok).toBe(false);
    expect(badRecover.mission?.status).toBe(MissionStatus.ACCEPTED_PENDING);

    const verified = svc.verifyStaging({
      missionId: seeded.mission.missionId,
      nowIso: "2026-11-20T17:04:00.000Z",
    });
    expect(verified.matched).toBe(true);
    expect(verified.mission?.status).toBe(MissionStatus.VERIFIED);
  });

  it("supports request-revision then revise-and-resubmit", async () => {
    const svc = makeService();
    const seeded = await svc.seedDemo("2026-11-20T19:00:00.000Z");
    const requested = svc.reviewMission({
      missionId: seeded.mission.missionId,
      decision: ReviewDecision.REQUEST_REVISION,
      nowIso: "2026-11-20T19:01:00.000Z",
    });
    expect(requested.mission?.status).toBe(MissionStatus.DRAFT);
    const revised = svc.reviseMission({
      missionId: seeded.mission.missionId,
      desiredFields: {
        title: "Revised title",
        metaDescription: "Revised meta",
        h1: "Revised h1",
        bodyExcerpt: "Revised body",
      },
      nowIso: "2026-11-20T19:02:00.000Z",
    });
    expect(revised.ok).toBe(true);
    expect(revised.mission?.status).toBe(MissionStatus.NEEDS_REVIEW);
    expect(revised.mission?.desiredFields.title).toBe("Revised title");
  });

  it("snapshots from the registered staging CMS page", async () => {
    const svc = makeService();
    const site = svc.registerSite({
      pilotPageTitle: "Custom pilot title",
      nowIso: "2026-11-20T20:00:00.000Z",
    });
    const evidence = await svc.captureEvidence({
      siteId: site.siteId,
      nowIso: "2026-11-20T20:01:00.000Z",
    });
    expect(evidence.snapshot.title).toBe("Custom pilot title");
  });

  it("labels GSC/GA4 measurements as FIXTURE without credentials", async () => {
    const svc = makeService();
    const site = svc.registerSite({
      nowIso: "2026-11-20T18:00:00.000Z",
    });
    const evidence = await svc.captureEvidence({
      siteId: site.siteId,
      nowIso: "2026-11-20T18:01:00.000Z",
    });
    expect(evidence.snapshot.measurementMode).toBe("FIXTURE");
    expect(evidence.gsc.measurementMode).toBe("FIXTURE");
    expect(evidence.ga4.measurementMode).toBe("FIXTURE");
  });
});
