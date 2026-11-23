/**
 * Fixture proof for T-X071 — Local host offline public discovery honest unavailability.
 * External effects: NONE. ChatGPT Ads ACCESS_BLOCKED.
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

/**
 * Complete expected proof set for T-X071 fixture ACCEPTED.
 */
export function proofHostOfflinePublicDiscoveryUnavailable(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Positive control: ONLINE + prior success → AVAILABLE (still Ads blocked).
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
    online.externalEffects === "NONE"
  ) {
    details.push(
      "Host ONLINE + prior success → AVAILABLE; chatgptAdsAccess=ACCESS_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`Online unexpectedly ${JSON.stringify(online)}`);
  }

  // Offline → honest UNAVAILABLE / HOST_OFFLINE (even with prior success).
  const offline = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-offline-${randomUUID().slice(0, 8)}`,
    surface: "chatgpt_business",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
  });
  if (
    offline.availability === PublicDiscoveryAvailability.UNAVAILABLE &&
    offline.unavailableReason ===
      PublicDiscoveryUnavailableReason.HOST_OFFLINE &&
    offline.activeCoverageClaimed === false &&
    offline.inventedDiscoveryRank === null &&
    offline.code === PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE &&
    offline.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    offline.externalEffects === "NONE"
  ) {
    details.push(
      "Host OFFLINE → UNAVAILABLE/HOST_OFFLINE; activeCoverageClaimed=false; no invented rank",
    );
  } else {
    passed = false;
    details.push(`Offline unexpectedly ${JSON.stringify(offline)}`);
  }

  // Claimed AVAILABLE while offline is refused.
  const refused = evaluateHostOfflinePublicDiscovery({
    observationId: `obs-refuse-${randomUUID().slice(0, 8)}`,
    surface: "public_visibility",
    hostLiveness: HostDiscoveryLiveness.OFFLINE,
    nowIso,
    claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
  });
  if (
    refused.availability === PublicDiscoveryAvailability.UNAVAILABLE &&
    refused.unavailableReason ===
      PublicDiscoveryUnavailableReason.HOST_OFFLINE &&
    refused.activeCoverageClaimed === false &&
    refused.inventedDiscoveryRank === null &&
    refused.code ===
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED
  ) {
    details.push(
      "Claimed AVAILABLE while OFFLINE → CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Claim-refuse unexpectedly ${JSON.stringify(refused)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
