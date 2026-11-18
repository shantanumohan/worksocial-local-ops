/**
 * Offline fixture catalog for HTTP/DOM probes (CI-safe, no network).
 */

import type { DomJourneyStep, HttpProbeExpectation } from "@worksocial/domain";

export const FIXTURE_CONTACT_HTML = `<!doctype html>
<html lang="en">
<head><title>WorkSocial Contact</title></head>
<body>
  <h1>Contact WorkSocial</h1>
  <a href="/tour">Book a tour</a>
  <form id="contact" action="/api/forms/contact" method="post">
    <label>Email <input name="email" type="email" required /></label>
    <label>Name <input name="name" type="text" required /></label>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;

export const FIXTURE_HTTP_TARGETS: Record<
  string,
  {
    url: string;
    statusCode: number;
    body: string;
    expectation: HttpProbeExpectation;
  }
> = {
  "fixture-contact": {
    url: "https://example.worksocial.local/contact",
    statusCode: 200,
    body: FIXTURE_CONTACT_HTML,
    expectation: {
      statusCode: 200,
      bodyContains: ["Contact WorkSocial", 'id="contact"', "Submit"],
      maxLatencyMs: null,
    },
  },
  "fixture-contact-broken": {
    url: "https://example.worksocial.local/contact-broken",
    statusCode: 500,
    body: "Internal Server Error",
    expectation: {
      statusCode: 200,
      bodyContains: ["Contact WorkSocial"],
      maxLatencyMs: null,
    },
  },
};

export const FIXTURE_DOM_JOURNEY_STEPS: DomJourneyStep[] = [
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
