/**
 * T-US-056 — Honest outage; durable hosted contact path.
 *
 * When the local agent host is unavailable, the public chat widget must show
 * an honest UNAVAILABLE / HOST_OFFLINE state and keep the existing hosted
 * contact path (website form intake) available. Receipt acknowledgement is
 * refused until a durable receiving system has accepted the message — never
 * pretend local-host receipt while the host is down.
 *
 * Hosted-path availability is fail-closed: omitted/false → UNAVAILABLE.
 * Callers must supply availability from `resolveFixtureHostedContactPath`
 * (or an equivalent check) — never invent DURABLE_AVAILABLE by default.
 *
 * Distinct from T-X001 (scheduled monitoring sleep coverage gaps) and from
 * T-X071 (public-discovery GEO/visibility UNAVAILABLE). External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export const HostContactLiveness = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
} as const;

export type HostContactLivenessValue =
  (typeof HostContactLiveness)[keyof typeof HostContactLiveness];

export const PublicChatCoverage = {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export type PublicChatCoverageValue =
  (typeof PublicChatCoverage)[keyof typeof PublicChatCoverage];

export const HostedContactPathStatus = {
  DURABLE_AVAILABLE: "DURABLE_AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export type HostedContactPathStatusValue =
  (typeof HostedContactPathStatus)[keyof typeof HostedContactPathStatus];

export const ContactReceiptDecisionCode = {
  HOST_ONLINE_CHAT_AVAILABLE: "HOST_ONLINE_CHAT_AVAILABLE",
  HOST_OFFLINE_HONEST_OUTAGE: "HOST_OFFLINE_HONEST_OUTAGE",
  PRETEND_RECEIPT_WHILE_OFFLINE_REFUSED:
    "PRETEND_RECEIPT_WHILE_OFFLINE_REFUSED",
  DURABLE_RECEIVER_ACCEPTED: "DURABLE_RECEIVER_ACCEPTED",
  DURABLE_RECEIVER_NOT_ACCEPTED: "DURABLE_RECEIVER_NOT_ACCEPTED",
  HOSTED_CONTACT_PATH_UNAVAILABLE: "HOSTED_CONTACT_PATH_UNAVAILABLE",
} as const;

export type ContactReceiptDecisionCodeValue =
  (typeof ContactReceiptDecisionCode)[keyof typeof ContactReceiptDecisionCode];

export type FixtureHostedContactPathCheck = {
  /** Absolute or site-relative form/contact path (fixture). */
  hostedFormPath: string | null;
  /** Durable receiver that continues when the local agent host is down. */
  durableReceiverKind: "website_form" | "hosted_crm_intake" | null;
};

export type FixtureHostedContactPathResolution = {
  available: boolean;
  status: HostedContactPathStatusValue;
  reasons: string[];
};

/**
 * Derive hosted contact-path availability from fixture evidence only.
 * Fail-closed: empty path or missing receiver kind → UNAVAILABLE.
 */
export function resolveFixtureHostedContactPath(
  input: FixtureHostedContactPathCheck,
): FixtureHostedContactPathResolution {
  const path =
    typeof input.hostedFormPath === "string"
      ? input.hostedFormPath.trim()
      : "";
  const kind = input.durableReceiverKind;
  if (!path || kind == null) {
    return {
      available: false,
      status: HostedContactPathStatus.UNAVAILABLE,
      reasons: [
        "Fixture hosted contact path check failed — path or durableReceiverKind missing",
        "Fail-closed: hostedContactPath=UNAVAILABLE (do not invent DURABLE_AVAILABLE)",
      ],
    };
  }
  return {
    available: true,
    status: HostedContactPathStatus.DURABLE_AVAILABLE,
    reasons: [
      `Fixture hosted contact path present: ${path}`,
      `Durable receiver kind=${kind}`,
    ],
  };
}

