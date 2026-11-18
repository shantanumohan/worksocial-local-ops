/**
 * DOM / journey probes.
 * Default: fixture HTML evaluation (CI-safe) against a named fixture catalog.
 * Optional Playwright live path — NOT_WIRED when unbound / not installed.
 */

import {
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  evaluateDomJourneyFixture,
  type DomJourneyStep,
  type ProbeEvidenceArtifact,
  type ProbeModeValue,
  type ProbeVerdictValue,
} from "@worksocial/domain";
import { FIXTURE_DOM_TARGETS } from "./fixtures.js";

export type DomJourneyResult = {
  targetId: string;
  mode: ProbeModeValue;
  verdict: ProbeVerdictValue;
  details: string[];
  passedStepIds: string[];
  evidence: ProbeEvidenceArtifact;
  playwrightAvailable: boolean;
};

/**
 * R1-05 does not ship Playwright as a hard dependency.
 * Live browser journeys stay NOT_WIRED until an optional install + URL binding exist.
 */
export function isPlaywrightAvailable(): boolean {
  return process.env.WORKSOCIAL_PLAYWRIGHT === "1";
}

export async function runDomJourneyProbe(input: {
  targetId: string;
  mode?: ProbeModeValue;
  html?: string;
  steps?: readonly DomJourneyStep[];
  nowIso: string;
}): Promise<DomJourneyResult> {
  const mode = input.mode ?? ProbeMode.FIXTURE;
  const evidenceId = `dom-ev-${input.targetId}-${Date.now()}`;
  const playwrightAvailable = isPlaywrightAvailable();

  if (mode === ProbeMode.LIVE) {
    if (!playwrightAvailable) {
      return {
        targetId: input.targetId,
        mode,
        verdict: ProbeVerdict.NOT_WIRED,
        details: [
          "Playwright live path not enabled (set WORKSOCIAL_PLAYWRIGHT=1 after install). Use fixture mode for CI.",
        ],
        passedStepIds: [],
        playwrightAvailable: false,
        evidence: {
          evidenceId,
          kind: ProbeKind.DOM_JOURNEY,
          mode,
          summary: "Live Playwright journey NOT_WIRED",
          facts: { playwrightAvailable: false },
          recordedAtIso: input.nowIso,
        },
      };
    }
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.NOT_WIRED,
      details: [
        "Playwright flag set but no production URL/session bound for live journeys in R1-05",
      ],
      passedStepIds: [],
      playwrightAvailable: true,
      evidence: {
        evidenceId,
        kind: ProbeKind.DOM_JOURNEY,
        mode,
        summary: "Live Playwright path flagged but unbound (NOT_WIRED)",
        facts: { playwrightAvailable: true, bound: false },
        recordedAtIso: input.nowIso,
      },
    };
  }

  // Fixture mode: custom html/steps allowed for unit tests; otherwise require catalog target.
  if (!input.html && !input.steps) {
    const fixture = FIXTURE_DOM_TARGETS[input.targetId];
    if (!fixture) {
      return {
        targetId: input.targetId,
        mode,
        verdict: ProbeVerdict.FAILURE,
        details: [`Unknown fixture DOM target: ${input.targetId}`],
        passedStepIds: [],
        playwrightAvailable,
        evidence: {
          evidenceId,
          kind: ProbeKind.DOM_JOURNEY,
          mode,
          summary: `Unknown fixture DOM target ${input.targetId}`,
          facts: { targetId: input.targetId },
          recordedAtIso: input.nowIso,
        },
      };
    }
    const evaluated = evaluateDomJourneyFixture({
      html: fixture.html,
      steps: fixture.steps,
    });
    return {
      targetId: input.targetId,
      mode,
      verdict: evaluated.verdict,
      details: evaluated.details,
      passedStepIds: evaluated.passedStepIds,
      playwrightAvailable,
      evidence: {
        evidenceId,
        kind: ProbeKind.DOM_JOURNEY,
        mode,
        summary:
          evaluated.verdict === ProbeVerdict.SUCCESS
            ? `Fixture DOM journey ok (${evaluated.passedStepIds.length} steps)`
            : `Fixture DOM journey failed`,
        facts: {
          passed: evaluated.passedStepIds.length,
          failed: evaluated.details.length,
          stepCount: fixture.steps.length,
        },
        recordedAtIso: input.nowIso,
      },
    };
  }

  const fixture = FIXTURE_DOM_TARGETS[input.targetId];
  const html = input.html ?? fixture?.html;
  const steps = input.steps ?? fixture?.steps;
  if (!html || !steps) {
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.FAILURE,
      details: [`Unknown fixture DOM target: ${input.targetId}`],
      passedStepIds: [],
      playwrightAvailable,
      evidence: {
        evidenceId,
        kind: ProbeKind.DOM_JOURNEY,
        mode,
        summary: `Unknown fixture DOM target ${input.targetId}`,
        facts: { targetId: input.targetId },
        recordedAtIso: input.nowIso,
      },
    };
  }

  const evaluated = evaluateDomJourneyFixture({ html, steps });

  return {
    targetId: input.targetId,
    mode,
    verdict: evaluated.verdict,
    details: evaluated.details,
    passedStepIds: evaluated.passedStepIds,
    playwrightAvailable,
    evidence: {
      evidenceId,
      kind: ProbeKind.DOM_JOURNEY,
      mode,
      summary:
        evaluated.verdict === ProbeVerdict.SUCCESS
          ? `Fixture DOM journey ok (${evaluated.passedStepIds.length} steps)`
          : `Fixture DOM journey failed`,
      facts: {
        passed: evaluated.passedStepIds.length,
        failed: evaluated.details.length,
        stepCount: steps.length,
      },
      recordedAtIso: input.nowIso,
    },
  };
}
