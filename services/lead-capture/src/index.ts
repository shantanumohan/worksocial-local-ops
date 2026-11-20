export {
  createLeadCaptureService,
  type LeadCaptureAuthority,
  type LeadCaptureService,
  type LeadCaptureServiceOptions,
} from "./service.js";

export {
  FIXTURE_CONTACT_FORM_HTML,
  isPlaywrightEnabled,
  runBrowserFormSubmit,
  type BrowserFormSubmitResult,
} from "./browser-harness.js";

export const packageName = "@worksocial/lead-capture" as const;
