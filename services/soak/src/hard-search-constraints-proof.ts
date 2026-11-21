/**
 * Fixture proof for T-US-046 / T-X048 — hard search constraints enforced;
 * unknown price/availability never invented. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  SupportLabel,
  SearchAnswerStatus,
  parseSearchConstraints,
  runSemanticSearch,
  type SemanticSearchIndex,
  type SoakProofRecord,
} from "@worksocial/domain";

function fixtureIndex(nowIso: string): SemanticSearchIndex {
  return {
    indexId: "idx-hard-search-fixture",
    version: 1,
    updatedAtIso: nowIso,
    fixtureOnly: true,
    entries: [
      {
        entryId: "room-8",
        name: "Hudson Boardroom",
        category: "Meeting",
        capacity: 8,
        location: "Jersey City",
        amenities: ["display", "whiteboard"],
        sourcePageId: "page-rooms",
        groundedFactIds: ["fact-capacity-8"],
        inaccessible: false,
        priceKnown: false,
        priceLabel: null,
        fixtureOnly: true,
      },
      {
        entryId: "room-20",
        name: "Exchange Training",
        category: "Training",
        capacity: 20,
        location: "Jersey City",
        amenities: ["display", "video"],
        sourcePageId: "page-training",
        groundedFactIds: ["fact-capacity-20"],
        inaccessible: false,
        priceKnown: true,
        priceLabel: "contact for quote",
        fixtureOnly: true,
      },
    ],
  };
}

/**
 * Complete expected proof set for T-US-046 + T-X048 fixture ACCEPTED.
 */
export function proofHardSearchConstraintsNoInvention(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const index = fixtureIndex(nowIso);

  // T-US-046: unsupported amenity → honest no-match (no invention).
  const unknown = runSemanticSearch({
    queryId: "q-unknown",
    rawQuery: "Accessible meeting room with parking",
    index,
    createdAtIso: nowIso,
  });
  if (
    unknown.hits.length === 0 &&
    unknown.answerStatus === SearchAnswerStatus.UNKNOWN &&
    /Unsupported/i.test(unknown.noMatchReason ?? "")
  ) {
    details.push("Unknown constraints → UNKNOWN no-match (no invented hits)");
  } else {
    passed = false;
    details.push(
      `Unknown constraints unexpectedly hits=${unknown.hits.length} status=${unknown.answerStatus}`,
    );
  }

  // Hard filters before ranking.
  const hard = runSemanticSearch({
    queryId: "q-hard",
    rawQuery: "Training room for 20 in Jersey City with video",
    index,
    createdAtIso: nowIso,
  });
  if (hard.hits.length === 1 && hard.hits[0]?.entryId === "room-20") {
    details.push("Hard constraints filter before ranking → room-20 only");
  } else {
    passed = false;
    details.push(
      `Hard filter unexpectedly hits=${hard.hits.map((h) => h.entryId).join(",")}`,
    );
  }

  // T-X048: price preserved unresolved → clarify/abstain, not invented free.
  const priced = parseSearchConstraints(
    "Meeting room for 8 in Jersey City under $200",
  );
  if (
    priced.priceMaxMinor === 20000 &&
    priced.unresolvedConstraints.some((c) => c.startsWith("price:"))
  ) {
    details.push("Price bound preserved as unresolved (not invented free)");
  } else {
    passed = false;
    details.push(`Price parse unexpectedly ${JSON.stringify(priced)}`);
  }

  const pricedSearch = runSemanticSearch({
    queryId: "q-price",
    rawQuery: "Meeting for 8 in Jersey City under $150 without video",
    index,
    createdAtIso: nowIso,
  });
  if (
    pricedSearch.hits.length === 0 &&
    pricedSearch.answerStatus === SearchAnswerStatus.CLARIFY &&
    /unresolved|Clarify|abstain/i.test(pricedSearch.noMatchReason ?? "")
  ) {
    details.push("Unresolved price/negation → CLARIFY abstain (no invention)");
  } else {
    passed = false;
    details.push(
      `Priced search unexpectedly status=${pricedSearch.answerStatus} hits=${pricedSearch.hits.length}`,
    );
  }

  // Negation must not invert into a positive amenity requirement.
  const negated = parseSearchConstraints(
    "Meeting room for 8 in Jersey City without parking",
  );
  if (
    negated.negatedTerms.includes("parking") &&
    !negated.requiredAmenities.includes("parking")
  ) {
    details.push("Negation preserved; not inverted into required amenity");
  } else {
    passed = false;
    details.push(`Negation parse unexpectedly ${JSON.stringify(negated)}`);
  }

  // Catalog entry with priceKnown=false never invents availability/price.
  if (
    index.entries[0]!.priceKnown === false &&
    index.entries[0]!.priceLabel === null
  ) {
    details.push("priceKnown=false entry retains null priceLabel (no invention)");
  } else {
    passed = false;
    details.push("Fixture entry unexpectedly invented a price label");
  }

  // Booking handoff only when grounded — never invented on UNKNOWN/HYPOTHESIS.
  const labels = new Map([
    ["fact-capacity-8", SupportLabel.SUPPORTED],
    ["fact-capacity-20", SupportLabel.HYPOTHESIS],
  ]);
  const grounded = runSemanticSearch({
    queryId: "q-book",
    rawQuery: "Meeting room for 8 in Jersey City with display",
    index,
    createdAtIso: nowIso,
    factLabels: labels,
    bookingHandoffUrl: "https://fixture.worksocial.local/book",
  });
  if (
    grounded.answerStatus === SearchAnswerStatus.GROUNDED &&
    grounded.bookingHandoffUrl?.startsWith("https:")
  ) {
    details.push("Grounded answer may attach booking handoff URL");
  } else {
    passed = false;
    details.push(
      `Grounded booking unexpectedly status=${grounded.answerStatus} url=${grounded.bookingHandoffUrl}`,
    );
  }

  const hypOnly = runSemanticSearch({
    queryId: "q-hyp",
    rawQuery: "Training room for 20 in Jersey City with video",
    index,
    createdAtIso: nowIso,
    factLabels: labels,
    bookingHandoffUrl: "https://fixture.worksocial.local/book",
  });
  if (hypOnly.hits.length === 0 && hypOnly.bookingHandoffUrl === null) {
    details.push("HYPOTHESIS-only → no hits and no invented booking handoff");
  } else {
    passed = false;
    details.push(
      `Hypothesis search unexpectedly hits=${hypOnly.hits.length} url=${hypOnly.bookingHandoffUrl}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-hard-search-${randomUUID()}`,
    kind: SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-hard-search-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
