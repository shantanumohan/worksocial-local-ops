import { describe, expect, it } from "vitest";
import { ActionClass, OperatingMode } from "./standing-authority.js";
import {
  HostProbeCategory,
  ReadinessDimension,
  evaluateTrustedWorkspaceReadiness,
  observeModeBlocksActionClass,
} from "./trusted-workspace-readiness.js";

const nowIso = "2026-11-22T21:00:00.000Z";

function hostProbe(
  category: (typeof HostProbeCategory)[keyof typeof HostProbeCategory],
  ok: boolean,
  detail = "ok",
) {
  return {
    probeId: `host-${category}`,
    category,
    label: category,
    ok,
    detail,
    observedAtIso: nowIso,
  };
}

function okProbe(probeId: string, label: string) {
  return {
    probeId,
    label,
    ok: true,
    detail: "ok",
    observedAtIso: nowIso,
  };
}

function failProbe(probeId: string, label: string, detail: string) {
  return {
    probeId,
    label,
    ok: false,
    detail,
    observedAtIso: nowIso,
  };
}

const allHostOk = [
  hostProbe(HostProbeCategory.SERVICE_IDENTITY, true),
  hostProbe(HostProbeCategory.LEASE, true),
  hostProbe(HostProbeCategory.STORAGE, true),
  hostProbe(HostProbeCategory.CLOCK, true),
];

