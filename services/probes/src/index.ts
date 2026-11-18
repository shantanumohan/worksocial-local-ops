/**
 * @worksocial/probes — R1-05 monitoring: HTTP/DOM probes, form-to-CRM canaries,
 * integration reconciliation. Fixture-first; live Zoho NOT_WIRED without credentials.
 */

export const packageName = "@worksocial/probes" as const;

export {
  FIXTURE_CONTACT_HTML,
  FIXTURE_HTTP_TARGETS,
  FIXTURE_DOM_JOURNEY_STEPS,
} from "./fixtures.js";
export { runHttpProbe, type HttpProbeResult } from "./http-probe.js";
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
