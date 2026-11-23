/**
 * Fixture proof for T-US-001 — Create a trusted local workspace
 * (F01/SC-02): blockers and next actions.
 * External effects: NONE (unless public write recorded → PRESENT).
 * ChatGPT Ads: ACCESS_BLOCKED via three-part evaluateChatGptAdsAccess gate.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  HostProbeCategory,
  OperatingMode,
  ReadinessDimension,
  SoakProofKind,
  evaluateTrustedWorkspaceReadiness,
  observeModeBlocksActionClass,
  type HostDiagnosticProbe,
  type SoakProofRecord,
} from "@worksocial/domain";

function probe(
  probeId: string,
  label: string,
  ok: boolean,
  detail: string,
  observedAtIso: string,
  category?: HostDiagnosticProbe["category"],
): HostDiagnosticProbe {
  const base: HostDiagnosticProbe = {
    probeId,
    label,
    ok,
    detail,
    observedAtIso,
  };
  return category === undefined ? base : { ...base, category };
}

function allHostOk(nowIso: string): HostDiagnosticProbe[] {
  return [
    probe(
      "host-svc",
      "local service identity",
      true,
      "service=worksocial-local",
      nowIso,
      HostProbeCategory.SERVICE_IDENTITY,
    ),
    probe(
      "host-lease",
      "singleton supervisor lease",
      true,
      "acquired",
      nowIso,
      HostProbeCategory.LEASE,
    ),
    probe(
      "host-storage",
      "local storage writable",
      true,
      "free_bytes=ok",
      nowIso,
      HostProbeCategory.STORAGE,
    ),
    probe(
      "host-clock",
      "clock skew",
      true,
      "skew_ms=12",
      nowIso,
      HostProbeCategory.CLOCK,
    ),
  ];
}

/**
 * Complete expected proof set for T-US-001 fixture ACCEPTED.
 */
