/**
 * Fixture proof for T-X047 — layout-specific capacity mismatch filters correctly.
 *
 * Exercises the real `runSemanticSearch` path with layoutCapacities on catalog
 * entries. Theater/default max must not admit a classroom-layout request that
 * exceeds classroom capacity. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  RoomLayout,
  parseSearchConstraints,
  runSemanticSearch,
  type SemanticSearchIndex,
  type SoakProofRecord,
} from "@worksocial/domain";

function fixtureIndex(nowIso: string): SemanticSearchIndex {
  return {
    indexId: "idx-layout-capacity-fixture",
    version: 1,
    updatedAtIso: nowIso,
    fixtureOnly: true,
    entries: [
      {
        entryId: "hudson-fixture",
        name: "Hudson Boardroom",
        category: "Meeting",
        capacity: 40,
        location: "Jersey City",
        amenities: ["display", "whiteboard"],
        sourcePageId: "page-hudson",
        groundedFactIds: ["fact-hudson"],
        inaccessible: false,
        priceKnown: false,
        priceLabel: null,
        fixtureOnly: true,
        layoutCapacities: {
          [RoomLayout.THEATER]: 40,
          [RoomLayout.CLASSROOM]: 12,
          [RoomLayout.BOARDROOM]: 8,
        },
      },
      {
        entryId: "exchange-fixture",
        name: "Exchange Training",
        category: "Meeting",
        capacity: 24,
        location: "Jersey City",
        amenities: ["display", "whiteboard"],
        sourcePageId: "page-exchange",
        groundedFactIds: ["fact-exchange"],
        inaccessible: false,
        priceKnown: true,
        priceLabel: "contact for quote",
        fixtureOnly: true,
        layoutCapacities: {
          [RoomLayout.CLASSROOM]: 24,
          [RoomLayout.THEATER]: 30,
        },
      },
    ],
  };
}

/**
 * Complete expected proof set for T-X047 fixture ACCEPTED.
 */
export function proofLayoutSpecificCapacityMismatchFilters(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const index = fixtureIndex(nowIso);

  const constraints = parseSearchConstraints(
    "Meeting room in classroom seating for 20 people in Jersey City with display",
  );
  if (
    constraints.layout === RoomLayout.CLASSROOM &&
    constraints.people === 20 &&
    constraints.category === "Meeting"
  ) {
    details.push(
      "parseSearchConstraints retains layout=classroom people=20 category=Meeting",
    );
  } else {
    passed = false;
    details.push(`Constraint parse unexpectedly ${JSON.stringify(constraints)}`);
  }

  const mismatch = runSemanticSearch({
    queryId: "q-layout-mismatch",
    rawQuery:
      "Meeting room in classroom seating for 20 people in Jersey City with display",
    index,
    createdAtIso: nowIso,
  });
  const hitIds = mismatch.hits.map((h) => h.entryId);
  if (hitIds.length === 1 && hitIds[0] === "exchange-fixture") {
    details.push(
      `runSemanticSearch classroom seating 20 → exchange only (hudson layout mismatch); status=${mismatch.answerStatus}`,
    );
  } else {
    passed = false;
    details.push(
      `Mismatch search unexpectedly hits=${hitIds.join(",")} status=${mismatch.answerStatus}`,
    );
  }

  const fit = runSemanticSearch({
    queryId: "q-layout-fit",
    rawQuery:
      "Meeting room in classroom seating for 10 people in Jersey City with display",
    index,
    createdAtIso: nowIso,
  });
  if (fit.hits.some((h) => h.entryId === "hudson-fixture")) {
    details.push("classroom seating 10 → hudson admitted (layout capacity 12)");
  } else {
    passed = false;
    details.push(
      `Fit search unexpectedly hits=${fit.hits.map((h) => h.entryId).join(",")}`,
    );
  }

  if (
    index.entries[0]!.capacity >= 20 &&
    (index.entries[0]!.layoutCapacities?.[RoomLayout.CLASSROOM] ?? 0) < 20
  ) {
    details.push(
      "Counterfactual: marketing capacity 40 would wrongly allow classroom 20",
    );
  } else {
    passed = false;
    details.push("Fixture capacities do not demonstrate layout mismatch");
  }

  const amb = parseSearchConstraints(
    "Meeting room in classroom seating and theater layout for 20 in Jersey City",
  );
  if (
    amb.layout === null &&
    amb.unresolvedConstraints.some((c) => c.startsWith("layout:ambiguous:"))
  ) {
    details.push("Ambiguous layout phrases → unresolved clarify (no silent pick)");
  } else {
    passed = false;
    details.push(`Ambiguous parse unexpectedly ${JSON.stringify(amb)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-layout-capacity-${randomUUID()}`,
    kind: SoakProofKind.LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-layout-cap-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
