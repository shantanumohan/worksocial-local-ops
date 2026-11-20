import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCanonicalArticle,
  createContentBrief,
  createContentCampaign,
  defaultDestinationRegistry,
} from "@worksocial/domain";
import { createFileContentStore } from "./content-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("content-store", () => {
  it("persists campaigns, articles, and honest NOT_WIRED wiring", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-content-"));
    dirs.push(dir);
    const store = createFileContentStore(dir);
    const now = "2026-11-19T18:30:00.000Z";

    store.setDestinations(defaultDestinationRegistry());
    const campaign = createContentCampaign({
      campaignId: "camp-1",
      title: "Training day",
      topic: "corporate training",
      brief: createContentBrief({
        briefId: "brief-1",
        audienceNeed: "training rooms",
        practicalValue: "planning checklist",
        intendedAction: "book inquiry",
        createdAtIso: now,
      }),
      fixtureOnly: true,
      createdAtIso: now,
    });
    store.upsertCampaign(campaign);
    store.upsertArticle(
      createCanonicalArticle({
        articleId: "art-1",
        campaignId: "camp-1",
        title: "A better brief",
        body: "Start with the learning outcome.",
        fixtureOnly: true,
        createdAtIso: now,
      }),
    );

    const reloaded = createFileContentStore(dir);
    const status = reloaded.status();
    expect(status.campaignCount).toBe(1);
    expect(status.articleCount).toBe(1);
    expect(status.destinationCount).toBeGreaterThan(0);
    expect(status.liveCmsPublishWiring).toBe("NOT_WIRED");
    expect(status.liveGbpWiring).toBe("NOT_WIRED");
    expect(status.liveSocialWiring).toBe("NOT_WIRED");
    expect(reloaded.listArticles()[0]?.title).toBe("A better brief");
  });
});
