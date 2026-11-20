/**
 * Provider adapter scaffolds for R1-03.
 * NOT_WIRED / FIXTURE only — no live Zoho, CMS, booking, or OAuth mutations.
 */

export const packageName = "@worksocial/provider-adapters" as const;

export const AdapterStatus = {
  NOT_WIRED: "NOT_WIRED",
  FIXTURE: "FIXTURE",
  LIVE: "LIVE",
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
    capabilities: ["fixture_read_page", "fixture_read_form"],
    notes: "Fixture page/form reads only; no live CMS publish.",
  },
  {
    adapterId: "cms-source",
    providerId: "cms",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "CMS adapter scaffold — OAuth/live edits out of scope for R1-03.",
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
    ],
    notes:
      "Fixture CRM identity/module reads + correlated canary receipts. Live Zoho writes remain NOT_WIRED without owner credentials.",
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
] as const;

export function listAdapters(): AdapterDescriptor[] {
  return [...R1_03_ADAPTERS];
}

export function getAdapter(adapterId: string): AdapterDescriptor | undefined {
  return R1_03_ADAPTERS.find((a) => a.adapterId === adapterId);
}
