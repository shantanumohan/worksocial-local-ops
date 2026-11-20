/**
 * File-backed content / distribution store (R1-08).
 * Schema companion: database/migrations/010_content.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyContentState,
  type CanonicalArticle,
  type ContentCampaign,
  type ContentState,
  type DestinationRegistryEntry,
  type DestinationVariant,
  type PublicationReceipt,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";

export type ContentStore = {
  readonly stateDir: string;
  read(): ContentState;
  write(state: ContentState): void;
  update(mutator: (current: ContentState) => ContentState): ContentState;
  setDestinations(destinations: DestinationRegistryEntry[]): ContentState;
  upsertCampaign(campaign: ContentCampaign): ContentState;
  upsertArticle(article: CanonicalArticle): ContentState;
  upsertVariant(variant: DestinationVariant): ContentState;
  addReceipt(receipt: PublicationReceipt): ContentState;
  addReleaseOutcome(outcome: WritePathOutcomeEvidence): ContentState;
  listCampaigns(limit?: number): ContentCampaign[];
  listArticles(limit?: number): CanonicalArticle[];
  listVariants(limit?: number): DestinationVariant[];
  listReceipts(limit?: number): PublicationReceipt[];
  status(): {
    campaignCount: number;
    articleCount: number;
    variantCount: number;
    receiptCount: number;
    destinationCount: number;
    releaseOutcomeCount: number;
    liveCmsPublishWiring: ContentState["liveCmsPublishWiring"];
    liveGbpWiring: ContentState["liveGbpWiring"];
    liveSocialWiring: ContentState["liveSocialWiring"];
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultContentStateDir(baseDir: string): string {
  return join(baseDir, "content");
}

export function createFileContentStore(stateDir: string): ContentStore {
  const contentDir = join(stateDir, "content");
  const statePath = join(contentDir, "content-state.json");

  const read = (): ContentState => {
    const existing = readJsonFile<ContentState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyContentState(new Date().toISOString());
    }
    return {
      ...existing,
      destinations: existing.destinations ?? [],
      campaigns: existing.campaigns ?? [],
      articles: existing.articles ?? [],
      variants: existing.variants ?? [],
      receipts: existing.receipts ?? [],
      releaseOutcomes: existing.releaseOutcomes ?? [],
      liveCmsPublishWiring: "NOT_WIRED",
      liveGbpWiring: "NOT_WIRED",
      liveSocialWiring: "NOT_WIRED",
    };
  };

  const write = (state: ContentState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: ContentState) => ContentState,
  ): ContentState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: contentDir,
    read,
    write,
    update,
    setDestinations: (destinations) =>
      update((state) => ({
        ...state,
        destinations,
        updatedAtIso: new Date().toISOString(),
      })),
    upsertCampaign: (campaign) =>
      update((state) => {
        const others = state.campaigns.filter(
          (c) => c.campaignId !== campaign.campaignId,
        );
        return {
          ...state,
          campaigns: [...others, campaign].slice(-500),
          updatedAtIso: campaign.updatedAtIso,
        };
      }),
    upsertArticle: (article) =>
      update((state) => {
        const others = state.articles.filter(
          (a) => a.articleId !== article.articleId,
        );
        return {
          ...state,
          articles: [...others, article].slice(-500),
          updatedAtIso: article.updatedAtIso,
        };
      }),
    upsertVariant: (variant) =>
      update((state) => {
        const others = state.variants.filter(
          (v) => v.variantId !== variant.variantId,
        );
        return {
          ...state,
          variants: [...others, variant].slice(-500),
          updatedAtIso: variant.updatedAtIso,
        };
      }),
    addReceipt: (receipt) =>
      update((state) => ({
        ...state,
        receipts: [...state.receipts, receipt].slice(-500),
        updatedAtIso: receipt.recordedAtIso,
      })),
    addReleaseOutcome: (outcome) =>
      update((state) => ({
        ...state,
        releaseOutcomes: [...state.releaseOutcomes, outcome].slice(-500),
        updatedAtIso: outcome.recordedAtIso,
      })),
    listCampaigns: (limit = 100) => {
      const rows = read().campaigns;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listArticles: (limit = 100) => {
      const rows = read().articles;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listVariants: (limit = 100) => {
      const rows = read().variants;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listReceipts: (limit = 100) => {
      const rows = read().receipts;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: () => {
      const state = read();
      return {
        campaignCount: state.campaigns.length,
        articleCount: state.articles.length,
        variantCount: state.variants.length,
        receiptCount: state.receipts.length,
        destinationCount: state.destinations.length,
        releaseOutcomeCount: state.releaseOutcomes.length,
        liveCmsPublishWiring: state.liveCmsPublishWiring,
        liveGbpWiring: state.liveGbpWiring,
        liveSocialWiring: state.liveSocialWiring,
        honestNote:
          "Article pipeline, destination variants, and gateway-gated fixture distribution. Live CMS / GBP / social remain NOT_WIRED. Gateway acceptance ≠ verified. Released claims require SUPPORTED facts only.",
      };
    },
  };
}
