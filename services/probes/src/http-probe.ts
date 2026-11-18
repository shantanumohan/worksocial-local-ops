/**
 * Deterministic HTTP probes — fixture catalog by default; live fetch optional.
 * Live mode: allowlisted public https only, request/body timeout, redirect re-check.
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
import { validateLiveProbeUrl, validateRedirectTarget } from "./url-policy.js";

export const DEFAULT_LIVE_HTTP_TIMEOUT_MS = 10_000;

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

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Manual redirect so each hop can be policy-checked.
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function followRedirectsSafely(
  fetchImpl: typeof fetch,
  startUrl: string,
  timeoutMs: number,
  deadline: number,
): Promise<{ res: Response; finalUrl: string } | { error: string }> {
  let current = startUrl;
  for (let hop = 0; hop < 5; hop++) {
    const remaining = Math.max(1, deadline - Date.now());
    const res = await fetchWithTimeout(
      fetchImpl,
      current,
      Math.min(timeoutMs, remaining),
    );
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { error: `Redirect ${res.status} without Location header` };
      }
      const next = new URL(location, current).toString();
      const check = validateRedirectTarget(next, current);
      if (!check.ok) {
        return { error: check.reason };
      }
      current = check.url.toString();
      continue;
    }
    return { res, finalUrl: current };
  }
  return { error: "Too many redirects for live HTTP probe" };
}

async function readBodyWithTimeout(
  res: Response,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Prefer streaming abort when supported; fall back to race.
    const textPromise = res.text();
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new Error("HTTP probe body read timed out"));
      });
    });
    return await Promise.race([textPromise, abortPromise]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runHttpProbe(input: {
  targetId: string;
  mode?: ProbeModeValue;
  /** Live URL override; ignored in fixture mode. Must pass URL policy. */
  liveUrl?: string;
  expectation?: HttpProbeExpectation;
  nowIso: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
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

  const candidate =
    input.liveUrl ??
    FIXTURE_HTTP_TARGETS[input.targetId]?.url ??
    null;
  if (!candidate || candidate.includes("example.worksocial.local")) {
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.NOT_WIRED,
      statusCode: null,
      latencyMs: null,
      details: [
        "Live HTTP target not configured. Provide an allowlisted liveUrl (WORKSOCIAL_PROBE_ALLOWED_HOSTS).",
      ],
      url: candidate ?? "",
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: "Live HTTP probe NOT_WIRED — no approved production URL bound",
        facts: { targetId: input.targetId },
        recordedAtIso: input.nowIso,
      },
    };
  }

  const policy = validateLiveProbeUrl(candidate);
  if (!policy.ok) {
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.FAILURE,
      statusCode: null,
      latencyMs: null,
      details: [policy.reason],
      url: candidate,
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: `Live HTTP probe rejected by URL policy: ${policy.reason}`,
        facts: { targetId: input.targetId, url: candidate },
        recordedAtIso: input.nowIso,
      },
    };
  }

  const url = policy.url.toString();
  const timeoutMs = input.timeoutMs ?? DEFAULT_LIVE_HTTP_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;
  const started = Date.now();
  const deadline = started + timeoutMs;
  try {
    const followed = await followRedirectsSafely(
      fetchImpl,
      url,
      timeoutMs,
      deadline,
    );
    if ("error" in followed) {
      return {
        targetId: input.targetId,
        mode,
        verdict: ProbeVerdict.FAILURE,
        statusCode: null,
        latencyMs: Date.now() - started,
        details: [followed.error],
        url,
        evidence: {
          evidenceId,
          kind: ProbeKind.HTTP,
          mode,
          summary: `Live HTTP probe failed policy/redirect: ${followed.error}`,
          facts: { url },
          recordedAtIso: new Date().toISOString(),
        },
      };
    }

    const remaining = Math.max(1, deadline - Date.now());
    const body = await readBodyWithTimeout(followed.res, remaining);
    const latencyMs = Date.now() - started;
    const expectation =
      input.expectation ??
      FIXTURE_HTTP_TARGETS[input.targetId]?.expectation ?? {
        statusCode: 200,
        bodyContains: [],
        maxLatencyMs: null,
      };
    const evaluated = evaluateHttpProbe({
      observedStatus: followed.res.status,
      observedBody: body,
      expectation,
      latencyMs,
    });
    return {
      targetId: input.targetId,
      mode,
      verdict: evaluated.verdict,
      statusCode: followed.res.status,
      latencyMs,
      details: evaluated.details,
      url: followed.finalUrl,
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: `Live HTTP probe ${evaluated.verdict} for ${followed.finalUrl}`,
        facts: {
          statusCode: followed.res.status,
          latencyMs,
          url: followed.finalUrl,
        },
        recordedAtIso: new Date().toISOString(),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      message.includes("abort") || message.toLowerCase().includes("timed out");
    return {
      targetId: input.targetId,
      mode,
      verdict: ProbeVerdict.FAILURE,
      statusCode: null,
      latencyMs: Date.now() - started,
      details: [
        timedOut
          ? `Live HTTP probe timed out after ${timeoutMs}ms`
          : `Live HTTP fetch failed: ${message}`,
      ],
      url,
      evidence: {
        evidenceId,
        kind: ProbeKind.HTTP,
        mode,
        summary: `Live HTTP probe failed for ${url}`,
        facts: { url, timedOut },
        recordedAtIso: new Date().toISOString(),
      },
    };
  }
}
