export {
  createActionGateway,
  digestPayload,
  ActionClass,
  OperatingMode,
  type ActionGateway,
  type GatewayIntent,
  type GatewayAuthoritySnapshot,
  type GatewayDecisionRecord,
  type GatewaySubmitResult,
} from "./gateway.js";

export const packageName = "@worksocial/action-gateway" as const;