export function proofTrustedWorkspaceReadinessBlockersNextActions(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Partial readiness — each blocked dimension carries blocker + nextAction.
  const partial = evaluateTrustedWorkspaceReadiness({
    nowIso,
    ownerId: "owner-fixture-tus001",
    ownerRole: "administrator",
    sessionId: `sess-${randomUUID().slice(0, 8)}`,
    businessName: "WorkSocial Fixture Co",
    timezone: "America/New_York",
    notificationRecipients: ["owner@fixture.test"],
    workspaceConfigRevision: "ws-cfg-rev-partial",
    operatingMode: OperatingMode.OBSERVE,
    hostProbes: [
      probe(
        "host-svc",
        "local service identity",
        true,
        "service=worksocial-local",
        nowIso,
        HostProbeCategory.SERVICE_IDENTITY,
      ),
      probe(
        "host-lease",
        "singleton supervisor lease",
        false,
        "LEASE_HELD by peer generation",
        nowIso,
        HostProbeCategory.LEASE,
      ),
      probe(
        "host-storage",
        "local storage writable",
        true,
        "ok",
        nowIso,
        HostProbeCategory.STORAGE,
      ),
      probe(
        "host-clock",
        "clock skew",
        true,
        "ok",
        nowIso,
        HostProbeCategory.CLOCK,
      ),
    ],
    claudeProbes: [
      probe(
        "claude-bin",
        "Claude executable",
        false,
        "claude binary not found on PATH",
        nowIso,
      ),
    ],
    providerProbes: [
      probe("gsc", "Search Console fixture", true, "FIXTURE ready-read", nowIso),
      probe("ga4", "GA4 fixture", true, "FIXTURE ready-read", nowIso),
    ],
    workstreamProbes: [
      probe(
        "ws-observe",
        "Observe workstream",
        false,
        "no workstream registered",
        nowIso,
      ),
    ],
    chatgptAds: {
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
    },
    publicWritesOccurred: false,
  });

  const expectedBlocked = [
    ReadinessDimension.HOST,
    ReadinessDimension.CLAUDE,
    ReadinessDimension.WORKSTREAMS,
  ];
  const blockedDims = partial.blockers.map((b) => b.dimension).sort();
  if (
    !partial.localReadinessVerified &&
    JSON.stringify(blockedDims) === JSON.stringify([...expectedBlocked].sort()) &&
    partial.blockers.every((b) => b.blocker.length > 0 && b.nextAction.length > 0) &&
    partial.dimensions.find((d) => d.dimension === ReadinessDimension.PROVIDERS)
      ?.ready === true &&
    partial.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    partial.externalEffects === "NONE" &&
    partial.publicWritesOccurred === false &&
    partial.workspaceConfigRevision === "ws-cfg-rev-partial" &&
    partial.ownerId === "owner-fixture-tus001"
  ) {
    details.push(
      `Partial readiness: blockers=${blockedDims.join(",")} each with nextAction; providers READY; Ads ACCESS_BLOCKED`,
    );
  } else {
    passed = false;
    details.push(`Partial readiness unexpectedly ${JSON.stringify(partial)}`);
  }

  // Missing required host category keeps host blocked.
  const missingStorage = evaluateTrustedWorkspaceReadiness({
    nowIso,
    ownerId: "owner-fixture-tus001",
    ownerRole: "administrator",
    sessionId: "sess-missing-storage",
    businessName: "WorkSocial Fixture Co",
    timezone: "America/New_York",
    notificationRecipients: ["owner@fixture.test"],
    workspaceConfigRevision: "ws-cfg-rev-missing",
    operatingMode: OperatingMode.OBSERVE,
    hostProbes: [
      probe(
        "host-svc",
        "local service identity",
        true,
        "ok",
        nowIso,
        HostProbeCategory.SERVICE_IDENTITY,
      ),
      probe(
        "host-lease",
        "singleton supervisor lease",
        true,
        "ok",
        nowIso,
        HostProbeCategory.LEASE,
      ),
      probe(
        "host-clock",
        "clock skew",
        true,
        "ok",
        nowIso,
        HostProbeCategory.CLOCK,
      ),
    ],
    claudeProbes: [probe("claude", "Claude", true, "ok", nowIso)],
    providerProbes: [probe("gsc", "GSC", true, "ok", nowIso)],
    workstreamProbes: [probe("ws", "ws", true, "ok", nowIso)],
  });
  const missingHost = missingStorage.dimensions.find(
    (d) => d.dimension === ReadinessDimension.HOST,
  );
  if (
    !missingStorage.localReadinessVerified &&
    missingHost &&
    missingHost.ready === false &&
    (missingHost.blocker ?? "").includes("storage")
  ) {
    details.push(
      "Missing host STORAGE category → host BLOCKED (not READY on subset)",
    );
  } else {
    passed = false;
    details.push(
      `Missing storage unexpectedly ${JSON.stringify(missingHost)}`,
    );
  }

  // Timestamped diagnostics present (not a decorative online badge).
  const hostDiag = partial.dimensions.find(
    (d) => d.dimension === ReadinessDimension.HOST,
  );
  if (
    hostDiag &&
    hostDiag.diagnostics.length >= 4 &&
    hostDiag.diagnostics.every((p) => typeof p.observedAtIso === "string")
  ) {
    details.push(
      `Timestamped host diagnostics count=${hostDiag.diagnostics.length}`,
    );
  } else {
    passed = false;
    details.push("Host diagnostics missing timestamps");
  }

  // Full readiness under Observe — no public writes.
  const ready = evaluateTrustedWorkspaceReadiness({
    nowIso,
    ownerId: "owner-fixture-tus001",
    ownerRole: "administrator",
    sessionId: `sess-${randomUUID().slice(0, 8)}`,
    businessName: "WorkSocial Fixture Co",
    timezone: "America/New_York",
    notificationRecipients: ["owner@fixture.test"],
    workspaceConfigRevision: "ws-cfg-rev-ready",
    operatingMode: OperatingMode.OBSERVE,
    hostProbes: allHostOk(nowIso),
    claudeProbes: [
      probe("claude-bin", "Claude executable", true, "authenticated", nowIso),
    ],
    providerProbes: [
      probe("gsc", "Search Console fixture", true, "FIXTURE", nowIso),
      probe("ga4", "GA4 fixture", true, "FIXTURE", nowIso),
    ],
    workstreamProbes: [
      probe("ws-observe", "Observe workstream", true, "enabled", nowIso),
    ],
    chatgptAds: {
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
    },
    publicWritesOccurred: false,
  });

  if (
    ready.localReadinessVerified &&
    ready.blockers.length === 0 &&
    ready.observeDeniesPublish &&
    ready.operatingMode === OperatingMode.OBSERVE &&
    ready.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    ready.publicWritesOccurred === false &&
    ready.externalEffects === "NONE"
  ) {
    details.push(
      "Full Observe readiness: localReadinessVerified=true blockers=[] publicWrites=false Ads ACCESS_BLOCKED externalEffects=NONE",
    );
  } else {
    passed = false;
    details.push(`Full readiness unexpectedly ${JSON.stringify(ready)}`);
  }

  // Ads three-part gate: transport+entitlement without auth stays blocked.
  const adsAuthGap = evaluateTrustedWorkspaceReadiness({
    nowIso,
    ownerId: "owner-fixture-tus001",
    ownerRole: "administrator",
    sessionId: "sess-ads-auth",
    businessName: "WorkSocial Fixture Co",
    timezone: "America/New_York",
    notificationRecipients: ["owner@fixture.test"],
    workspaceConfigRevision: "ws-cfg-rev-ads",
    operatingMode: OperatingMode.OBSERVE,
    hostProbes: allHostOk(nowIso),
    claudeProbes: [probe("c", "claude", true, "ok", nowIso)],
    providerProbes: [probe("p", "providers", true, "ok", nowIso)],
    workstreamProbes: [probe("w", "workstreams", true, "ok", nowIso)],
    chatgptAds: {
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: false,
    },
  });
  if (
    adsAuthGap.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    adsAuthGap.chatgptAdsCode === "ADS_AUTH_UNVERIFIED"
  ) {
    details.push(
      "Ads three-part gate: transport+entitlement without auth → ACCESS_BLOCKED (ADS_AUTH_UNVERIFIED)",
    );
  } else {
    passed = false;
    details.push(
      `Ads auth gap unexpectedly code=${adsAuthGap.chatgptAdsCode} access=${adsAuthGap.chatgptAdsAccess}`,
    );
  }

  // Observe denies publish / customer reply classes.
  if (
    observeModeBlocksActionClass(
      OperatingMode.OBSERVE,
      ActionClass.ROUTINE_PUBLISH,
    ) &&
    observeModeBlocksActionClass(
      OperatingMode.OBSERVE,
      ActionClass.ROUTINE_CUSTOMER_SERVICE,
    ) &&
    !observeModeBlocksActionClass(OperatingMode.OBSERVE, ActionClass.OBSERVE)
  ) {
    details.push(
      "Initial Observe authority denies publish/customer-service; Observe class allowed",
    );
  } else {
    passed = false;
    details.push("Observe authority gates failed");
  }

  // Honesty: public writes → PRESENT effects and not verified readiness.
  const dirty = evaluateTrustedWorkspaceReadiness({
    nowIso,
    ownerId: "owner-fixture-tus001",
    ownerRole: "administrator",
    sessionId: "sess-dirty",
    businessName: "WorkSocial Fixture Co",
    timezone: "America/New_York",
    notificationRecipients: ["owner@fixture.test"],
    workspaceConfigRevision: "ws-cfg-rev-dirty",
    operatingMode: OperatingMode.OBSERVE,
    hostProbes: allHostOk(nowIso),
    claudeProbes: [probe("c", "claude", true, "ok", nowIso)],
    providerProbes: [probe("p", "providers", true, "ok", nowIso)],
    workstreamProbes: [probe("w", "workstreams", true, "ok", nowIso)],
    publicWritesOccurred: true,
  });
  if (
    !dirty.localReadinessVerified &&
    dirty.publicWritesOccurred &&
    dirty.externalEffects === "PRESENT"
  ) {
    details.push(
      "publicWritesOccurred=true → localReadinessVerified=false externalEffects=PRESENT",
    );
  } else {
    passed = false;
    details.push("Public-write honesty gate failed");
  }

  details.push("liveProviderSuccessClaimed=false");

  return {
    proofId: `proof-trusted-workspace-${randomUUID()}`,
    kind: SoakProofKind.TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tus001-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
