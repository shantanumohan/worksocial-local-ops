import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAnalysisDefinition,
  createAnalysisHypothesis,
} from "@worksocial/domain";
import { createFilePaidMediaStore } from "./paid-media-store.js";

describe("paid-media-store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-paid-media-store-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists definitions and keeps ChatGPT Ads ACCESS_BLOCKED", () => {
    const store = createFilePaidMediaStore(dir);
    const def = createAnalysisDefinition({
      definitionId: "def-1",
      siteId: "site-1",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T00:00:00.000Z",
      comparisonLabel: "prior_14d",
      reportingTimezone: "UTC",
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    store.upsertDefinition(def);
    const hyp = createAnalysisHypothesis({
      hypothesisId: "h1",
      definitionId: "def-1",
      statement: "Fixture CTA lifts bookings",
      primaryOutcome: "bookings",
      baseline: "2",
      comparison: "4",
      observationWindowDays: 14,
      createdAtIso: "2026-11-21T12:01:00.000Z",
    });
    expect(hyp.ok).toBe(true);
    if (hyp.ok) store.upsertHypothesis(hyp.hypothesis);

    const again = createFilePaidMediaStore(dir);
    expect(again.status().definitionCount).toBe(1);
    expect(again.status().hypothesisCount).toBe(1);
    expect(again.status().chatgptAdsWiring).toBe("ACCESS_BLOCKED");
    expect(again.status().liveMutationWiring).toBe("NOT_WIRED");
    expect(again.status().externalEffects).toBe("NONE");
  });
});
