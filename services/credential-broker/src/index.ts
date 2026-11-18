export {
  createCredentialBroker,
  type BrokerPrincipal,
  type CredentialBroker,
  type CredentialReference,
  type ScopedCredentialHandle,
  type BrokerMintRequest,
  type BrokerMintResult,
} from "./broker.js";

export const packageName = "@worksocial/credential-broker" as const;
