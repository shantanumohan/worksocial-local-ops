/**
 * Fixture proof for T-F01 — Create a trusted local workspace.
 * Complete F01 evidence package: owner session, workspace revision,
 * timestamped diagnostics (not online badge), Observe authority, startup
 * result, recovery test, blockers+next-actions; public writes refused;
 * live NOT_WIRED. Distinct from open T-US-001 readiness blockers summary.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  DiagnosticProbeKind,
  InitialOperatingMode,
  SoakProofKind,
  evaluateCreateTrustedLocalWorkspace,
  type CreateTrustedLocalWorkspaceInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<CreateTrustedLocalWorkspaceInput> = {},
): CreateTrustedLocalWorkspaceInput {
  return {
    packageId: "pkg-f01-soak",
    ownerSession: {
      ownerId: "owner-f01",
      role: "administrator",
      sessionId: "sess-f01-soak",
    },
    workspaceConfigRevision: "ws-rev-f01",
    businessName: "WorkSocial Local",
    timezone: "America/Chicago",
    notificationRecipients: ["owner@example.test"],
    diagnostics: [
      {
        probeId: "p-svc",
        kind: DiagnosticProbeKind.SERVICE_IDENTITY,
        label: "service identity",
        ok: true,
        detail: "local fixture host",
        observedAtIso: "2026-11-23T01:00:00.000Z",
      },
      {
        probeId: "p-lease",
        kind: DiagnosticProbeKind.LEASE,
        label: "singleton lease",
        ok: true,
        detail: "lease held",
        observedAtIso: "2026-11-23T01:00:01.000Z",
      },
      {
        probeId: "p-storage",
        kind: DiagnosticProbeKind.STORAGE,
        label: "storage",
        ok: true,
        detail: "writable",
        observedAtIso: "2026-11-23T01:00:02.000Z",
      },
      {
        probeId: "p-clock",
        kind: DiagnosticProbeKind.CLOCK,
        label: "clock",
        ok: true,
        detail: "ntp ok",
        observedAtIso: "2026-11-23T01:00:03.000Z",
      },
    ],
    initialAuthority: {
      decisionId: "auth-f01-soak",
      operatingMode: InitialOperatingMode.OBSERVE,
      decidedAtIso: "2026-11-23T01:00:10.000Z",
      observeDeniesPublish: true,
    },
    startupResult: {
      startupId: "startup-f01-soak",
      status: "PASSED",
      unattendedStartupEnabled: true,
      hostRequirementsReviewed: true,
      completedAtIso: "2026-11-23T01:00:20.000Z",
    },
    recoveryTest: {
      recoveryTestId: "recovery-f01-soak",
      status: "PASSED",
      completedAtIso: "2026-11-23T01:00:30.000Z",
    },
    blockers: [],
    publicWritesOccurred: false,
    attemptPublicWrite: false,
    claimLiveVerifiedWorkspace: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F01 fixture ACCEPTED.
 */
export function proofCreateTrustedLocalWorkspace(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateCreateTrustedLocalWorkspace(baseInput());
  if (
    happy.allowed &&
    happy.code === "CREATE_TRUSTED_LOCAL_WORKSPACE_EVIDENCE_RECORDED" &&
    happy.evidence.operatingMode === "Observe" &&
    happy.evidence.observeDeniesPublish === true &&
    happy.evidence.requiredDiagnosticKindsCovered === true &&
    happy.evidence.startupStatus === "PASSED" &&
    happy.evidence.recoveryTestStatus === "PASSED" &&
    happy.evidence.publicWritesOccurred === false &&
    happy.evidence.workspaceVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F01 evidence package → CREATE_TRUSTED_LOCAL_WORKSPACE_EVIDENCE_RECORDED; Observe denies publish; workspaceVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noOwner = evaluateCreateTrustedLocalWorkspace(
    baseInput({
      ownerSession: { ownerId: "", role: "administrator", sessionId: "s" },
    }),
  );
  if (!noOwner.allowed && noOwner.code === "OWNER_SESSION_REQUIRED") {
    details.push("empty ownerId → OWNER_SESSION_REQUIRED");
  } else {
    passed = false;
    details.push(`Owner session unexpectedly ${JSON.stringify(noOwner)}`);
  }

  const noRev = evaluateCreateTrustedLocalWorkspace(
    baseInput({ workspaceConfigRevision: "" }),
  );
  if (
    !noRev.allowed &&
    noRev.code === "WORKSPACE_CONFIG_REVISION_REQUIRED"
  ) {
    details.push("empty workspaceConfigRevision → WORKSPACE_CONFIG_REVISION_REQUIRED");
  } else {
    passed = false;
    details.push(`Workspace revision unexpectedly ${JSON.stringify(noRev)}`);
  }

  const badge = evaluateCreateTrustedLocalWorkspace(
    baseInput({
      diagnostics: [
        {
          probeId: "badge",
          kind: DiagnosticProbeKind.ONLINE_BADGE,
          label: "online",
          ok: true,
          detail: "green",
          observedAtIso: "2026-11-23T01:00:00.000Z",
        },
      ],
    }),
  );
  if (!badge.allowed && badge.code === "DECORATIVE_ONLINE_BADGE_REFUSED") {
    details.push("online_badge only → DECORATIVE_ONLINE_BADGE_REFUSED");
  } else {
    passed = false;
    details.push(`Online badge unexpectedly ${JSON.stringify(badge)}`);
  }

  const publicWrite = evaluateCreateTrustedLocalWorkspace(
    baseInput({ attemptPublicWrite: true }),
  );
  if (!publicWrite.allowed && publicWrite.code === "PUBLIC_WRITE_REFUSED") {
    details.push("attemptPublicWrite → PUBLIC_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Public write unexpectedly ${JSON.stringify(publicWrite)}`);
  }

  const liveClaim = evaluateCreateTrustedLocalWorkspace(
    baseInput({ claimLiveVerifiedWorkspace: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_WORKSPACE_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedWorkspace → FALSE_LIVE_VERIFIED_WORKSPACE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateCreateTrustedLocalWorkspace(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  const blockerGap = evaluateCreateTrustedLocalWorkspace(
    baseInput({
      blockers: [
        {
          blockerId: "b1",
          blocker: "host storage failing",
          nextAction: "",
        },
      ],
    }),
  );
  if (
    !blockerGap.allowed &&
    blockerGap.code === "BLOCKER_NEXT_ACTION_REQUIRED"
  ) {
    details.push("blocker without nextAction → BLOCKER_NEXT_ACTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Blocker gap unexpectedly ${JSON.stringify(blockerGap)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-001 (readiness blockers/next-actions summary) — complete F01 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CREATE_TRUSTED_LOCAL_WORKSPACE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-create-trusted-local-workspace-f01",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
