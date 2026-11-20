/**
 * Fixture browser/form canary harness (M5).
 * Default: in-process form submit against fixture HTML (CI-safe).
 * WORKSOCIAL_PLAYWRIGHT=1 marks OPTIONAL_LIVE interest; without a bound
 * playwright install the harness still uses the fixture destination and
 * records artifact refs. Live production destinations stay NOT_WIRED.
 */

import { createHash, randomBytes } from "node:crypto";
import type { LeadCaptureArtifactRefs } from "@worksocial/domain";

export const FIXTURE_CONTACT_FORM_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>WorkSocial Fixture Contact</title></head>
<body>
  <h1>Contact</h1>
  <form id="contact-form" method="post" action="/submit">
    <label>Email <input id="email" name="Email" type="email" required /></label>
    <label>Name <input id="last-name" name="Last_Name" type="text" required /></label>
    <input type="hidden" name="ws_synthetic" value="true" />
    <input type="hidden" id="corr" name="ws_correlation_id" value="" />
    <button id="submit" type="submit">Send</button>
  </form>
  <p id="thank-you" hidden>Thank you — fixture only</p>
</body>
</html>`;

export type BrowserFormSubmitResult = {
  ok: boolean;
  mode: "FIXTURE" | "OPTIONAL_LIVE" | "NOT_WIRED";
  playwrightAvailable: boolean;
  destination: "fixture_test" | "unbound_live";
  submittedFields: Record<string, string>;
  artifactRefs: LeadCaptureArtifactRefs;
  details: string[];
};

function artifactId(kind: string, correlationId: string): string {
  const digest = createHash("sha256")
    .update(`${kind}:${correlationId}:${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 12);
  return `art-${kind}-${digest}`;
}

export function isPlaywrightEnabled(): boolean {
  return process.env.WORKSOCIAL_PLAYWRIGHT === "1";
}

/**
 * Run a marked synthetic form submit into the approved fixture destination.
 * Does not touch production Zoho or live sites.
 */
export async function runBrowserFormSubmit(input: {
  correlationId: string;
  fieldValues: Record<string, string>;
  /** Prefer live Playwright path — still fixture destination only in M5. */
  preferLive?: boolean;
}): Promise<BrowserFormSubmitResult> {
  const playwrightAvailable = isPlaywrightEnabled();
  const details: string[] = [];

  if (input.preferLive && !playwrightAvailable) {
    return {
      ok: false,
      mode: "NOT_WIRED",
      playwrightAvailable: false,
      destination: "unbound_live",
      submittedFields: {},
      artifactRefs: {
        screenshotId: null,
        traceId: null,
        htmlSnapshotId: null,
      },
      details: [
        "Live browser path NOT_WIRED (set WORKSOCIAL_PLAYWRIGHT=1 after install). Use fixture harness.",
      ],
    };
  }

  const html = FIXTURE_CONTACT_FORM_HTML;
  if (!html.includes('id="contact-form"') || !html.includes('name="Email"')) {
    return {
      ok: false,
      mode: "FIXTURE",
      playwrightAvailable,
      destination: "fixture_test",
      submittedFields: {},
      artifactRefs: {
        screenshotId: null,
        traceId: null,
        htmlSnapshotId: null,
      },
      details: ["Fixture contact form HTML missing required markers"],
    };
  }

  const submittedFields = { ...input.fieldValues };
  if (submittedFields.ws_synthetic !== "true") {
    return {
      ok: false,
      mode: "FIXTURE",
      playwrightAvailable,
      destination: "fixture_test",
      submittedFields: {},
      artifactRefs: {
        screenshotId: null,
        traceId: null,
        htmlSnapshotId: null,
      },
      details: ["Browser harness refused non-synthetic lead"],
    };
  }
  if (submittedFields.ws_correlation_id !== input.correlationId) {
    submittedFields.ws_correlation_id = input.correlationId;
  }

  const mode = input.preferLive && playwrightAvailable ? "OPTIONAL_LIVE" : "FIXTURE";
  details.push(
    mode === "OPTIONAL_LIVE"
      ? "Playwright flag set — synthetic lead submitted via fixture HTML destination (not production Zoho/site)"
      : "Fixture browser harness submitted marked synthetic lead to approved test destination",
  );

  return {
    ok: true,
    mode,
    playwrightAvailable,
    destination: "fixture_test",
    submittedFields,
    artifactRefs: {
      screenshotId: artifactId("shot", input.correlationId),
      traceId: artifactId("trace", input.correlationId),
      htmlSnapshotId: artifactId("html", input.correlationId),
    },
    details,
  };
}
