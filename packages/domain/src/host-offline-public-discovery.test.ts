import { describe, expect, it } from "vitest";
import {
  HostDiscoveryLiveness,
  PublicDiscoveryAvailability,
  PublicDiscoveryDecisionCode,
  PublicDiscoveryUnavailableReason,
  evaluateHostOfflinePublicDiscovery,
} from "./host-offline-public-discovery.js";

const now = "2026-11-22T19:00:00.000Z";

describe("host offline public discovery (T-X071)", () => {
  it("reports honest UNAVAILABLE/HOST_OFFLINE when host is offline", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-offline",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
    expect(obs.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("refuses claimed AVAILABLE while host is offline", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-claim",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
    expect(obs.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
  });

  it("allows AVAILABLE when host is online with prior success", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-online",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T10:00:00.000Z",
    });
    expect(obs.availability).toBe(PublicDiscoveryAvailability.AVAILABLE);
    expect(obs.unavailableReason).toBeNull();
    expect(obs.activeCoverageClaimed).toBe(true);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });
});
