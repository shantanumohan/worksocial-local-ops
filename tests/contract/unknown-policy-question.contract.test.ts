/**
 * Contract: T-X055 unknown policy question (hillclimb).
 * Additive coverage around domain attack suite + soak map honesty.
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live wiring NOT_WIRED.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  UNKNOWN_POLICY_QUESTION_RELATED_CASE_IDS,
  SoakProofKind,
  SupportLabel,
  InboxChannel,
  createConversation,
  defaultResponsePolicy,
  evaluateUnknownPolicyQuestionAttackSuite,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

/** Same fixture clock as m9 soak contracts (after-hours coverage windows). */
const now = "2026-11-21T19:00:00.000Z";

describe("contract: T-X055 unknown policy question", () => {
  let dirs: string[];

  beforeEach(() => {
    dirs = [mkdtempSync(join(tmpdir(), "ws-tx055-contract-"))];
  });
  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("attack suite covers allowed + unknown/empty with NOT_WIRED honesty", () => {
    const policy = defaultResponsePolicy(now);
    const conversation = createConversation({
      conversationId: "c-tx055-contract",
      providerThreadId: "thr-tx055",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Fixture Guest",
      nowIso: now,
    });
    const suite = evaluateUnknownPolicyQuestionAttackSuite({
      policy,
      draftProbe: {
        conversation,
        nowIso: now,
        citedFactIds: ["fact-hours"],
        factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      },
    });
    expect(suite.passed).toBe(true);
    expect(
      suite.details.some((d) =>
        /prepareConciergeReply questionId="" → UNKNOWN_POLICY_QUESTION/.test(d),
      ),
    ).toBe(true);
    expect([...UNKNOWN_POLICY_QUESTION_RELATED_CASE_IDS]).toEqual(["T-X055"]);
    expect(expectedProofsForFixtureCase("T-X055")).toEqual([
      SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
      ),
    ).toEqual(["T-X055"]);
  });

  it("harness + compiler mark T-X055 fixture ACCEPTED, never VERIFIED", async () => {
    const harnessDir = dirs[0];
    const harness = await runSoakRecoveryHarness({
      stateDir: harnessDir,
      nowIso: now,
    });
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) =>
        p.kind === SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) =>
        /UNKNOWN_POLICY_QUESTION|escalateWithoutPromise/i.test(d),
      ),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T19:01:00.000Z",
      runId: "soak-tx055-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X055");
    expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(row?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.blockedLiveVerified).toBe(true);

    const soakDir = mkdtempSync(join(tmpdir(), "ws-tx055-soak-store-"));
    dirs.push(soakDir);
    const soak = createSoakService(createFileSoakStore(soakDir));
    const run = await soak.runFixtureSoak({ harnessNowIso: now });
    if (!run.ok) {
      const failedKinds = run.run.proofs
        .filter((p) => !p.passed)
        .map((p) => p.kind);
      expect(failedKinds, "runFixtureSoak harness proof failures").toEqual([]);
    }
    expect(run.ok).toBe(true);
    expect(run.run.externalEffects).toBe("NONE");
    expect(run.run.liveWiring.cms).toBe("NOT_WIRED");
    const tx055 = run.run.caseResults.find((c) => c.caseId === "T-X055");
    expect(tx055?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx055?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx055?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});
