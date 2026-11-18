/**
 * @worksocial/knowledge — R1-06 fact registry, instruction ingestion,
 * demand/trend/FAQ/rank data model with honest support labels.
 */

export const packageName = "@worksocial/knowledge" as const;

export {
  FIXTURE_DEMAND_SOURCE,
  buildFixtureKnowledgeSeed,
  fixtureEvidence,
} from "./fixtures.js";

export {
  createKnowledgeService,
  CollectionMethod,
  DemandSignalKind,
  FactVerificationDecision,
  SupportLabel,
  type KnowledgeService,
} from "./service.js";
