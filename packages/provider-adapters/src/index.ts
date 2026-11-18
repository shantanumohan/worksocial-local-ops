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
    capabilities: ["fixture_read_module", "fixture_read_org"],
    notes: "Fixture CRM identity/module reads only; no live Zoho writes.",
  },
  {
    adapterId: "booking",
    providerId: "booking",
    status: AdapterStatus.NOT_WIRED,
    capabilities: [],
    notes: "Booking ownership mapping only; provider API not wired.",
  },
] as const;

export function listAdapters(): AdapterDescriptor[] {
  return [...R1_03_ADAPTERS];
}

export function getAdapter(adapterId: string): AdapterDescriptor | undefined {
  return R1_03_ADAPTERS.find((a) => a.adapterId === adapterId);
}
