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
  SearchAnswerStatus,
  filterByLayoutCapacity,
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
        // Default/marketing 20 < theater 40 so theatre-30 admission cannot
        // pass via the default-capacity path (Codex P2).
        capacity: 20,
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
      "Counterfactual: marketing capacity 20 would wrongly allow classroom 20",
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

  const boardroomQuery =
    "Meeting room in boardroom seating for 20 people in Jersey City with display";
  const boardConstraints = parseSearchConstraints(boardroomQuery);
  const boardFilter = filterByLayoutCapacity({
    entryId: "hudson-fixture",
    defaultCapacity: index.entries[0]!.capacity,
    layoutCapacities: index.entries[0]!.layoutCapacities ?? null,
    requestedLayout: RoomLayout.BOARDROOM,
    people: 20,
  });
  const boardroomOver = runSemanticSearch({
    queryId: "q-layout-boardroom-over",
    rawQuery: boardroomQuery,
    index,
    createdAtIso: nowIso,
  });
  if (
    boardConstraints.layout === RoomLayout.BOARDROOM &&
    boardConstraints.people === 20 &&
    boardFilter.allowed === false &&
    boardFilter.effectiveCapacity === 8 &&
    boardFilter.defaultWouldAllowMismatch === true &&
    boardFilter.source === "layout_specific" &&
    !boardroomOver.hits.some((h) => h.entryId === "hudson-fixture") &&
    // Capacity filter isolates the claim; reject only clarify (ambiguous path).
    // Fixture searches commonly land answerStatus=unknown when price is unknown.
    boardroomOver.answerStatus !== SearchAnswerStatus.CLARIFY
  ) {
    details.push(
      "boardroom seating 20 → hudson excluded (boardroom capacity 8; marketing max would wrongly allow); filter=layout_specific",
    );
  } else {
    passed = false;
    details.push(
      `Boardroom over-cap unexpectedly parse=${JSON.stringify(boardConstraints)} filter=${JSON.stringify(boardFilter)} hits=${boardroomOver.hits.map((h) => h.entryId).join(",")} status=${boardroomOver.answerStatus}`,
    );
  }

  const theaterQuery =
    "Meeting room in theatre seating for 30 people in Jersey City with display";
  const theaterConstraints = parseSearchConstraints(theaterQuery);
  const theaterFilter = filterByLayoutCapacity({
    entryId: "hudson-fixture",
    defaultCapacity: index.entries[0]!.capacity,
    layoutCapacities: index.entries[0]!.layoutCapacities ?? null,
    requestedLayout: RoomLayout.THEATER,
    people: 30,
  });
  const theaterFit = runSemanticSearch({
    queryId: "q-layout-theater-fit",
    rawQuery: theaterQuery,
    index,
    createdAtIso: nowIso,
  });
  // Default capacity 20 cannot admit 30 — only theater layout capacity 40 can.
  if (
    theaterConstraints.layout === RoomLayout.THEATER &&
    theaterConstraints.people === 30 &&
    index.entries[0]!.capacity < 30 &&
    theaterFilter.allowed === true &&
    theaterFilter.effectiveCapacity === 40 &&
    theaterFilter.source === "layout_specific" &&
    theaterFit.hits.some((h) => h.entryId === "hudson-fixture") &&
    theaterFit.answerStatus !== SearchAnswerStatus.CLARIFY
  ) {
    details.push(
      "theatre seating 30 → hudson admitted (theater layout capacity 40; default 20 would exclude); filter=layout_specific",
    );
  } else {
    passed = false;
    details.push(
      `Theater fit unexpectedly parse=${JSON.stringify(theaterConstraints)} filter=${JSON.stringify(theaterFilter)} hits=${theaterFit.hits.map((h) => h.entryId).join(",")} status=${theaterFit.answerStatus}`,
    );
  }

  details.push(
    "liveSearchProvider=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );
  details.push(
    "Distinct from HARD_SEARCH_CONSTRAINTS_NO_INVENTION (T-US-046/T-X048) and SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON (T-US-045)",
  );

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
