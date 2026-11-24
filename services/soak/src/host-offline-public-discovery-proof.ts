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
