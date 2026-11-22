import { describe, expect, it } from "vitest";
import {
  CmsEnvironment,
  StagingChangeStatus,
  digestFields,
  type StagingCmsPageRecord,
} from "@worksocial/domain";
import { createStagingCmsSimulator } from "./staging-cms.js";
import {
  capturePageSnapshot,
  readGa4Observations,
  readGscObservations,
} from "./collectors.js";

const now = "2026-11-20T15:00:00.000Z";

function seedPage(): StagingCmsPageRecord {
  const fields = {
    title: "Quiet desks near the PATH",
    metaDescription: "Book a tour",
    h1: "Quiet desks near the PATH",
    bodyExcerpt: "Book a tour of our Jersey City pilot floor.",
  };
  return {
    pageId: "page-pilot",
    siteId: "site-pilot",
    path: "/pilot",
    fields,
    revision: "rev_seed",
    contentDigest: digestFields(fields),
    updatedAtIso: now,
  };
}

describe("staging CMS simulator (NEXT-15)", () => {
  it("applies a change then verifies via independent read (not desired copy)", () => {
    const cms = createStagingCmsSimulator([seedPage()]);
    const desired = {
      title: "Quiet desks near PATH — updated",
      metaDescription: "Book a tour today",
      h1: "Quiet desks near PATH",
      bodyExcerpt: "Updated body for staging.",
    };
    const applied = cms.applyChange({
      changeId: "chg-1",
      missionId: "mis-1",
      pageId: "page-pilot",
      desiredFields: desired,
      nowIso: now,
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
    });
    expect(applied.change.status).toBe(StagingChangeStatus.APPLIED_PENDING);
    expect(applied.providerMutateCount).toBe(1);
    expect(applied.page?.fields.title).toBe(desired.title);

    const read = cms.independentRead({
      change: applied.change,
      nowIso: now,
    });
    expect(read.matched).toBe(true);
    expect(read.observedFields).toEqual(desired);
    expect(read.change.status).toBe(StagingChangeStatus.VERIFIED);
    // Observed came from ledger, not by aliasing the desired object.
    expect(read.observedFields).not.toBe(applied.change.desiredFields);
  });

  it("supports UNKNOWN_REMOTE_OUTCOME recovery then independent verify", () => {
    const cms = createStagingCmsSimulator([seedPage()]);
    const desired = {
      title: "Recovered title",
      metaDescription: "Recovered meta",
      h1: "Recovered h1",
      bodyExcerpt: "Recovered body",
    };
    const applied = cms.applyChange({
      changeId: "chg-2",
      missionId: "mis-2",
      pageId: "page-pilot",
      desiredFields: desired,
      nowIso: now,
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      forceUnknownRemote: true,
    });
    expect(applied.change.status).toBe(
      StagingChangeStatus.UNKNOWN_REMOTE_OUTCOME,
    );
    expect(applied.providerMutateCount).toBe(0);
    const recovered = cms.recoverUnknown({
      change: applied.change,
      nowIso: now,
    });
    expect(recovered.change.status).toBe(StagingChangeStatus.RECOVERED);
    const read = cms.independentRead({
      change: recovered.change,
      nowIso: now,
    });
    expect(read.matched).toBe(true);
    expect(read.change.status).toBe(StagingChangeStatus.VERIFIED);
  });

  it("refuses wrong CMS environment mutate without provider write (T-X007)", () => {
    const cms = createStagingCmsSimulator([seedPage()]);
    const before = cms.getPage("page-pilot")!;
    const refused = cms.applyChange({
      changeId: "chg-wrong-env",
      missionId: "mis-wrong",
      pageId: "page-pilot",
      desiredFields: {
        title: "Should not apply",
        metaDescription: "x",
        h1: "x",
        bodyExcerpt: "x",
      },
      nowIso: now,
      boundEnvironment: CmsEnvironment.PRODUCTION,
      intendedEnvironment: CmsEnvironment.STAGING,
    });
    expect(refused.environmentGate.ok).toBe(false);
    if (!refused.environmentGate.ok) {
      expect(refused.environmentGate.code).toBe("WRONG_CMS_ENVIRONMENT");
    }
    expect(refused.providerMutateCount).toBe(0);
    expect(refused.change.status).toBe(StagingChangeStatus.MISMATCH);
    expect(cms.getPage("page-pilot")?.revision).toBe(before.revision);
    expect(cms.getPage("page-pilot")?.fields.title).toBe(before.fields.title);
  });
});

describe("collectors (NEXT-14)", () => {
  it("labels fixture page snapshots and GSC/GA4 observations", async () => {
    const snap = await capturePageSnapshot({
      snapshotId: "snap-1",
      siteId: "site-pilot",
      pagePath: "/pilot",
      nowIso: now,
    });
    expect(snap.measurementMode).toBe("FIXTURE");
    expect(snap.usedLiveFetch).toBe(false);
    expect(snap.snapshot.checks.length).toBeGreaterThan(0);

    const gsc = readGscObservations({ observationId: "gsc-1", nowIso: now });
    expect(gsc.measurementMode).toBe("FIXTURE");
    expect(gsc.observation.note).toMatch(/FIXTURE/i);

    const ga4 = readGa4Observations({ observationId: "ga4-1", nowIso: now });
    expect(ga4.measurementMode).toBe("FIXTURE");
    expect(ga4.observation.kind).toBe("ga4");
  });

  it("rejects private live snapshot URLs before fetch", async () => {
    const snap = await capturePageSnapshot({
      snapshotId: "snap-ssrf",
      siteId: "site-pilot",
      pagePath: "/pilot",
      nowIso: now,
      preferLive: true,
      liveUrl: "http://127.0.0.1/latest/meta-data/",
      allowedOrigins: ["example.com"],
    });
    expect(snap.usedLiveFetch).toBe(false);
    expect(snap.measurementMode).toBe("FIXTURE");
    expect(snap.note).toMatch(/refused|failed|https|hostname|allowlist/i);
  });
});