export type HonestOutageContactObservation = {
  observationId: string;
  observedAtIso: string;
  hostLiveness: HostContactLivenessValue;
  publicChatCoverage: PublicChatCoverageValue;
  unavailableReason: "HOST_OFFLINE" | null;
  hostedContactPath: HostedContactPathStatusValue;
  /** True only after a durable receiving system accepted the message. */
  receiptAcknowledged: boolean;
  /** Never invent local-host acceptance while offline. */
  pretendedLocalHostReceipt: boolean;
  /** True when a local-host receipt claim was refused independently. */
  localHostClaimRefused: boolean;
  code: ContactReceiptDecisionCodeValue;
  reasons: string[];
  externalEffects: "NONE";
  liveInboxWiring: "NOT_WIRED";
};

/**
 * Evaluate public-chat coverage + hosted contact path against host liveness.
 * Offline → honest UNAVAILABLE chat. Hosted path availability is fail-closed
 * (`hostedContactPathAvailable === true` required). Local-host receipt claims
 * are refused independently of durable-receiver acceptance.
 */
export function evaluateHonestOutageHostedContact(input: {
  observationId: string;
  hostLiveness: HostContactLivenessValue;
  nowIso: string;
  /**
   * Caller claim that local chat already accepted the message. Refused when
   * host is OFFLINE (must not invent local receipt). Independent of durable
   * receiver acceptance — a valid durable accept may still acknowledge.
   */
  claimLocalHostReceipt?: boolean;
  /**
   * Whether the durable hosted receiving system (website/form intake) has
   * accepted the message. Required before receiptAcknowledged may be true.
   */
  durableReceiverAccepted?: boolean;
  /**
   * Must be derived from `resolveFixtureHostedContactPath` (or equivalent).
   * Omitted/false → UNAVAILABLE (fail-closed; never invent DURABLE_AVAILABLE).
   */
  hostedContactPathAvailable?: boolean;
}): HonestOutageContactObservation {
  const hostedPathAvailable = input.hostedContactPathAvailable === true;
  const hostedContactPath = hostedPathAvailable
    ? HostedContactPathStatus.DURABLE_AVAILABLE
    : HostedContactPathStatus.UNAVAILABLE;
  const durableAccepted = input.durableReceiverAccepted === true;
  const claimLocal = input.claimLocalHostReceipt === true;

  const base = {
    observationId: input.observationId,
    observedAtIso: input.nowIso,
    hostLiveness: input.hostLiveness,
    hostedContactPath,
    externalEffects: "NONE" as const,
    liveInboxWiring: "NOT_WIRED" as const,
  };

  if (input.hostLiveness === HostContactLiveness.OFFLINE) {
    // Durable accept with available path wins acknowledgement even if a stale
    // local-host claim accompanies the request — claim is refused independently.
    if (durableAccepted && hostedPathAvailable) {
      return {
        ...base,
        publicChatCoverage: PublicChatCoverage.UNAVAILABLE,
        unavailableReason: "HOST_OFFLINE",
        receiptAcknowledged: true,
        pretendedLocalHostReceipt: false,
        localHostClaimRefused: claimLocal,
        code: ContactReceiptDecisionCode.DURABLE_RECEIVER_ACCEPTED,
        reasons: [
          "Host OFFLINE — public chat UNAVAILABLE (HOST_OFFLINE)",
          "Durable hosted contact path accepted message — receipt allowed",
          ...(claimLocal
            ? [
                "Local-host receipt claim refused independently (pretend not honored)",
              ]
            : ["No pretend local-host receipt"]),
          "liveInboxWiring=NOT_WIRED externalEffects=NONE",
        ],
      };
    }

    if (claimLocal) {
      return {
        ...base,
        publicChatCoverage: PublicChatCoverage.UNAVAILABLE,
        unavailableReason: "HOST_OFFLINE",
        receiptAcknowledged: false,
        pretendedLocalHostReceipt: false,
        localHostClaimRefused: true,
        code: ContactReceiptDecisionCode.PRETEND_RECEIPT_WHILE_OFFLINE_REFUSED,
        reasons: [
          "Host OFFLINE — pretend local-host receipt refused",
          "Public chat UNAVAILABLE (HOST_OFFLINE); honest outage",
          hostedPathAvailable
            ? "Hosted contact path DURABLE_AVAILABLE (website/form intake)"
            : "Hosted contact path UNAVAILABLE (fail-closed)",
          durableAccepted
            ? "Durable accept claimed but hosted path unavailable — receipt refused"
            : "receiptAcknowledged=false until durable receiver accepts on available path",
          "liveInboxWiring=NOT_WIRED externalEffects=NONE",
        ],
      };
    }

    if (!hostedPathAvailable) {
      return {
        ...base,
        publicChatCoverage: PublicChatCoverage.UNAVAILABLE,
        unavailableReason: "HOST_OFFLINE",
        receiptAcknowledged: false,
        pretendedLocalHostReceipt: false,
        localHostClaimRefused: false,
        code: ContactReceiptDecisionCode.HOSTED_CONTACT_PATH_UNAVAILABLE,
        reasons: [
          "Host OFFLINE — public chat UNAVAILABLE (HOST_OFFLINE)",
          "Hosted contact path UNAVAILABLE (fail-closed; no invented DURABLE_AVAILABLE)",
          "receiptAcknowledged=false",
          "liveInboxWiring=NOT_WIRED externalEffects=NONE",
        ],
      };
    }

    return {
      ...base,
      publicChatCoverage: PublicChatCoverage.UNAVAILABLE,
      unavailableReason: "HOST_OFFLINE",
      receiptAcknowledged: false,
      pretendedLocalHostReceipt: false,
      localHostClaimRefused: false,
      code: durableAccepted
        ? ContactReceiptDecisionCode.DURABLE_RECEIVER_NOT_ACCEPTED
        : ContactReceiptDecisionCode.HOST_OFFLINE_HONEST_OUTAGE,
      reasons: [
        "Host OFFLINE — public chat UNAVAILABLE (HOST_OFFLINE)",
        "Hosted contact path DURABLE_AVAILABLE (website/form intake continues)",
        durableAccepted
          ? "Durable receiver claimed accept but acknowledgement refused"
          : "No durable receiver acceptance yet — receiptAcknowledged=false",
        "liveInboxWiring=NOT_WIRED externalEffects=NONE",
      ],
    };
  }

  // ONLINE — chat coverage available; receipt still requires durable accept
  // on an available hosted contact path.
  if (durableAccepted && hostedPathAvailable) {
    return {
      ...base,
      publicChatCoverage: PublicChatCoverage.AVAILABLE,
      unavailableReason: null,
      receiptAcknowledged: true,
      pretendedLocalHostReceipt: false,
      localHostClaimRefused: false,
      code: ContactReceiptDecisionCode.DURABLE_RECEIVER_ACCEPTED,
      reasons: [
        "Host ONLINE — public chat AVAILABLE",
        "Durable receiver accepted on available hosted path — receiptAcknowledged=true",
        "liveInboxWiring=NOT_WIRED externalEffects=NONE",
      ],
    };
  }

  return {
    ...base,
    publicChatCoverage: PublicChatCoverage.AVAILABLE,
    unavailableReason: null,
    receiptAcknowledged: false,
    pretendedLocalHostReceipt: false,
    localHostClaimRefused: false,
    code: hostedPathAvailable
      ? ContactReceiptDecisionCode.HOST_ONLINE_CHAT_AVAILABLE
      : ContactReceiptDecisionCode.HOSTED_CONTACT_PATH_UNAVAILABLE,
    reasons: [
      "Host ONLINE — public chat AVAILABLE",
      hostedPathAvailable
        ? "Hosted contact path DURABLE_AVAILABLE"
        : "Hosted contact path UNAVAILABLE (fail-closed)",
      "receiptAcknowledged=false until durable receiver accepts on available path",
      "liveInboxWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}

export const HONEST_OUTAGE_HOSTED_CONTACT_RELATED_CASE_IDS = [
  "T-US-056",
] as const;
