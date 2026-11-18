/**
 * R1-03 production mapping: site/CMS/repo bindings, forms, booking/CRM ownership,
 * journey registry, and read-evidence gates for pilot write paths.
 *
 * Honest status only — connection ≠ permission ≠ verified outcome.
 * Adapters may be NOT_WIRED or FIXTURE; never pretend live readiness.
 */

import {
  ActionClass,
  type ActionClassValue,
} from "./standing-authority.js";
import {
  ConnectionState,
  WriteReadiness,
  VerificationState,
  buildProviderStatusView,
  type ConnectionStateValue,
  type WriteReadinessValue,
  type VerificationStateValue,
  type ProviderStatusView,
} from "./connection-status.js";

export const AdapterWiring = {
  NOT_WIRED: "NOT_WIRED",
  FIXTURE: "FIXTURE",
  LIVE: "LIVE",
} as const;

export type AdapterWiringValue =
  (typeof AdapterWiring)[keyof typeof AdapterWiring];

export const BindingKind = {
  WEBSITE: "website",
  CMS: "cms",
  REPO: "repo",
} as const;

export type BindingKindValue = (typeof BindingKind)[keyof typeof BindingKind];

export const EvidenceKind = {
  IDENTITY: "identity",
  RESOURCE: "resource",
  SCOPE: "scope",
  CAPABILITY_TEST: "capability_test",
  READ_BACK: "read_back",
} as const;

export type EvidenceKindValue = (typeof EvidenceKind)[keyof typeof EvidenceKind];

/** Default required evidence for a pilot publish / form-to-CRM write path. */
export const DEFAULT_PILOT_EVIDENCE_KINDS: EvidenceKindValue[] = [
  EvidenceKind.IDENTITY,
  EvidenceKind.RESOURCE,
  EvidenceKind.SCOPE,
  EvidenceKind.CAPABILITY_TEST,
  EvidenceKind.READ_BACK,
];

export const ResourceOwnerSystem = {
  WEBSITE: "website",
  CMS: "cms",
  REPO: "repo",
  CRM: "crm",
  BOOKING: "booking",
  MANUAL: "manual",
} as const;

export type ResourceOwnerSystemValue =
  (typeof ResourceOwnerSystem)[keyof typeof ResourceOwnerSystem];

/** Site / CMS / repository binding — identity + resource, not write permission. */
export type SourceBinding = {
  bindingId: string;
  siteId: string;
  kind: BindingKindValue;
  /** Canonical URL, CMS item id, or repo path/ref — never a secret. */
  resourceRef: string;
  displayName: string;
  /** Observed account/identity label from a read (fixture or live). */
  identityLabel: string | null;
  connectionState: ConnectionStateValue;
  writeReadiness: WriteReadinessValue;
  verificationState: VerificationStateValue;
  /** Ownership proven via read evidence (not assumed from config). */
  ownershipProven: boolean;
  observedRevision: string | null;
  adapterWiring: AdapterWiringValue;
  createdAtIso: string;
  updatedAtIso: string;
};

