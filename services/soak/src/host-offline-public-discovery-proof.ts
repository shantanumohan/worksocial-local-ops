/**
 * Fixture proof for T-X071 — Local host offline public discovery honest unavailability.
 * External effects: NONE. ChatGPT Ads ACCESS_BLOCKED. Live wiring NOT_WIRED.
 * Hillclimb: covers ONLINE-no-prior, multi-surface offline, and prior-success ignore.
 */

import { randomUUID } from "node:crypto";
import {
  HostDiscoveryLiveness,
  PublicDiscoveryAvailability,
  PublicDiscoveryDecisionCode,
  PublicDiscoveryUnavailableReason,
  SoakProofKind,
  evaluateHostOfflinePublicDiscovery,
  type SoakProofRecord,
} from "@worksocial/domain";

const SURFACES = [
  "geo_presence",
  "chatgpt_business",
  "public_visibility",
] as const;

/**
 * Complete expected proof set for T-X071 fixture ACCEPTED.
 */
export function proofHostOfflinePublicDiscoveryUnavailable(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Positive control: ONLINE + prior success → AVAILABLE (still Ads blocked / NOT_WIRED).
  const online = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-online-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
  });
  if (
    online.availability === PublicDiscoveryAvailability.AVAILABLE &&
    online.unavailableReason === null &&
    online.activeCoverageClaimed === true &&
    online.inventedDiscoveryRank === null &&
    online.code === PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    online.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    online.liveProviderWiring === "NOT_WIRED" &&
    online.externalEffects === "NONE"
  ) {
    details.push(
      "Host ONLINE + prior success → AVAILABLE; chatgptAdsAccess=ACCESS_BLOCKED; liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Online unexpectedly ${JSON.stringify(online)}`);
  }

  // ONLINE without prior success → UNAVAILABLE (not invented); distinct decision code.
  const onlineNoPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-online-noprior-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
  });
  if (
    onlineNoPrior.availability === PublicDiscoveryAvailability.UNAVAILABLE &&
    onlineNoPrior.unavailableReason === null &&
    onlineNoPrior.activeCoverageClaimed === false &&
    onlineNoPrior.inventedDiscoveryRank === null &&
    onlineNoPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE &&
    onlineNoPrior.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Host ONLINE without prior success → UNAVAILABLE (HOST_ONLINE_NO_PRIOR_UNAVAILABLE); no invented rank",
    );
  } else {
    passed = false;
    details.push(
      `Online-no-prior unexpectedly ${JSON.stringify(onlineNoPrior)}`,
    );
  }

  // Offline → honest UNAVAILABLE / HOST_OFFLINE across all surfaces (even with prior success).
  let surfacesOk = true;
  for (const surface of SURFACES) {
    const offline = evaluateHostOfflinePublicDiscovery({
      observationId: `obs-offline-${surface}-${randomUUID().slice(0, 8)}`,
      surface,
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
    });
    if (
      !(
        offline.surface === surface &&
        offline.availability === PublicDiscoveryAvailability.UNAVAILABLE &&
        offline.unavailableReason ===
          PublicDiscoveryUnavailableReason.HOST_OFFLINE &&
        offline.activeCoverageClaimed === false &&
        offline.inventedDiscoveryRank === null &&
        offline.code === PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE &&
        offline.chatgptAdsAccess === "ACCESS_BLOCKED" &&
        offline.liveProviderWiring === "NOT_WIRED" &&
        offline.externalEffects === "NONE"
      )
    ) {
      surfacesOk = false;
      passed = false;
      details.push(
        `Offline surface=${surface} unexpectedly ${JSON.stringify(offline)}`,
      );
    }
  }
  if (surfacesOk) {
    details.push(
      "Host OFFLINE → UNAVAILABLE/HOST_OFFLINE on geo_presence+chatgpt_business+public_visibility; prior success ignored; activeCoverageClaimed=false; no invented rank",
    );
  }

  // Greenfield I63 BIND @ 18ffa6c1 — claimed AVAILABLE while ONLINE without prior stays fail-closed.
  const onlineClaimNoPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i63-claim-noprior-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
  });
  if (
    onlineClaimNoPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE &&
    onlineClaimNoPrior.availability ===
      PublicDiscoveryAvailability.UNAVAILABLE &&
    onlineClaimNoPrior.activeCoverageClaimed === false &&
    onlineClaimNoPrior.inventedDiscoveryRank === null
  ) {
    details.push(
      "I63 BIND: claimed AVAILABLE while ONLINE w/o prior → HOST_ONLINE_NO_PRIOR_UNAVAILABLE (not exclusive #297)",
    );
  } else {
    passed = false;
    details.push(
      `I63 online-claim-no-prior unexpectedly ${JSON.stringify(onlineClaimNoPrior)}`,
    );
  }

  // wipe15 I64 TIMER ON_TIP e7226169 — OFFLINE + empty prior; ONLINE null prior + claim.
  const offlineEmptyPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i64-empty-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "",
  });
  const onlineNullPriorClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i64-null-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: null,
  });
  if (
    offlineEmptyPrior.code ===
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE &&
    offlineEmptyPrior.activeCoverageClaimed === false &&
    onlineNullPriorClaim.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE &&
    onlineNullPriorClaim.inventedDiscoveryRank === null
  ) {
    details.push(
      "wipe15 I64 TIMER: OFFLINE+empty prior → HOST_OFFLINE_UNAVAILABLE; ONLINE null prior+claim → NO_PRIOR (exclusive #298 Slot O)",
    );
  } else {
    passed = false;
    details.push("I64 empty-prior/null-prior unexpectedly failed");
  }

  // wipe15 I65 TIMER ON_TIP 63d2c0e0 — honest ONLINE claim + OFFLINE geo refuse.
  const onlineHonestUnavail = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i65-honest-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
  });
  const offlineGeoRefuse = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i65-geo-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
  });
  if (
    onlineHonestUnavail.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE &&
    onlineHonestUnavail.activeCoverageClaimed === false &&
    offlineGeoRefuse.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    offlineGeoRefuse.inventedDiscoveryRank === null
  ) {
    details.push(
      "wipe15 I65 TIMER: ONLINE honest UNAVAILABLE claim → NO_PRIOR; OFFLINE geo+AVAILABLE claim refused (exclusive #300)",
    );
  } else {
    passed = false;
    details.push("I65 honest-claim/geo-refuse unexpectedly failed");
  }

  // wipe15 I66 TIMER ON_TIP d6731fcd
  const offlineHonestClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i66-honest-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
  });
  const onlineUndefPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i66-undef-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
  });
  if (
    offlineHonestClaim.code ===
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE &&
    offlineHonestClaim.externalEffects === "NONE" &&
    onlineUndefPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE
  ) {
    details.push(
      "wipe15 I66 TIMER: OFFLINE honest UNAVAILABLE claim; ONLINE no prior+claim (exclusive #302)",
    );
  } else {
    passed = false;
    details.push("I66 offline-honest/undef-prior unexpectedly failed");
  }

  // wipe15 I67 TIMER ON_TIP 1fb05770
  const chatgptOfflineClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i67-chatgpt-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
  });
  const onlineEmptyPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i67-empty-${randomUUID().slice(0, 8)}`,
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "",
  });
  if (
    chatgptOfflineClaim.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    chatgptOfflineClaim.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    onlineEmptyPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE
  ) {
    details.push(
      "wipe15 I67 TIMER: chatgpt_business OFFLINE AVAILABLE refused; ONLINE empty prior → NO_PRIOR (exclusive #304 Slot F)",
    );
  } else {
    passed = false;
    details.push("I67 chatgpt-offline/empty-prior unexpectedly failed");
  }

  // wipe15 I68 TIMER ON_TIP 64829602
  const geoOnlinePrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i68-geo-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T11:00:00.000Z",
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
  });
  const publicOfflineNullPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i68-null-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: null,
  });
  if (
    geoOnlinePrior.code === PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    geoOnlinePrior.surface === "geo_presence" &&
    geoOnlinePrior.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    publicOfflineNullPrior.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    publicOfflineNullPrior.activeCoverageClaimed === false
  ) {
    details.push(
      "wipe15 I68 TIMER: geo_presence ONLINE+prior AVAILABLE; public_visibility OFFLINE null prior claim refused (exclusive #307 Slot M)",
    );
  } else {
    passed = false;
    details.push("I68 geo-prior/null-prior-offline unexpectedly failed");
  }

  // wipe15 I69 TIMER ON_TIP 5ed3d15d
  const chatgptOnlinePrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i69-chatgpt-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T12:30:00.000Z",
  });
  const publicHonestNoPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i69-public-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
  });
  if (
    chatgptOnlinePrior.code === PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    chatgptOnlinePrior.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    publicHonestNoPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE &&
    publicHonestNoPrior.surface === "public_visibility"
  ) {
    details.push(
      "wipe15 I69 TIMER: chatgpt_business ONLINE+prior; public_visibility honest UNAVAILABLE claim → NO_PRIOR (exclusive #309 Slot S)",
    );
  } else {
    passed = false;
    details.push("I69 chatgpt-prior/public-honest unexpectedly failed");
  }

  // wipe15 I70 TIMER ON_TIP 7a9be9a1
  const geoOfflinePrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i70-geo-off-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T09:00:00.000Z",
  });
  const geoClaimNoPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i70-geo-claim-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
  });
  if (
    geoOfflinePrior.code ===
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE &&
    geoOfflinePrior.activeCoverageClaimed === false &&
    geoClaimNoPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE &&
    geoClaimNoPrior.externalEffects === "NONE"
  ) {
    details.push(
      "wipe15 I70 TIMER: OFFLINE geo+prior ignored; ONLINE geo claim NO_PRIOR (exclusive #311 Slot A)",
    );
  } else {
    passed = false;
    details.push("I70 geo-offline-prior/geo-claim unexpectedly failed");
  }

  // continue I71 BIND @ f6a6318f (post-#313)
  const publicOnlinePrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i71-public-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T14:00:00.000Z",
  });
  const chatgptHonestOffline = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i71-chatgpt-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T10:00:00.000Z",
  });
  if (
    publicOnlinePrior.code === PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    publicOnlinePrior.surface === "public_visibility" &&
    chatgptHonestOffline.code ===
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE &&
    chatgptHonestOffline.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "continue I71 BIND: public_visibility ONLINE+prior; chatgpt OFFLINE honest claim (HOLD #314 exclusive Slot N)",
    );
  } else {
    passed = false;
    details.push("I71 continue public-prior/chatgpt-honest unexpectedly failed");
  }

  // wipe15 I72 ON_TIP 60b4b782 (post tip-moved-316)
  const geoEmptyOfflineClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i72-geo-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: "",
  });
  const chatgptHonestNoPrior = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i72-honest-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
  });
  if (
    geoEmptyOfflineClaim.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    chatgptHonestNoPrior.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE
  ) {
    details.push(
      "wipe15 I72: geo OFFLINE empty-prior claim refused; chatgpt honest NO_PRIOR (exclusive #317 Slot P)",
    );
  } else {
    passed = false;
    details.push("I72 geo-empty/chatgpt-honest unexpectedly failed");
  }

  // wipe15 I73 edge-deepen ON_TIP 60b4b782 (HOLD #330)
  const publicEmptyOfflineClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i73-public-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: "",
  });
  const geoPriorUnavailClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i73-geo-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T15:00:00.000Z",
  });
  if (
    publicEmptyOfflineClaim.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    publicEmptyOfflineClaim.liveProviderWiring === "NOT_WIRED" &&
    publicEmptyOfflineClaim.externalEffects === "NONE" &&
    geoPriorUnavailClaim.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    geoPriorUnavailClaim.activeCoverageClaimed === true
  ) {
    details.push(
      "wipe15 I73: public OFFLINE empty-prior claim refused; geo ONLINE+prior ignores UNAVAILABLE claim (exclusive was #317 Slot P)",
    );
  } else {
    passed = false;
    details.push("I73 public-empty/geo-prior-claim unexpectedly failed");
  }

  // wipe15 I74 edge-deepen ON_TIP 62ca532e (post tip-moved-323; HOLD #330)
  const chatgptNullOfflineClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i74-chatgpt-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: null,
  });
  const publicPriorUnavailClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i74-public-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T16:00:00.000Z",
  });
  if (
    chatgptNullOfflineClaim.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    chatgptNullOfflineClaim.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    chatgptNullOfflineClaim.liveProviderWiring === "NOT_WIRED" &&
    publicPriorUnavailClaim.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    publicPriorUnavailClaim.activeCoverageClaimed === true
  ) {
    details.push(
      "wipe15 I74: chatgpt OFFLINE null-prior claim refused; public ONLINE+prior ignores UNAVAILABLE claim (exclusive #324 Slot M)",
    );
  } else {
    passed = false;
    details.push("I74 chatgpt-null/public-prior-claim unexpectedly failed");
  }

  // continue I75 BIND wipe+retip @ b106092f (post tip-moved-342; HOLD — exclusive #343 Slot S)
  const geoNullOfflineClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i75-geo-${randomUUID().slice(0, 8)}`,
    surface: "geo_presence",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: null,
  });
  // Prior must be earlier than harness nowIso (release evidence ~2026-11-21T19:23Z).
  const i75PriorSuccessIso = new Date(
    Date.parse(nowIso) - 2 * 60 * 60 * 1000,
  ).toISOString();
  const chatgptPriorUnavailClaim = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-i75-chatgpt-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.ONLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    lastSuccessfulDiscoveryAtIso: i75PriorSuccessIso,
  });
  if (
    geoNullOfflineClaim.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    geoNullOfflineClaim.activeCoverageClaimed === false &&
    geoNullOfflineClaim.liveProviderWiring === "NOT_WIRED" &&
    geoNullOfflineClaim.externalEffects === "NONE" &&
    chatgptPriorUnavailClaim.code ===
      PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE &&
    chatgptPriorUnavailClaim.activeCoverageClaimed === true &&
    chatgptPriorUnavailClaim.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "continue I75 BIND: geo OFFLINE null-prior claim refused; chatgpt ONLINE+prior ignores UNAVAILABLE claim (HOLD; exclusive #343 Slot S)",
    );
  } else {
    passed = false;
    details.push("I75 geo-null/chatgpt-prior-claim unexpectedly failed");
  }

  // Claimed AVAILABLE while offline is refused.
  const refused = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-refuse-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
  });
  if (
    refused.availability === PublicDiscoveryAvailability.UNAVAILABLE &&
    refused.unavailableReason ===
      PublicDiscoveryUnavailableReason.HOST_OFFLINE &&
    refused.activeCoverageClaimed === false &&
    refused.inventedDiscoveryRank === null &&
    refused.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED &&
    refused.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Claimed AVAILABLE while OFFLINE → CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED; liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Claim-refuse unexpectedly ${JSON.stringify(refused)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-host-offline-discovery-${randomUUID()}`,
    kind: SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx071-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
