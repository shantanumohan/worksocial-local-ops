export {
  createCredentialBroker,
  type BrokerPrincipal,
  type CredentialBroker,
  type CredentialReference,
  type ScopedCredentialHandle,
  type BrokerMintRequest,
  type BrokerMintResult,
} from "./broker.js";

export {
  createBrowserAuthFixtureVault,
  requestBrowserAuthState,
  type BrowserAuthBoundaryPrincipal,
  type BrowserAuthBoundaryRequest,
  type BrowserAuthBoundaryResult,
  type BrowserAuthFixtureVault,
} from "./browser-auth-boundary.js";

export const packageName = "@worksocial/credential-broker" as const;