export type FormMapping = {
  formId: string;
  siteId: string;
  pageAssetId: string;
  bindingId: string;
  handlerEndpoint: string;
  crmModuleId: string | null;
  /** Field name → CRM field; ownership of each field is tracked separately. */
  fieldMap: Record<string, string>;
  ownershipOwner: ResourceOwnerSystemValue;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BookingOwnership = {
  bookingOwnershipId: string;
  siteId: string;
  providerId: string;
  resourceId: string;
  environment: "fixture" | "sandbox" | "production";
  ownerSystem: ResourceOwnerSystemValue;
  /** True only after a successful read of the booking resource. */
  ownershipProven: boolean;
  adapterWiring: AdapterWiringValue;
  createdAtIso: string;
  updatedAtIso: string;
};

export type CrmFieldOwnership = {
  fieldName: string;
  ownerSystem: ResourceOwnerSystemValue;
};

export type CrmOwnership = {
  crmOwnershipId: string;
  organizationId: string;
  environment: "fixture" | "sandbox" | "production";
  moduleId: string;
  fieldOwnership: CrmFieldOwnership[];
  testDataPolicy: string;
  /** True only after identity + org/module read evidence. */
  ownershipProven: boolean;
  adapterWiring: AdapterWiringValue;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ReadEvidenceRecord = {
  evidenceId: string;
  /** Pilot write path this evidence unlocks (may cover multiple ops). */
  writePathId: string;
  evidenceKind: EvidenceKindValue;
  resourceType: "binding" | "form" | "booking" | "crm" | "journey";
  resourceId: string;
  /** Capability or read operation that was exercised. */
  operation: string;
  /** Short non-secret summary of what was observed. */
  summary: string;
  /** Fixture/stub evidence is allowed in R1-03; never labeled LIVE. */
  fixtureOnly: boolean;
  observedAtIso: string;
};

/**
 * Durable success/failure labels for a pilot write path.
 * Hook for a later local multi-model learning-worker (see docs/ml-learning-from-outcomes.md).
 * R1-03 records labels only — no ML frameworks, training, or authority expansion.
 */
export const OutcomeLabel = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  UNKNOWN: "UNKNOWN",
} as const;

export type OutcomeLabelValue =
  (typeof OutcomeLabel)[keyof typeof OutcomeLabel];

export const OutcomeEvidenceSource = {
  GATEWAY_RECEIPT: "gateway_receipt",
  READ_BACK: "read_back",
  JOURNEY_VERIFICATION: "journey_verification",
  OWNER_DECISION: "owner_decision",
  STOP_SWITCH: "stop_switch",
  FIXTURE: "fixture",
} as const;

export type OutcomeEvidenceSourceValue =
  (typeof OutcomeEvidenceSource)[keyof typeof OutcomeEvidenceSource];

export type WritePathOutcomeEvidence = {
  outcomeId: string;
  writePathId: string;
  operationId: string;
  label: OutcomeLabelValue;
  source: OutcomeEvidenceSourceValue;
  /** Non-secret feature hints for a future learner (ids, codes, stages). */
  featureHints: Record<string, string | number | boolean | null>;
  summary: string;
  fixtureOnly: boolean;
  recordedAtIso: string;
};

export type PilotWritePath = {
  writePathId: string;
  channelId: string;
  assetId: string;
  operation: string;
  siteId: string;
  bindingId: string | null;
  formId: string | null;
  bookingOwnershipId: string | null;
  crmOwnershipId: string | null;
  /** Evidence kinds that must exist before this write may proceed. */
  requiredEvidenceKinds: EvidenceKindValue[];
  createdAtIso: string;
};

export type JourneyRegistryEntry = {
  journeyId: string;
  siteId: string;
  displayName: string;
  /** Ordered stage labels for the pilot journey graph. */
  stages: string[];
  writePathIds: string[];
  createdAtIso: string;
};

export type ProductionMappingState = {
  version: 1;
  sites: string[];
  bindings: SourceBinding[];
  forms: FormMapping[];
  bookingOwnership: BookingOwnership[];
  crmOwnership: CrmOwnership[];
  writePaths: PilotWritePath[];
  journeys: JourneyRegistryEntry[];
  readEvidence: ReadEvidenceRecord[];
  /** Labeled outcomes for future learning-worker consumption (no ML in R1-03). */
  writePathOutcomes: WritePathOutcomeEvidence[];
  updatedAt: string;
};

export type PilotWriteGateResult = {
  ownershipProven: boolean;
  readEvidencePresent: boolean;
  prerequisiteMissing: boolean;
  details: string[];
  matchedWritePath: PilotWritePath | null;
  missingEvidenceKinds: EvidenceKindValue[];
};

export function emptyProductionMappingState(
  nowIso: string,
): ProductionMappingState {
  return {
    version: 1,
    sites: [],
    bindings: [],
    forms: [],
    bookingOwnership: [],
    crmOwnership: [],
    writePaths: [],
    journeys: [],
    readEvidence: [],
    writePathOutcomes: [],
    updatedAt: nowIso,
  };
}

/**
 * Append a labeled write-path outcome. Does not train models or change grants.
 * Learning-worker may later consume `listWritePathOutcomesForLearning`.
 */
const OUTCOME_EVIDENCE_SOURCES: ReadonlySet<string> = new Set(
  Object.values(OutcomeEvidenceSource),
);

export function isOutcomeEvidenceSource(
  value: string,
): value is OutcomeEvidenceSourceValue {
  return OUTCOME_EVIDENCE_SOURCES.has(value);
}

export function recordWritePathOutcome(input: {
  outcomeId: string;
  writePathId: string;
  operationId: string;
  label: OutcomeLabelValue;
  source: OutcomeEvidenceSourceValue;
  featureHints?: Record<string, string | number | boolean | null>;
  summary: string;
  fixtureOnly: boolean;
  recordedAtIso: string;
}): WritePathOutcomeEvidence {
  if (!isOutcomeEvidenceSource(input.source)) {
    throw new Error(`Unrecognized outcome evidence source: ${String(input.source)}`);
  }
  if (input.source === OutcomeEvidenceSource.FIXTURE && !input.fixtureOnly) {
    throw new Error("FIXTURE outcome source must set fixtureOnly=true");
  }
  return {
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    label: input.label,
    source: input.source,
    featureHints: input.featureHints ?? {},
    summary: input.summary,
    fixtureOnly: input.fixtureOnly,
    recordedAtIso: input.recordedAtIso,
  };
}

/** True when every referenced binding/CRM/booking for a path is fixture-wired. */
export function writePathIsFixtureOnly(
  mapping: ProductionMappingState,
  path: PilotWritePath,
): boolean {
  if (path.bindingId) {
    const binding = mapping.bindings.find((b) => b.bindingId === path.bindingId);
    if (!binding || binding.adapterWiring !== AdapterWiring.FIXTURE) {
      return false;
    }
  }
  if (path.crmOwnershipId) {
    const crm = mapping.crmOwnership.find(
      (c) => c.crmOwnershipId === path.crmOwnershipId,
    );
    if (
      !crm ||
      crm.adapterWiring !== AdapterWiring.FIXTURE ||
      crm.environment !== "fixture"
    ) {
      return false;
    }
  }
  if (path.bookingOwnershipId) {
    const booking = mapping.bookingOwnership.find(
      (b) => b.bookingOwnershipId === path.bookingOwnershipId,
    );
    // Fixture pilots may leave booking NOT_WIRED; still require fixture environment.
    if (
      !booking ||
      booking.environment !== "fixture" ||
      booking.adapterWiring === AdapterWiring.LIVE
    ) {
      return false;
    }
  }
  if (path.formId) {
    const form = mapping.forms.find((f) => f.formId === path.formId);
    if (!form) {
      return false;
    }
    const formBinding = mapping.bindings.find((b) => b.bindingId === form.bindingId);
    if (!formBinding || formBinding.adapterWiring !== AdapterWiring.FIXTURE) {
      return false;
    }
  }
  return true;
}

export function assertNonEmptyEvidenceKinds(
  kinds: EvidenceKindValue[],
): EvidenceKindValue[] {
  if (kinds.length === 0) {
    throw new Error("requiredEvidenceKinds must be non-empty for pilot write paths");
  }
  return kinds;
}

/** Allowed resource ids for evidence against a write path. */
export function allowedEvidenceResources(
  mapping: ProductionMappingState,
  path: PilotWritePath,
): Array<{ resourceType: ReadEvidenceRecord["resourceType"]; resourceId: string }> {
  const allowed: Array<{
    resourceType: ReadEvidenceRecord["resourceType"];
    resourceId: string;
  }> = [];
  if (path.bindingId) {
    allowed.push({ resourceType: "binding", resourceId: path.bindingId });
  }
  if (path.formId) {
    allowed.push({ resourceType: "form", resourceId: path.formId });
  }
  if (path.bookingOwnershipId) {
    allowed.push({
      resourceType: "booking",
      resourceId: path.bookingOwnershipId,
    });
  }
  if (path.crmOwnershipId) {
    allowed.push({ resourceType: "crm", resourceId: path.crmOwnershipId });
  }
  for (const journey of mapping.journeys) {
    if (journey.writePathIds.includes(path.writePathId)) {
      allowed.push({ resourceType: "journey", resourceId: journey.journeyId });
    }
  }
  return allowed;
}

function evidenceAppliesToPath(
  mapping: ProductionMappingState,
  path: PilotWritePath,
  evidence: ReadEvidenceRecord,
): boolean {
  if (evidence.writePathId !== path.writePathId) {
    return false;
  }
  return allowedEvidenceResources(mapping, path).some(
    (r) =>
      r.resourceType === evidence.resourceType &&
      r.resourceId === evidence.resourceId,
  );
}

/**
 * Stable projection for a future `services/learning-worker`.
 * Returns only labeled SUCCESS/FAILURE rows (UNKNOWN excluded from training labels).
 */
export function listWritePathOutcomesForLearning(
  state: ProductionMappingState,
  options: { includeFixture?: boolean } = {},
): WritePathOutcomeEvidence[] {
  const includeFixture = options.includeFixture ?? false;
  return state.writePathOutcomes.filter((row) => {
    if (row.label === OutcomeLabel.UNKNOWN) {
      return false;
    }
    if (row.fixtureOnly && !includeFixture) {
      return false;
    }
    return true;
  });
}

export function actionClassRequiresPilotWriteGates(
  actionClass: ActionClassValue,
): boolean {
  return (
    actionClass !== ActionClass.OBSERVE && actionClass !== ActionClass.CREATE
  );
}

export function bindingStatusView(binding: SourceBinding): ProviderStatusView {
  return buildProviderStatusView({
    providerId: `${binding.kind}:${binding.bindingId}`,
    connectionState: binding.connectionState,
    writeReadiness: binding.writeReadiness,
    verificationState: binding.verificationState,
  });
}

/**
 * Record an onboarding / capability-test read. Does not grant write permission.
 * LIVE wiring is refused here — R1-03 adapters are NOT_WIRED or FIXTURE only.
 */
export function createReadEvidence(input: {
  evidenceId: string;
  writePathId: string;
  evidenceKind: EvidenceKindValue;
  resourceType: ReadEvidenceRecord["resourceType"];
  resourceId: string;
  operation: string;
  summary: string;
  fixtureOnly: boolean;
  observedAtIso: string;
  adapterWiring: AdapterWiringValue;
}): ReadEvidenceRecord {
  if (input.adapterWiring === AdapterWiring.LIVE) {
    throw new Error(
      "R1-03 refuses LIVE adapter evidence; use FIXTURE or NOT_WIRED scaffold only",
    );
  }
  if (input.adapterWiring === AdapterWiring.NOT_WIRED && !input.fixtureOnly) {
    throw new Error(
      "NOT_WIRED adapters cannot claim non-fixture read evidence",
    );
  }
  return {
    evidenceId: input.evidenceId,
    writePathId: input.writePathId,
    evidenceKind: input.evidenceKind,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    operation: input.operation,
    summary: input.summary,
    fixtureOnly: true,
    observedAtIso: input.observedAtIso,
  };
}

/**
 * Apply a fixture identity/resource read onto a binding without inventing WRITE_READY.
 */
export function applyBindingReadEvidence(
  binding: SourceBinding,
  input: {
    identityLabel: string;
    observedRevision: string | null;
    ownershipProven: boolean;
    nowIso: string;
  },
): SourceBinding {
  if (binding.adapterWiring === AdapterWiring.LIVE) {
    throw new Error("LIVE bindings are out of scope for R1-03");
  }
  return {
    ...binding,
    identityLabel: input.identityLabel,
    observedRevision: input.observedRevision,
    ownershipProven: input.ownershipProven,
    connectionState: input.ownershipProven
      ? ConnectionState.READ_READY
      : ConnectionState.IDENTITY_BOUND,
    // Connection/read never authorizes writes by itself.
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.NOT_VERIFIED,
    updatedAtIso: input.nowIso,
  };
}

function findWritePath(
  mapping: ProductionMappingState,
  input: {
    writePathId: string | null | undefined;
    channelId: string;
    assetId: string;
    operation: string;
  },
): PilotWritePath | null {
  if (input.writePathId) {
    const byId = mapping.writePaths.find(
      (p) => p.writePathId === input.writePathId,
    );
    if (!byId) {
      return null;
    }
    // Explicit id must still match the submitted intent fields (fail closed).
    if (
      byId.channelId !== input.channelId ||
      byId.assetId !== input.assetId ||
      byId.operation !== input.operation
    ) {
      return null;
    }
    return byId;
  }
  return (
    mapping.writePaths.find(
      (p) =>
        p.channelId === input.channelId &&
        p.assetId === input.assetId &&
        p.operation === input.operation,
    ) ?? null
  );
}

function ownershipForWritePath(
  mapping: ProductionMappingState,
  path: PilotWritePath,
): { proven: boolean; details: string[] } {
  const details: string[] = [];
  let proven = true;

  if (path.bindingId) {
    const binding = mapping.bindings.find((b) => b.bindingId === path.bindingId);
    if (!binding) {
      proven = false;
      details.push(`Missing source binding ${path.bindingId}`);
    } else if (!binding.ownershipProven) {
      proven = false;
      details.push(`Binding ${path.bindingId} ownership not proven by read`);
    }
  }

  if (path.formId) {
    const form = mapping.forms.find((f) => f.formId === path.formId);
    if (!form) {
      proven = false;
      details.push(`Missing form mapping ${path.formId}`);
    } else if (form.siteId !== path.siteId || form.pageAssetId !== path.assetId) {
      proven = false;
      details.push(
        `Form ${path.formId} does not belong to write target ${path.siteId}/${path.assetId}`,
      );
    } else {
      const formBinding = mapping.bindings.find(
        (b) => b.bindingId === form.bindingId,
      );
      if (!formBinding?.ownershipProven) {
        proven = false;
        details.push(
          `Form ${path.formId} page/source binding ownership not proven`,
        );
      }
      if (form.crmModuleId) {
        const crm = path.crmOwnershipId
          ? mapping.crmOwnership.find(
              (c) => c.crmOwnershipId === path.crmOwnershipId,
            )
          : mapping.crmOwnership.find(
              (c) => c.moduleId === form.crmModuleId && c.ownershipProven,
            );
        if (!crm?.ownershipProven) {
          proven = false;
          details.push(
            `Form ${path.formId} CRM module ownership not proven`,
          );
        } else if (crm.moduleId !== form.crmModuleId) {
          proven = false;
          details.push(
            `CRM ownership module ${crm.moduleId} does not match form module ${form.crmModuleId}`,
          );
        }
      }
    }
  }

  if (path.bookingOwnershipId) {
    const booking = mapping.bookingOwnership.find(
      (b) => b.bookingOwnershipId === path.bookingOwnershipId,
    );
    if (!booking?.ownershipProven) {
      proven = false;
      details.push(
        `Booking ownership ${path.bookingOwnershipId} not proven by read`,
      );
    }
  }

  if (path.crmOwnershipId) {
    const crm = mapping.crmOwnership.find(
      (c) => c.crmOwnershipId === path.crmOwnershipId,
    );
    if (!crm?.ownershipProven) {
      proven = false;
      details.push(`CRM ownership ${path.crmOwnershipId} not proven by read`);
    } else if (path.formId) {
      const form = mapping.forms.find((f) => f.formId === path.formId);
      if (form?.crmModuleId && crm.moduleId !== form.crmModuleId) {
        proven = false;
        details.push(
          `CRM ownership module ${crm.moduleId} does not match form module ${form.crmModuleId}`,
        );
      }
    }
  }

  if (
    !path.bindingId &&
    !path.formId &&
    !path.bookingOwnershipId &&
    !path.crmOwnershipId
  ) {
    proven = false;
    details.push("Write path has no ownership mapping targets");
  }

  return { proven, details };
}

function evidencePresentForPath(
  mapping: ProductionMappingState,
  path: PilotWritePath,
): { present: boolean; missing: EvidenceKindValue[]; details: string[] } {
  if (path.requiredEvidenceKinds.length === 0) {
    return {
      present: false,
      missing: [...DEFAULT_PILOT_EVIDENCE_KINDS],
      details: [
        `Write path ${path.writePathId} has empty requiredEvidenceKinds (fail closed)`,
      ],
    };
  }
  const related = mapping.readEvidence.filter((e) =>
    evidenceAppliesToPath(mapping, path, e),
  );
  const presentKinds = new Set(related.map((e) => e.evidenceKind));
  const missing = path.requiredEvidenceKinds.filter((k) => !presentKinds.has(k));
  const details =
    missing.length === 0
      ? []
      : [
          `Write path ${path.writePathId} missing read evidence kinds on mapped resources: ${missing.join(", ")}`,
        ];
  return { present: missing.length === 0, missing, details };
}

/**
 * Resolve ownership + read-evidence gates for a pilot write intent.
 * Observe/create skip gates. Unmapped write paths fail closed.
 */
export function resolvePilotWriteGates(input: {
  actionClass: ActionClassValue;
  writePathId?: string | null;
  channelId: string;
  assetId: string;
  operation: string;
  mapping: ProductionMappingState;
}): PilotWriteGateResult {
  if (!actionClassRequiresPilotWriteGates(input.actionClass)) {
    return {
      ownershipProven: true,
      readEvidencePresent: true,
      prerequisiteMissing: false,
      details: ["Observe/create actions do not require pilot write gates"],
      matchedWritePath: null,
      missingEvidenceKinds: [],
    };
  }

  const matchedWritePath = findWritePath(input.mapping, {
    writePathId: input.writePathId,
    channelId: input.channelId,
    assetId: input.assetId,
    operation: input.operation,
  });

  if (!matchedWritePath) {
    return {
      ownershipProven: false,
      readEvidencePresent: false,
      prerequisiteMissing: true,
      details: [
        `No pilot write path mapped for ${input.channelId}/${input.assetId}/${input.operation}`,
      ],
      matchedWritePath: null,
      missingEvidenceKinds: [],
    };
  }

  const ownership = ownershipForWritePath(input.mapping, matchedWritePath);
  const evidence = evidencePresentForPath(input.mapping, matchedWritePath);
  const details = [...ownership.details, ...evidence.details];

  return {
    ownershipProven: ownership.proven,
    readEvidencePresent: evidence.present,
    prerequisiteMissing: !ownership.proven || !evidence.present,
    details,
    matchedWritePath,
    missingEvidenceKinds: evidence.missing,
  };
}

/**
 * Fixture pilot mapping for offline tests — NOT live Zoho/CMS.
 * Ownership flags start false until read evidence is applied.
 */
export function createFixturePilotMapping(nowIso: string): {
  state: ProductionMappingState;
  writePathId: string;
} {
  const siteId = "worksocial-pilot";
  const bindingId = "bind-site-home";
  const formId = "form-contact";
  const crmOwnershipId = "crm-zoho-leads";
  const bookingOwnershipId = "book-tour-link";
  const writePathId = "wp-form-to-crm";
  const journeyId = "journey-form-crm";

  const binding: SourceBinding = {
    bindingId,
    siteId,
    kind: BindingKind.WEBSITE,
    resourceRef: "https://example.worksocial.local/contact",
    displayName: "Pilot contact page (fixture)",
    identityLabel: null,
    connectionState: ConnectionState.NOT_CONFIGURED,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.NOT_VERIFIED,
    ownershipProven: false,
    observedRevision: null,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const form: FormMapping = {
    formId,
    siteId,
    pageAssetId: "page-contact",
    bindingId,
    handlerEndpoint: "https://example.worksocial.local/api/forms/contact",
    crmModuleId: "Leads",
    fieldMap: { email: "Email", name: "Last_Name" },
    ownershipOwner: ResourceOwnerSystem.WEBSITE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const crm: CrmOwnership = {
    crmOwnershipId,
    organizationId: "zoho-org-fixture",
    environment: "fixture",
    moduleId: "Leads",
    fieldOwnership: [
      { fieldName: "Email", ownerSystem: ResourceOwnerSystem.CRM },
      { fieldName: "Last_Name", ownerSystem: ResourceOwnerSystem.WEBSITE },
    ],
    testDataPolicy: "fixture-only; exclude from revenue reporting",
    ownershipProven: false,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const booking: BookingOwnership = {
    bookingOwnershipId,
    siteId,
    providerId: "booking-fixture",
    resourceId: "tour-link-fixture",
    environment: "fixture",
    ownerSystem: ResourceOwnerSystem.BOOKING,
    ownershipProven: false,
    adapterWiring: AdapterWiring.NOT_WIRED,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const writePath: PilotWritePath = {
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    siteId,
    bindingId,
    formId,
    bookingOwnershipId: null,
    crmOwnershipId,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  const journey: JourneyRegistryEntry = {
    journeyId,
    siteId,
    displayName: "Pilot form → CRM (fixture)",
    stages: ["page", "form", "handler", "crm"],
    writePathIds: [writePathId],
    createdAtIso: nowIso,
  };

  return {
    writePathId,
    state: {
      version: 1,
      sites: [siteId],
      bindings: [binding],
      forms: [form],
      bookingOwnership: [booking],
      crmOwnership: [crm],
      writePaths: [writePath],
      journeys: [journey],
      readEvidence: [],
      writePathOutcomes: [],
      updatedAt: nowIso,
    },
  };
}

/**
 * Apply a complete fixture read-evidence set and prove ownership for the pilot path.
 * Only fixture-wired / fixture-environment resources may be proven this way.
 */
export function proveFixturePilotWritePath(
  state: ProductionMappingState,
  writePathId: string,
  nowIso: string,
): ProductionMappingState {
  const path = state.writePaths.find((p) => p.writePathId === writePathId);
  if (!path) {
    throw new Error(`Unknown write path ${writePathId}`);
  }
  if (path.requiredEvidenceKinds.length === 0) {
    throw new Error(
      `Write path ${writePathId} has empty requiredEvidenceKinds`,
    );
  }

  if (path.bindingId) {
    const binding = state.bindings.find((b) => b.bindingId === path.bindingId);
    if (!binding) {
      throw new Error(`Missing binding ${path.bindingId} for fixture proof`);
    }
    if (binding.adapterWiring !== AdapterWiring.FIXTURE) {
      throw new Error(
        `Fixture proof refused: binding ${path.bindingId} is ${binding.adapterWiring}, not FIXTURE`,
      );
    }
  }

  if (path.crmOwnershipId) {
    const crm = state.crmOwnership.find(
      (c) => c.crmOwnershipId === path.crmOwnershipId,
    );
    if (!crm) {
      throw new Error(`Missing CRM ownership ${path.crmOwnershipId}`);
    }
    if (crm.adapterWiring !== AdapterWiring.FIXTURE || crm.environment !== "fixture") {
      throw new Error(
        `Fixture proof refused: CRM ${path.crmOwnershipId} is not fixture-wired`,
      );
    }
  }

  if (path.bookingOwnershipId) {
    const booking = state.bookingOwnership.find(
      (b) => b.bookingOwnershipId === path.bookingOwnershipId,
    );
    if (!booking) {
      throw new Error(`Missing booking ownership ${path.bookingOwnershipId}`);
    }
    if (booking.environment !== "fixture") {
      throw new Error(
        `Fixture proof refused: booking ${path.bookingOwnershipId} environment is ${booking.environment}`,
      );
    }
    if (booking.adapterWiring === AdapterWiring.LIVE) {
      throw new Error(
        `Fixture proof refused: booking ${path.bookingOwnershipId} is LIVE`,
      );
    }
  }

  if (path.formId) {
    const form = state.forms.find((f) => f.formId === path.formId);
    if (!form) {
      throw new Error(`Missing form ${path.formId}`);
    }
    if (form.siteId !== path.siteId || form.pageAssetId !== path.assetId) {
      throw new Error(
        `Fixture proof refused: form ${path.formId} does not match write target`,
      );
    }
    const formBinding = state.bindings.find((b) => b.bindingId === form.bindingId);
    if (!formBinding || formBinding.adapterWiring !== AdapterWiring.FIXTURE) {
      throw new Error(
        `Fixture proof refused: form binding ${form.bindingId} is not FIXTURE`,
      );
    }
  }

  let bindings = state.bindings;
  if (path.bindingId) {
    bindings = bindings.map((b) =>
      b.bindingId === path.bindingId
        ? applyBindingReadEvidence(b, {
            identityLabel: "fixture-site-identity",
            observedRevision: "rev-fixture-1",
            ownershipProven: true,
            nowIso,
          })
        : b,
    );
  }

  const crmOwnership = state.crmOwnership.map((c) =>
    path.crmOwnershipId && c.crmOwnershipId === path.crmOwnershipId
      ? { ...c, ownershipProven: true, updatedAtIso: nowIso }
      : c,
  );

  const bookingOwnership = state.bookingOwnership.map((b) =>
    path.bookingOwnershipId && b.bookingOwnershipId === path.bookingOwnershipId
      ? { ...b, ownershipProven: true, updatedAtIso: nowIso }
      : b,
  );

  const primaryResource = path.formId
    ? ({ resourceType: "form" as const, resourceId: path.formId })
    : path.bindingId
      ? ({ resourceType: "binding" as const, resourceId: path.bindingId })
      : path.crmOwnershipId
        ? ({ resourceType: "crm" as const, resourceId: path.crmOwnershipId })
        : null;
  if (!primaryResource) {
    throw new Error(
      `Write path ${writePathId} has no mapped resource for fixture evidence`,
    );
  }

  const evidence: ReadEvidenceRecord[] = path.requiredEvidenceKinds.map(
    (kind, index) =>
      createReadEvidence({
        evidenceId: `ev-${writePathId}-${index + 1}`,
        writePathId,
        evidenceKind: kind,
        resourceType: primaryResource.resourceType,
        resourceId: primaryResource.resourceId,
        operation: `fixture_read_${kind}`,
        summary: `Fixture ${kind} evidence for ${writePathId}`,
        fixtureOnly: true,
        observedAtIso: nowIso,
        adapterWiring: AdapterWiring.FIXTURE,
      }),
  );

  return {
    ...state,
    bindings,
    crmOwnership,
    bookingOwnership,
    readEvidence: [
      ...state.readEvidence.filter((e) => e.writePathId !== writePathId),
      ...evidence,
    ],
    updatedAt: nowIso,
  };
}

/**
 * Merge fixture pilot records into an existing mapping without wiping other data.
 * Refuses if fixture ids already exist with conflicting non-fixture content.
 */
export function upsertFixturePilotMapping(
  current: ProductionMappingState,
  nowIso: string,
): { state: ProductionMappingState; writePathId: string; created: boolean } {
  const { state: fixture, writePathId } = createFixturePilotMapping(nowIso);
  const existingPath = current.writePaths.find((p) => p.writePathId === writePathId);
  if (existingPath) {
    return { state: current, writePathId, created: false };
  }

  return {
    writePathId,
    created: true,
    state: {
      ...current,
      sites: [...new Set([...current.sites, ...fixture.sites])],
      bindings: [
        ...current.bindings.filter(
          (b) => !fixture.bindings.some((fb) => fb.bindingId === b.bindingId),
        ),
        ...fixture.bindings,
      ],
      forms: [
        ...current.forms.filter(
          (f) => !fixture.forms.some((ff) => ff.formId === f.formId),
        ),
        ...fixture.forms,
      ],
      bookingOwnership: [
        ...current.bookingOwnership.filter(
          (b) =>
            !fixture.bookingOwnership.some(
              (fb) => fb.bookingOwnershipId === b.bookingOwnershipId,
            ),
        ),
        ...fixture.bookingOwnership,
      ],
      crmOwnership: [
        ...current.crmOwnership.filter(
          (c) =>
            !fixture.crmOwnership.some(
              (fc) => fc.crmOwnershipId === c.crmOwnershipId,
            ),
        ),
        ...fixture.crmOwnership,
      ],
      writePaths: [...current.writePaths, ...fixture.writePaths],
      journeys: [
        ...current.journeys.filter(
          (j) => !fixture.journeys.some((fj) => fj.journeyId === j.journeyId),
        ),
        ...fixture.journeys,
      ],
      updatedAt: nowIso,
    },
  };
}