describe("trusted workspace readiness (T-US-001)", () => {
  it("emits explicit blockers and next actions for each blocked dimension", () => {
    const summary = evaluateTrustedWorkspaceReadiness({
      nowIso,
      ownerId: "owner-1",
      ownerRole: "administrator",
      sessionId: "sess-1",
      businessName: "WorkSocial Pilot",
      timezone: "America/New_York",
      notificationRecipients: ["ops@example.test"],
      workspaceConfigRevision: "ws-rev-1",
      operatingMode: OperatingMode.OBSERVE,
      hostProbes: [
        hostProbe(HostProbeCategory.SERVICE_IDENTITY, true),
        hostProbe(HostProbeCategory.LEASE, false, "LEASE_HELD by peer"),
        hostProbe(HostProbeCategory.STORAGE, true),
        hostProbe(HostProbeCategory.CLOCK, true),
      ],
      claudeProbes: [],
      providerProbes: [okProbe("ga4", "GA4 fixture")],
      workstreamProbes: [
        failProbe("ws", "Observe workstream", "not created"),
      ],
    });

    expect(summary.localReadinessVerified).toBe(false);
    expect(summary.blockers.map((b) => b.dimension).sort()).toEqual([
      ReadinessDimension.CLAUDE,
      ReadinessDimension.HOST,
      ReadinessDimension.WORKSTREAMS,
    ]);
    for (const b of summary.blockers) {
      expect(b.blocker.length).toBeGreaterThan(0);
      expect(b.nextAction.length).toBeGreaterThan(0);
    }
    expect(summary.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(summary.externalEffects).toBe("NONE");
    expect(summary.publicWritesOccurred).toBe(false);
  });

  it("keeps host blocked when a required probe category is missing", () => {
    const summary = evaluateTrustedWorkspaceReadiness({
      nowIso,
      ownerId: "owner-1",
      ownerRole: "administrator",
      sessionId: "sess-1",
      businessName: "WorkSocial Pilot",
      timezone: "America/New_York",
      notificationRecipients: ["ops@example.test"],
      workspaceConfigRevision: "ws-rev-missing",
      operatingMode: OperatingMode.OBSERVE,
      hostProbes: [
        hostProbe(HostProbeCategory.SERVICE_IDENTITY, true),
        hostProbe(HostProbeCategory.LEASE, true),
        hostProbe(HostProbeCategory.CLOCK, true),
        // STORAGE omitted
      ],
      claudeProbes: [okProbe("claude", "claude auth")],
      providerProbes: [okProbe("gsc", "GSC fixture")],
      workstreamProbes: [okProbe("mission", "Observe mission")],
    });

    expect(summary.localReadinessVerified).toBe(false);
    const host = summary.dimensions.find(
      (d) => d.dimension === ReadinessDimension.HOST,
    );
    expect(host?.ready).toBe(false);
    expect(host?.blocker).toContain("storage");
  });

  it("marks local readiness verified only when all host categories + dims ready under Observe", () => {
    const summary = evaluateTrustedWorkspaceReadiness({
      nowIso,
      ownerId: "owner-1",
      ownerRole: "administrator",
      sessionId: "sess-1",
      businessName: "WorkSocial Pilot",
      timezone: "America/New_York",
      notificationRecipients: ["ops@example.test"],
      workspaceConfigRevision: "ws-rev-2",
      operatingMode: OperatingMode.OBSERVE,
      hostProbes: allHostOk,
      claudeProbes: [okProbe("claude", "claude auth")],
      providerProbes: [okProbe("gsc", "GSC fixture")],
      workstreamProbes: [okProbe("mission", "Observe mission")],
    });

    expect(summary.localReadinessVerified).toBe(true);
    expect(summary.blockers).toEqual([]);
    expect(summary.dimensions.every((d) => d.ready)).toBe(true);
    expect(summary.observeDeniesPublish).toBe(true);
    expect(summary.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(summary.externalEffects).toBe("NONE");
  });

  it("keeps Ads ACCESS_BLOCKED when auth is missing despite transport+entitlement", () => {
    const summary = evaluateTrustedWorkspaceReadiness({
      nowIso,
      ownerId: "owner-1",
      ownerRole: "administrator",
      sessionId: "sess-ads",
      businessName: "WorkSocial Pilot",
      timezone: "America/New_York",
      notificationRecipients: ["ops@example.test"],
      workspaceConfigRevision: "ws-rev-ads",
      operatingMode: OperatingMode.OBSERVE,
      hostProbes: allHostOk,
      claudeProbes: [okProbe("claude", "claude auth")],
      providerProbes: [okProbe("gsc", "GSC")],
      workstreamProbes: [okProbe("ws", "ws")],
      chatgptAds: {
        localTransportVerified: true,
        entitlementVerified: true,
        authVerified: false,
      },
    });
    expect(summary.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(summary.chatgptAdsCode).toBe("ADS_AUTH_UNVERIFIED");
  });

  it("reports PRESENT externalEffects when a public write occurred", () => {
    const summary = evaluateTrustedWorkspaceReadiness({
      nowIso,
      ownerId: "owner-1",
      ownerRole: "administrator",
      sessionId: "sess-dirty",
      businessName: "WorkSocial Pilot",
      timezone: "America/New_York",
      notificationRecipients: ["ops@example.test"],
      workspaceConfigRevision: "ws-rev-dirty",
      operatingMode: OperatingMode.OBSERVE,
      hostProbes: allHostOk,
      claudeProbes: [okProbe("claude", "claude auth")],
      providerProbes: [okProbe("gsc", "GSC")],
      workstreamProbes: [okProbe("ws", "ws")],
      publicWritesOccurred: true,
    });
    expect(summary.publicWritesOccurred).toBe(true);
    expect(summary.localReadinessVerified).toBe(false);
    expect(summary.externalEffects).toBe("PRESENT");
  });

  it("Observe mode blocks publish/customer-service classes", () => {
    expect(
      observeModeBlocksActionClass(
        OperatingMode.OBSERVE,
        ActionClass.ROUTINE_PUBLISH,
      ),
    ).toBe(true);
    expect(
      observeModeBlocksActionClass(
        OperatingMode.OBSERVE,
        ActionClass.OBSERVE,
      ),
    ).toBe(false);
    expect(
      observeModeBlocksActionClass(
        OperatingMode.OPERATE,
        ActionClass.ROUTINE_PUBLISH,
      ),
    ).toBe(false);
  });
});
