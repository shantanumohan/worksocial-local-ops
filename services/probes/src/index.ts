/**
 * @worksocial/probes — R1-05 monitoring: HTTP/DOM probes, form-to-CRM canaries,
 * integration reconciliation. Fixture-first; live Zoho NOT_WIRED without credentials.
 */

export const packageName = "@worksocial/probes" as const;

export {
  FIXTURE_CONTACT_HTML,
  FIXTURE_HTTP_TARGETS,
  FIXTURE_DOM_TARGETS,
  FIXTURE_DOM_JOURNEY_STEPS,
  approvedLiveProbeHosts,
} from "./fixtures.js";
export {
  runHttpProbe,
  DEFAULT_LIVE_HTTP_TIMEOUT_MS,
  type HttpProbeResult,
} from "./http-probe.js";
export {
  runDomJourneyProbe,
  isPlaywrightAvailable,
  type DomJourneyResult,
} from "./dom-journey.js";
export {
  runFormToCrmCanary,
  hashCanaryPayload,
  type FormCanaryAuthority,
  type FormCanaryResult,
} from "./form-canary.js";
export {
  createProbeService,
  type ProbeService,
} from "./service.js";
export {
  validateLiveProbeUrl,
  validateRedirectTarget,
  type UrlPolicyVerdict,
} from "./url-policy.js";
