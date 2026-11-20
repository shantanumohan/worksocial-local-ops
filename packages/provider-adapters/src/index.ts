/**
 * Provider adapter scaffolds for R1-03 + M4 collectors / staging CMS.
 * NOT_WIRED / FIXTURE / SIMULATOR — no live Zoho/CMS/booking mutations by default.
 */

export const packageName = "@worksocial/provider-adapters" as const;

export const AdapterStatus = {
  NOT_WIRED: "NOT_WIRED",
  FIXTURE: "FIXTURE",
  LIVE: "LIVE",
  SIMULATOR: "SIMULATOR",
} as const;

export type AdapterStatusValue =
  (typeof AdapterStatus)[keyof typeof AdapterStatus];

export type AdapterDescriptor = {
  adapterId: string;
  providerId: string;
  status: AdapterStatusValue;
  /** Honest capability claim — never implies connected/authorized/verified. */
  capabilities: string[];
  notes: string;
};

export const R1_03_ADAPTERS: readonly AdapterDescriptor[] = [
  {
    adapterId: "owned-site-http",
    providerId: "owned-site",
    status: AdapterStatus.FIXTURE,
    capabilities: ["fixture_read_page", "fixture_read_form", "page_snapshot"],
    notes:
      "Fixture page/form reads + M4 page snapshot collector. Live crawl optional and labeled.",
  },
  {
    adapterId: "cms-source",
    providerId: "cms",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "CMS adapter scaffold — OAuth/live edits out of scope for R1-03.",
  },
  {
    adapterId: "staging-cms-simulator",
    providerId: "cms",
    status: AdapterStatus.SIMULATOR,
    capabilities: [
      "staging_apply",
      "independent_read_back",
      "unknown_remote_recovery",
    ],
    notes:
      "M4 / NEXT-15 staging CMS simulator. Apply ≠ verified. Independent read-back required. Live CMS remains NOT_WIRED without credentials.",
  },
  {
    adapterId: "repo-source",
    providerId: "repo",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "Repo binding scaffold — no git mutations in R1-03.",
  },
  {
    adapterId: "zoho-crm",
    providerId: "crm",
    status: AdapterStatus.FIXTURE,
    capabilities: [
      "fixture_read_module",
      "fixture_read_org",
      "fixture_canary_receipt",
      "fixture_field_verify",
      "fixture_synthetic_cleanup",
    ],
    notes:
      "M5 fixture CRM write/verify/cleanup + correlated canary receipts. Synthetic leads excluded from commerce. Live Zoho writes remain NOT_WIRED.",
  },
  {
    adapterId: "zoho-crm-live",
    providerId: "crm",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live Zoho CRM adapter scaffold — NOT_WIRED until owner credentials and org validation exist (R1-05).",
  },
  {
    adapterId: "booking",
    providerId: "booking",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "Booking ownership mapping only; provider API not wired.",
  },
  {
    adapterId: "demand-fixture",
    providerId: "demand",
    status: AdapterStatus.FIXTURE,
    capabilities: [
      "fixture_trend_observations",
      "fixture_faq_clusters",
      "fixture_rank_samples",
    ],
    notes:
      "R1-06 fixture demand/trend/FAQ/rank observations with honest support labels. No live SERP.",
  },
  {
    adapterId: "serp-live",
    providerId: "demand",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "Live SERP / search-result research — NOT_WIRED (R1-06).",
  },
  {
    adapterId: "google-trends-live",
    providerId: "demand",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "Live Google Trends API — NOT_WIRED; access-controlled and not assumed (R1-06).",
  },
  {
    adapterId: "gsc-collector",
    providerId: "gsc",
    status: AdapterStatus.FIXTURE,
    capabilities: ["fixture_search_analytics", "live_if_credentials"],
    notes:
      "M4 / NEXT-14 GSC collector. FIXTURE by default; LIVE only when WORKSOCIAL_GSC_* credentials exist. Preserves measurement provenance.",
  },
  {
    adapterId: "ga4-collector",
    providerId: "ga4",
    status: AdapterStatus.FIXTURE,
    capabilities: ["fixture_analytics", "live_if_credentials"],
    notes:
      "M4 / NEXT-14 GA4 collector. FIXTURE by default; LIVE only when WORKSOCIAL_GA4_* credentials exist. Preserves measurement provenance.",
  },
  {
    adapterId: "seo-fixture-pages",
    providerId: "owned-site",
    status: AdapterStatus.FIXTURE,
    capabilities: [
      "fixture_page_audit",
      "fixture_schema_validate",
      "fixture_semantic_search",
      "fixture_pilot_page_release",
    ],
    notes:
      "R1-07 golden page audits, schema validation, semantic catalog, gateway-gated fixture page release. No live CMS mutation.",
  },
  {
    adapterId: "cms-publish-live",
    providerId: "cms",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live CMS publish — NOT_WIRED (R1-07/R1-08). Acceptance ≠ verified; no silent live site mutation.",
  },
  {
    adapterId: "content-fixture-distribution",
    providerId: "content",
    status: AdapterStatus.FIXTURE,
    capabilities: [
      "fixture_article_pipeline",
      "fixture_destination_variants",
      "fixture_cms_release",
      "fixture_gbp_release",
      "fixture_social_release",
    ],
    notes:
      "R1-08 fixture article pipeline + gateway-gated CMS/GBP/social receipts. Canonical-first distribution. Acceptance ≠ verified.",
  },
  {
    adapterId: "gbp-publish-live",
    providerId: "gbp",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live Google Business Profile publish — NOT_WIRED (R1-08) without ownership verification and credentials.",
  },
  {
    adapterId: "linkedin-publish-live",
    providerId: "linkedin",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live LinkedIn organization posts — NOT_WIRED (R1-08) without org role and credentials.",
  },
  {
    adapterId: "facebook-publish-live",
    providerId: "facebook",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live Facebook/Instagram posts — NOT_WIRED (R1-08) without app review/scopes.",
  },
  {
    adapterId: "inbox-fixture",
    providerId: "inbox",
    status: AdapterStatus.FIXTURE,
    capabilities: [
      "fixture_inbound_ingest",
      "fixture_outbound_send",
      "fixture_takeover",
      "fixture_handoff",
    ],
    notes:
      "R1-09 fixture inbox ingest/send/takeover/handoff. Live inbox providers remain NOT_WIRED.",
  },
  {
    adapterId: "inbox-email-live",
    providerId: "inbox",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live email inbox — NOT_WIRED (R1-09) without owner credentials and provider binding.",
  },
  {
    adapterId: "inbox-webchat-live",
    providerId: "inbox",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes:
      "Live web chat — NOT_WIRED (R1-09). Host-down must use hosted contact path, not pretend receipt.",
  },
  {
    adapterId: "zoho-crm-lead-fixture",
    providerId: "crm",
    status: AdapterStatus.FIXTURE,
    capabilities: ["fixture_log_qualified_lead"],
    notes:
      "R1-09 fixture Zoho qualified-lead logging from after-hours concierge. Synthetic leads excluded from commercial totals.",
  },
  {
    adapterId: "gbp-fixture-simulator",
    providerId: "gbp",
    status: AdapterStatus.SIMULATOR,
    capabilities: [
      "fixture_gbp_short_update",
      "independent_read_back",
      "unknown_remote_recovery",
    ],
    notes:
      "M6/NEXT-17 GBP fixture simulator — per-destination format, receipt, independent read-back. Live GBP remains NOT_WIRED.",
  },
  {
    adapterId: "linkedin-fixture-simulator",
    providerId: "linkedin",
    status: AdapterStatus.SIMULATOR,
    capabilities: [
      "fixture_linkedin_post",
      "independent_read_back",
      "unknown_remote_recovery",
    ],
    notes:
      "M6/NEXT-17 LinkedIn social fixture simulator (single social destination). Live LinkedIn remains NOT_WIRED.",
  },
] as const;

