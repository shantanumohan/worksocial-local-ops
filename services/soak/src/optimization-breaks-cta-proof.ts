/**
 * Fixture proof for T-X043 — optimization breaks CTA → journey regression fails.
 * SEO/content optimization that rewrites the booking CTA fails the DOM journey
 * probe; the optimization CTA journey gate then blocks release
 * (JOURNEY_REGRESSION_FAILED). External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  ProbeVerdict,
  SoakProofKind,
  evaluateOptimizationCtaJourneyGate,
  type DomJourneyStep,
  type SoakProofRecord,
} from "@worksocial/domain";

const CTA_JOURNEY_STEPS: readonly DomJourneyStep[] = [
  {
    stepId: "form-visible",
    target: 'id="contact"',
    action: "assert_visible",
    expected: null,
  },
  {
    stepId: "cta-text",
    target: "Book a tour",
    action: "assert_text",
    expected: "Book a tour",
  },
  {
    stepId: "tour-href",
    target: 'href="/tour"',
    action: "assert_href",
    expected: "/tour",
  },
  {
    stepId: "submit-button",
    target: "Submit",
    action: "assert_visible",
    expected: null,
  },
];

const HEALTHY_HTML = `<!doctype html>
<html lang="en">
<head><title>WorkSocial Contact</title></head>
<body>
  <h1>Contact WorkSocial</h1>
  <a href="/tour">Book a tour</a>
  <form id="contact" action="/api/forms/contact" method="post">
    <label>Email <input name="email" type="email" required /></label>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

/** SEO content "optimization" that rewrites CTA text + kills tour href. */
const BROKEN_OPTIMIZATION_HTML = `<!doctype html>
<html lang="en">
<head><title>WorkSocial Contact — Optimized headline</title></head>
<body>
  <h1>Discover flexible workspace today</h1>
  <a href="/broken-cta">Learn more about our spaces</a>
  <form id="contact" action="/api/forms/contact" method="post">
    <label>Email <input name="email" type="email" required /></label>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

/** Metadata-only optimization that preserves the booking CTA. */
const SAFE_OPTIMIZATION_HTML = `<!doctype html>
<html lang="en">
<head><title>WorkSocial Contact | Book a Hudson tour</title>
<meta name="description" content="Book a tour at WorkSocial Hudson" /></head>
<body>
  <h1>Contact WorkSocial</h1>
  <a href="/tour">Book a tour</a>
  <form id="contact" action="/api/forms/contact" method="post">
    <label>Email <input name="email" type="email" required /></label>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

/**
 * Complete expected proof set for T-X043 fixture ACCEPTED.
 */
export function proofOptimizationBreaksCtaJourneyFails(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const healthy = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: HEALTHY_HTML,
    journeySteps: CTA_JOURNEY_STEPS,
  });
  if (
    healthy.allowed === true &&
    healthy.code === null &&
    healthy.journeyVerdict === ProbeVerdict.SUCCESS
  ) {
    details.push(
      "Baseline healthy page CTA journey SUCCESS — gate allowed",
    );
  } else {
    passed = false;
    details.push(`Healthy baseline unexpectedly ${JSON.stringify(healthy)}`);
  }

  const broken = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: BROKEN_OPTIMIZATION_HTML,
    journeySteps: CTA_JOURNEY_STEPS,
  });
  if (
    broken.allowed === false &&
    broken.code === "JOURNEY_REGRESSION_FAILED" &&
    broken.journeyVerdict === ProbeVerdict.FAILURE &&
    broken.failedStepDetails.some((d) => /cta-text|tour-href/i.test(d)) &&
    broken.reasons.some((r) => /Optimization breaks CTA/i.test(r))
  ) {
    details.push(
      "SEO content optimization rewrote CTA → journey FAILURE; gate JOURNEY_REGRESSION_FAILED",
    );
  } else {
    passed = false;
    details.push(
      `Broken-CTA optimization unexpectedly ${JSON.stringify(broken)}`,
    );
  }

  const safe = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: SAFE_OPTIMIZATION_HTML,
    journeySteps: CTA_JOURNEY_STEPS,
  });
  if (
    safe.allowed === true &&
    safe.code === null &&
    safe.journeyVerdict === ProbeVerdict.SUCCESS
  ) {
    details.push(
      "Positive control: metadata-only optimization preserves CTA → journey SUCCESS + gate allowed",
    );
  } else {
    passed = false;
    details.push(
      `Safe optimization unexpectedly ${JSON.stringify(safe)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-opt-breaks-cta-${randomUUID()}`,
    kind: SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx043-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
