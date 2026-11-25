/**
 * Fixture proof for T-X043 — optimization breaks CTA → journey regression fails.
 * SEO/content optimization that rewrites the booking CTA fails the DOM journey
 * probe; the optimization CTA journey gate then blocks release
 * (JOURNEY_REGRESSION_FAILED). Empty journey steps refused. Live NOT_WIRED.
 * External effects: NONE. Hillclimb: honesty stamps, href-only break,
 * JOURNEY_STEPS_REQUIRED.
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

/** Href-only break: CTA text preserved, tour destination rewritten. */
const HREF_ONLY_BROKEN_HTML = `<!doctype html>
<html lang="en">
<head><title>WorkSocial Contact</title></head>
<body>
  <h1>Contact WorkSocial</h1>
  <a href="/pricing">Book a tour</a>
  <form id="contact" action="/api/forms/contact" method="post">
    <label>Email <input name="email" type="email" required /></label>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

/**
 * Decoy footer: broken CTA points to /pricing, but an unrelated footer link
 * still contains href="/tour" — must not silently pass substring checks.
 */
const DECOY_FOOTER_BROKEN_CTA_HTML = `<!doctype html>
<html lang="en">
<head><title>WorkSocial Contact</title></head>
<body>
  <h1>Contact WorkSocial</h1>
  <a href="/pricing">Book a tour</a>
  <form id="contact" action="/api/forms/contact" method="post">
    <label>Email <input name="email" type="email" required /></label>
    <button type="submit">Submit</button>
  </form>
  <footer><a href="/tour">Visit our locations</a></footer>
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
    healthy.journeyVerdict === ProbeVerdict.SUCCESS &&
    healthy.passedStepIds.length === CTA_JOURNEY_STEPS.length &&
    healthy.liveProviderWiring === "NOT_WIRED" &&
    healthy.externalEffects === "NONE" &&
    healthy.fixtureOnly === true
  ) {
    details.push(
      "Baseline healthy page CTA journey SUCCESS — gate allowed; liveProviderWiring=NOT_WIRED",
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
    broken.reasons.some((r) => /Optimization breaks CTA/i.test(r)) &&
    broken.liveProviderWiring === "NOT_WIRED"
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

  const hrefOnly = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: HREF_ONLY_BROKEN_HTML,
    journeySteps: CTA_JOURNEY_STEPS,
  });
  if (
    hrefOnly.allowed === false &&
    hrefOnly.code === "JOURNEY_REGRESSION_FAILED" &&
    hrefOnly.failedStepDetails.some((d) => /tour-href/i.test(d)) &&
    hrefOnly.passedStepIds.includes("cta-text")
  ) {
    details.push(
      "Href-only CTA break (text preserved) → JOURNEY_REGRESSION_FAILED",
    );
  } else {
    passed = false;
    details.push(
      `Href-only break unexpectedly ${JSON.stringify(hrefOnly)}`,
    );
  }

  const decoy = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: DECOY_FOOTER_BROKEN_CTA_HTML,
    journeySteps: CTA_JOURNEY_STEPS,
  });
  if (
    decoy.allowed === false &&
    decoy.code === "JOURNEY_REGRESSION_FAILED" &&
    decoy.failedStepDetails.some((d) => /same <a>|decoy/i.test(d))
  ) {
    details.push(
      "Decoy footer href=/tour cannot mask Book a tour CTA → /pricing; JOURNEY_REGRESSION_FAILED",
    );
  } else {
    passed = false;
    details.push(`Decoy footer break unexpectedly ${JSON.stringify(decoy)}`);
  }

  const safe = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: SAFE_OPTIMIZATION_HTML,
    journeySteps: CTA_JOURNEY_STEPS,
  });
  if (
    safe.allowed === true &&
    safe.code === null &&
    safe.journeyVerdict === ProbeVerdict.SUCCESS &&
    safe.liveProviderWiring === "NOT_WIRED"
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

  const emptySteps = evaluateOptimizationCtaJourneyGate({
    optimizedHtml: HEALTHY_HTML,
    journeySteps: [],
  });
  if (
    emptySteps.allowed === false &&
    emptySteps.code === "JOURNEY_STEPS_REQUIRED" &&
    emptySteps.journeyVerdict === null
  ) {
    details.push(
      "Empty journey steps → JOURNEY_STEPS_REQUIRED (no silent allow)",
    );
  } else {
    passed = false;
    details.push(
      `Empty journey steps unexpectedly ${JSON.stringify(emptySteps)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

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
