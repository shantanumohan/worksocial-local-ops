import { describe, expect, it } from "vitest";
import {
  CREATE_TRUSTED_LOCAL_WORKSPACE_RELATED_CASE_IDS,
  DiagnosticProbeKind,
  InitialOperatingMode,
  evaluateCreateTrustedLocalWorkspace,
  type CreateTrustedLocalWorkspaceInput,
} from "./create-trusted-local-workspace.js";

function baseInput(
  overrides: Partial<CreateTrustedLocalWorkspaceInput> = {},
): CreateTrustedLocalWorkspaceInput {
  return {
    packageId: "pkg-f01-1",
    ownerSession: {
      ownerId: "owner-1",
      role: "administrator",
      sessionId: "sess-f01-1",
    },
    workspaceConfigRevision: "ws-rev-1",
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
      decisionId: "auth-f01-1",
      operatingMode: InitialOperatingMode.OBSERVE,
      decidedAtIso: "2026-11-23T01:00:10.000Z",
      observeDeniesPublish: true,
    },
    startupResult: {
      startupId: "startup-f01-1",
      status: "PASSED",
      unattendedStartupEnabled: true,
      hostRequirementsReviewed: true,
      completedAtIso: "2026-11-23T01:00:20.000Z",
    },
    recoveryTest: {
      recoveryTestId: "recovery-f01-1",
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

describe("evaluateCreateTrustedLocalWorkspace (T-F01)", () => {
  it("records complete F01 evidence package", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(baseInput());
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(
      "CREATE_TRUSTED_LOCAL_WORKSPACE_EVIDENCE_RECORDED",
    );
    if (!decision.allowed) return;
    expect(decision.evidence.operatingMode).toBe("Observe");
    expect(decision.evidence.observeDeniesPublish).toBe(true);
    expect(decision.evidence.requiredDiagnosticKindsCovered).toBe(true);
    expect(decision.evidence.publicWritesOccurred).toBe(false);
    expect(decision.evidence.workspaceVerifiedLive).toBe(false);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses owner session gaps", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(
      baseInput({
        ownerSession: { ownerId: "", role: "administrator", sessionId: "s" },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("OWNER_SESSION_REQUIRED");
  });

  it("refuses missing workspace revision", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(
      baseInput({ workspaceConfigRevision: "" }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("WORKSPACE_CONFIG_REVISION_REQUIRED");
  });

  it("refuses decorative online badge only", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(
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
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("DECORATIVE_ONLINE_BADGE_REFUSED");
  });

  it("refuses incomplete timestamped diagnostics", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(
      baseInput({
        diagnostics: [
          {
            probeId: "p-svc",
            kind: DiagnosticProbeKind.SERVICE_IDENTITY,
            label: "service identity",
            ok: true,
            detail: "ok",
            observedAtIso: "2026-11-23T01:00:00.000Z",
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("TIMESTAMPED_DIAGNOSTICS_REQUIRED");
  });

  it("refuses public writes", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(
      baseInput({ attemptPublicWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("PUBLIC_WRITE_REFUSED");
  });

  it("refuses false live verified claims and live wiring", () => {
    expect(
      evaluateCreateTrustedLocalWorkspace(
        baseInput({ claimLiveVerifiedWorkspace: true }),
      ).code,
    ).toBe("FALSE_LIVE_VERIFIED_WORKSPACE_REFUSED");
    expect(
      evaluateCreateTrustedLocalWorkspace(
        baseInput({ requestLiveProviderWiring: true }),
      ).code,
    ).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("refuses blockers without next actions", () => {
    const decision = evaluateCreateTrustedLocalWorkspace(
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
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("BLOCKER_NEXT_ACTION_REQUIRED");
  });

  it("maps only to T-F01", () => {
    expect([...CREATE_TRUSTED_LOCAL_WORKSPACE_RELATED_CASE_IDS]).toEqual([
      "T-F01",
    ]);
  });
});