export function listAdapters(): AdapterDescriptor[] {
  return [...R1_03_ADAPTERS];
}

export function getAdapter(adapterId: string): AdapterDescriptor | undefined {
  return R1_03_ADAPTERS.find((a) => a.adapterId === adapterId);
}

export {
  FIXTURE_PILOT_HTML,
  capturePageSnapshot,
  htmlFromStagingFields,
  readGscObservations,
  readGa4Observations,
  collectorCredentialHints,
  type PageSnapshotCollectorInput,
  type PageSnapshotCollectorResult,
  type MeasurementCollectorResult,
} from "./collectors.js";

export {
  validateLiveCollectorUrl,
  validateCollectorRedirectTarget,
  type CollectorUrlPolicyVerdict,
} from "./url-policy.js";

export {
  createStagingCmsSimulator,
  createStagingCmsAdapter,
  stagingCmsLiveAvailable,
  type StagingCmsSimulator,
} from "./staging-cms.js";

export {
  createZohoCrmFixtureAdapter,
  liveZohoCrmStub,
  type ZohoCrmFixtureAdapter,
  type FixtureCrmWriteInput,
  type FixtureCrmCleanupResult,
  type FixtureCrmLedgerEntry,
} from "./zoho-crm-fixture.js";

export {
  createGbpFixtureSimulator,
  createLinkedInFixtureSimulator,
  liveGbpUnavailable,
  liveLinkedInUnavailable,
  type GbpFixtureSimulator,
  type LinkedInFixtureSimulator,
  type GbpPostRecord,
  type SocialPostRecord,
  type DestinationApplyResult,
  type DestinationReadResult,
} from "./gbp-social-fixture.js";
