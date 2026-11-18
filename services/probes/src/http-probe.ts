/**
 * Deterministic HTTP probes — fixture catalog by default; live fetch optional.
 */

import {
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  evaluateHttpProbe,
  type HttpProbeExpectation,
  type ProbeEvidenceArtifact,
  type ProbeModeValue,
  type ProbeVerdictValue,
} from "@worksocial/domain";
import { FIXTURE_HTTP_TARGETS } from "./fixtures.js";

export type HttpProbeResult = {
  targetId: string;
  mode: ProbeModeValue;
  verdict: ProbeVerdictValue;
  statusCode: number | null;
  latencyMs: number | null;
  details: string[];
  evidence: ProbeEvidenceArtifact;
  url: string;
};

export async function runHttpProbe(input: {
  targetId: string;
  mode?: ProbeModeValue;
  /** Live URL override; ignored in fixture mode. */
  liveUrl?: string;
  expectation?: HttpProbeExpectation;
  nowIso: string;
  fetchImpl?: typeof fetch;
}): Promise<HttpProbeResult> {
  const mode = input.mode ?? ProbeMode.FIXTURE;
  const evidenceId = `http-ev-${input.targetId}-${Date.now()}`;

  if (mode === ProbeMode.FIXTURE) {
    const fixture = FIXTURE_HTTP_TARGETS[input.targetId];
    if (!fixture) {
      return {
        targetId: input.targetId,
        mode,
        verdict: ProbeVerdict.FAILURE,
        statusCode: null,
        latencyMs: 0,
        details: [`Unknown fixture HTTP target: ${input.targetId}`],
        url: "",
        evidence: {
          evidenceId,
          kind: ProbeKind.HTTP,
          mode,
          summary: `Unknown fixture target ${input.targetId}`,
          facts: { targetId: input.targetId },
          recordedAtIso: input.nowIso,
        },
      };
    }
    const expectation = input.expectation ?? fixture.expectation;
    const evaluated = evaluateHttpProbe({
      observedStatus: fixture.statusCode,
      observedBody: fixture.body,
      expectation,
      latencyMs: 1,
    });
    return {
      targetId: input.targetId,
      mode,
      verdict: evaluated.verdict,
      statusCode: fixture.statusCode,
      latencyMs: 1,
      details: evaluated.details,
      url: fixture.url,
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary:
          evaluated.verdict === ProbeVerdict.SUCCESS
            ? `Fixture HTTP probe ok for ${input.targetId}`
            : `Fixture HTTP probe failed for ${input.targetId}`,
        facts: {
          statusCode: fixture.statusCode,
          url: fixture.url,
          detailCount: evaluated.details.length,
        },
        recordedAtIso: input.nowIso,
      },
    };
  }

  // Live mode — real fetch; no credentials required for public HTTP.
  const url =
    input.liveUrl ??
    FIXTURE_HTTP_TARGETS[input.targetId]?.url ??
    null;
  if (!url || url.includes("example.worksocial.local")) {
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.NOT_WIRED,
      statusCode: null,
      latencyMs: null,
      details: [
        "Live HTTP target not configured (fixture host only). Provide liveUrl for real probes.",
      ],
      url: url ?? "",
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: "Live HTTP probe NOT_WIRED — no production URL bound",
        facts: { targetId: input.targetId },
        recordedAtIso: input.nowIso,
      },
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    });
    const body = await res.text();
    const latencyMs = Date.now() - started;
    const expectation =
      input.expectation ??
      FIXTURE_HTTP_TARGETS[input.targetId]?.expectation ?? {
        statusCode: 200,
        bodyContains: [],
        maxLatencyMs: null,
      };
    const evaluated = evaluateHttpProbe({
      observedStatus: res.status,
      observedBody: body,
      expectation,
      latencyMs,
    });
    return {
      targetId: input.targetId,
      mode,
      verdict: evaluated.verdict,
      statusCode: res.status,
      latencyMs,
      details: evaluated.details,
      url,
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: `Live HTTP probe ${evaluated.verdict} for ${url}`,
        facts: {
          statusCode: res.status,
          latencyMs,
          url,
        },
        recordedAtIso: input.nowIso,
      },
    };
  } catch (err) {
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.FAILURE,
      statusCode: null,
      latencyMs: Date.now() - started,
      details: [
        `Live HTTP fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
      url,
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: `Live HTTP probe failed for ${url}`,
        facts: { url },
        recordedAtIso: input.nowIso,
      },
    };
  }
}
