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
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
    expect(obs.reasons.some((r) => r.includes("Prior success ignored"))).toBe(
      true,
    );
  });

  it("refuses claimed AVAILABLE while host is offline", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-claim",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-21T12:00:00.000Z",
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
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("keeps HOST_OFFLINE_UNAVAILABLE when claimedAvailability is UNAVAILABLE", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-claim-unavail",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
    expect(obs.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
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
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("reports UNAVAILABLE without inventing coverage when ONLINE but no prior success", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-online-no-prior",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
    });
    expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
    expect(obs.unavailableReason).toBeNull();
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("greenfield I63 BIND: claimed AVAILABLE while ONLINE without prior stays honest UNAVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i63-claim-online-no-prior",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("greenfield I63 BIND: ONLINE with prior still AVAILABLE even if claim is UNAVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i63-honest-claim-with-prior",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T08:00:00.000Z",
    });
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.availability).toBe(PublicDiscoveryAvailability.AVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(true);
    expect(obs.inventedDiscoveryRank).toBeNull();
  });

  it("wipe15 I64 TIMER ON_TIP: OFFLINE with empty prior timestamp stays honest (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i64-empty-prior-offline",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("wipe15 I64: ONLINE with null prior and claimed AVAILABLE → NO_PRIOR (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i64-null-prior-claim",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: null,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.inventedDiscoveryRank).toBeNull();
  });

  it("wipe15 I65 TIMER ON_TIP: ONLINE no prior + honest UNAVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i65-honest-unavail-claim",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("wipe15 I65: OFFLINE geo_presence refuses claimed AVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i65-offline-geo-claim",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
    );
    expect(obs.inventedDiscoveryRank).toBeNull();
  });

  it("wipe15 I66 TIMER ON_TIP: OFFLINE public_visibility honest UNAVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i66-offline-honest",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("wipe15 I66: ONLINE undefined prior + claim AVAILABLE → NO_PRIOR (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i66-undef-prior",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
  });

  it("wipe15 I67 TIMER ON_TIP: OFFLINE chatgpt_business refuses AVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i67-chatgpt-offline-claim",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T10:00:00.000Z",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("wipe15 I67: ONLINE with empty-string prior → NO_PRIOR unavailable (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i67-empty-string-prior",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.inventedDiscoveryRank).toBeNull();
  });

  it("wipe15 I68 TIMER ON_TIP: ONLINE geo_presence with prior stays AVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i68-geo-prior",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T11:00:00.000Z",
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.surface).toBe("geo_presence");
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(true);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("wipe15 I68: OFFLINE public_visibility null prior refuses AVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i68-null-prior-offline-claim",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: null,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.externalEffects).toBe("NONE");
  });

  it("wipe15 I69 TIMER ON_TIP: ONLINE chatgpt_business with prior stays AVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i69-chatgpt-prior",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T12:30:00.000Z",
    });
    expect(obs.surface).toBe("chatgpt_business");
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(true);
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("wipe15 I69: ONLINE public_visibility honest UNAVAILABLE claim → NO_PRIOR (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i69-public-honest-claim",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    });
    expect(obs.surface).toBe("public_visibility");
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("wipe15 I70 TIMER ON_TIP: OFFLINE geo_presence ignores prior success (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i70-geo-offline-prior",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T09:00:00.000Z",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.reasons.some((r) => r.includes("Prior success ignored"))).toBe(
      true,
    );
  });

  it("wipe15 I70: ONLINE geo_presence no prior + AVAILABLE claim → NO_PRIOR (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i70-geo-claim-noprior",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.externalEffects).toBe("NONE");
  });

  it("greenfield continue I71 BIND: public_visibility ONLINE+prior AVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i71-public-prior",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T14:00:00.000Z",
    });
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.surface).toBe("public_visibility");
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("greenfield continue I71: OFFLINE chatgpt honest UNAVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i71-chatgpt-honest-offline",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T10:00:00.000Z",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(obs.activeCoverageClaimed).toBe(false);
  });

  it("wipe15 I72 ON_TIP: geo OFFLINE empty prior refuses AVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i72-geo-empty-claim",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: "",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.inventedDiscoveryRank).toBeNull();
  });

  it("wipe15 I72: ONLINE chatgpt no prior honest UNAVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i72-chatgpt-honest-noprior",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("wipe15 I73 ON_TIP: public OFFLINE empty prior refuses AVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i73-public-empty-claim",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: "",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("wipe15 I73: geo ONLINE+prior ignores UNAVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i73-geo-prior-unavail-claim",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T15:00:00.000Z",
    });
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.availability).toBe(PublicDiscoveryAvailability.AVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(true);
    expect(obs.inventedDiscoveryRank).toBeNull();
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("wipe15 I74 ON_TIP: chatgpt OFFLINE null prior refuses AVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i74-chatgpt-null-claim",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
      lastSuccessfulDiscoveryAtIso: null,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(obs.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
    expect(obs.externalEffects).toBe("NONE");
  });

  it("wipe15 I74: public ONLINE+prior ignores UNAVAILABLE claim (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i74-public-prior-unavail-claim",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: now,
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T16:00:00.000Z",
    });
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.availability).toBe(PublicDiscoveryAvailability.AVAILABLE);
    expect(obs.activeCoverageClaimed).toBe(true);
    expect(obs.inventedDiscoveryRank).toBeNull();
  });

  it("applies HOST_OFFLINE honestly across all public-discovery surfaces", () => {
    const surfaces = [
      "geo_presence",
      "chatgpt_business",
      "public_visibility",
    ] as const;
    for (const surface of surfaces) {
      const obs = evaluateHostOfflinePublicDiscovery({
        observationId: `obs-${surface}`,
        surface,
        hostLiveness: HostDiscoveryLiveness.OFFLINE,
        nowIso: now,
        lastSuccessfulDiscoveryAtIso: "2026-11-22T10:00:00.000Z",
      });
      expect(obs.surface).toBe(surface);
      expect(obs.availability).toBe(PublicDiscoveryAvailability.UNAVAILABLE);
      expect(obs.unavailableReason).toBe(
        PublicDiscoveryUnavailableReason.HOST_OFFLINE,
      );
      expect(obs.activeCoverageClaimed).toBe(false);
      expect(obs.inventedDiscoveryRank).toBeNull();
      expect(obs.code).toBe(
        PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
      );
    }
  });
});
