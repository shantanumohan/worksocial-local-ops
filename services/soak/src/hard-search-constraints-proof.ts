/**
 * Fixture proof for T-US-046 / T-X048 — hard search constraints enforced;
 * unknown price/availability never invented. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AdapterWiring,
  SoakProofKind,
  SupportLabel,
  SearchAnswerStatus,
  SearchGroundingStatus,
  catalogPriceIsHonest,
  cmsPublishWiringStatus,
  DEFAULT_HARD_SEARCH_RETRY_MAX_ATTEMPTS,
  evaluateHardSearchRetryBudget,
  parseSearchConstraints,
  resolveHardSearchBookingHandoff,
  resolveHardSearchInventoryClaim,
  runSemanticSearch,
  semanticSearchLiveWiringStatus,
  shouldRecordHardSearchAttemptOnBudgetDenial,
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

  // T-X048: availability phrases are unverifiable on fixture catalog — no invented open/bookable.
  const availQueries = [
    "Available meeting room for 8 in Jersey City with display",
    "bookable meeting room for 8 in Jersey City with display",
    "open meeting room for 8 in Jersey City with display",
  ];
  let availOk = true;
  for (const [i, rawQuery] of availQueries.entries()) {
    const avail = runSemanticSearch({
      queryId: `q-avail-${i}`,
      rawQuery,
      index,
      createdAtIso: nowIso,
    });
    if (
      !(
        avail.hits.length === 0 &&
        avail.answerStatus === SearchAnswerStatus.UNKNOWN &&
        /availability/i.test(avail.noMatchReason ?? "") &&
        avail.bookingHandoffUrl === null
      )
    ) {
      availOk = false;
      details.push(
        `Availability search unexpectedly status=${avail.answerStatus} hits=${avail.hits.length} q=${rawQuery}`,
      );
      break;
    }
  }
  if (availOk) {
    details.push(
      "Availability/bookable/open → UNKNOWN no-match (no invented open/bookable)",
    );
  }

  // "free"/budget language never invents priceMaxMinor=0; catalog honesty holds.
  const freeParsed = parseSearchConstraints(
    "free meeting room for 8 in Jersey City with display",
  );
  if (
    freeParsed.priceMaxMinor === null &&
    freeParsed.unresolvedConstraints.some((c) => c.includes("free")) &&
    catalogPriceIsHonest(index.entries[0]!) &&
    !catalogPriceIsHonest({ priceKnown: false, priceLabel: "free" })
  ) {
    details.push(
      "free/budget → unresolved price (not invented $0); catalogPriceIsHonest enforced",
    );
  } else {
    passed = false;
    details.push(`Free-price parse unexpectedly ${JSON.stringify(freeParsed)}`);
  }

  // Price aliases (up to $ / ≤) stay unresolved; capacity "up to N people" is not price.
  const upTo = parseSearchConstraints(
    "Meeting room for 8 in Jersey City up to $175",
  );
  const le = parseSearchConstraints(
    "Meeting room for 8 in Jersey City ≤ $175",
  );
  const capacityNotPrice = parseSearchConstraints(
    "meeting room for up to 8 people in Jersey City with display",
  );
  if (
    upTo.priceMaxMinor === 17500 &&
    upTo.unresolvedConstraints.some((c) => c.startsWith("price:")) &&
    le.priceMaxMinor === 17500 &&
    capacityNotPrice.priceMaxMinor === null &&
    !capacityNotPrice.unresolvedConstraints.some((c) => c.startsWith("price:")) &&
    capacityNotPrice.people === 8
  ) {
    details.push(
      "Price aliases up-to-$/≤ unresolved; capacity 'up to N people' not priced",
    );
  } else {
    passed = false;
    details.push(
      `Price alias parse unexpectedly upTo=${JSON.stringify(upTo)} le=${JSON.stringify(le)} cap=${JSON.stringify(capacityNotPrice)}`,
    );
  }

  // Booking handoff HTTPS-only — refuse http:// and javascript: even when grounded.
  const httpHandoff = runSemanticSearch({
    queryId: "q-http-hand",
    rawQuery: "Meeting room for 8 in Jersey City with display",
    index,
    createdAtIso: nowIso,
    factLabels: labels,
    bookingHandoffUrl: "http://fixture.worksocial.local/book",
  });
  if (
    httpHandoff.answerStatus === SearchAnswerStatus.GROUNDED &&
    httpHandoff.bookingHandoffUrl === null
  ) {
    details.push("Grounded http:// booking handoff refused (HTTPS-only)");
  } else {
    passed = false;
    details.push(
      `HTTP handoff unexpectedly status=${httpHandoff.answerStatus} url=${httpHandoff.bookingHandoffUrl}`,
    );
  }

  // Inaccessible inventory never surfaces as available.
  const closedIndex: SemanticSearchIndex = {
    ...index,
    entries: [{ ...index.entries[0]!, inaccessible: true }],
  };
  const closed = runSemanticSearch({
    queryId: "q-closed",
    rawQuery: "Meeting room for 8 in Jersey City with display",
    index: closedIndex,
    createdAtIso: nowIso,
  });
  if (
    closed.hits.length === 0 &&
    closed.bookingHandoffUrl === null &&
    closed.answerStatus === SearchAnswerStatus.NO_RESULT
  ) {
    details.push("Inaccessible inventory → no hits (not invented available)");
  } else {
    passed = false;
    details.push(
      `Inaccessible search unexpectedly status=${closed.answerStatus} hits=${closed.hits.length}`,
    );
  }

  if (
    semanticSearchLiveWiringStatus() === "NOT_WIRED" &&
    cmsPublishWiringStatus(AdapterWiring.NOT_WIRED) === "NOT_WIRED" &&
    cmsPublishWiringStatus(AdapterWiring.LIVE) === "NOT_WIRED"
  ) {
    details.push(
      "semanticSearchLiveWiringStatus=NOT_WIRED cmsPublishWiringStatus=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push("Expected semantic search / CMS publish wiring NOT_WIRED");
  }

  // T-X048 retry fence: first honest abstain within budget; second start refuses
  // without inventing inventory; RETRY_BUDGET_EXHAUSTED is not recorded.
  const firstAbstain = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.UNKNOWN,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  const secondStart = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.CLARIFY,
    attemptCount: 1,
    startingNewAttempt: true,
  });
  const groundedNoBudget = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.GROUNDED,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  if (
    DEFAULT_HARD_SEARCH_RETRY_MAX_ATTEMPTS === 1 &&
    firstAbstain.allowed &&
    firstAbstain.recordAttempt &&
    firstAbstain.consumesBudget &&
    firstAbstain.externalEffects === "NONE" &&
    firstAbstain.semanticSearchLiveWiring === "NOT_WIRED" &&
    !secondStart.allowed &&
    secondStart.code === "RETRY_BUDGET_EXHAUSTED" &&
    !secondStart.recordAttempt &&
    !shouldRecordHardSearchAttemptOnBudgetDenial(secondStart.code) &&
    secondStart.cmsPublishWiring === "NOT_WIRED" &&
    groundedNoBudget.allowed &&
    !groundedNoBudget.consumesBudget
  ) {
    details.push(
      "Hard-search retry fence (E19 cms NOT_WIRED): first abstain recorded; second RETRY_BUDGET_EXHAUSTED",
    );
  } else {
    passed = false;
    details.push(
      `Retry fence unexpectedly first=${JSON.stringify(firstAbstain)} second=${JSON.stringify(secondStart)}`,
    );
  }

  // T-X048 E14: booking handoff never invented under exhausted budget / abstain.
  const httpsBook = "https://fixture.worksocial.local/book";
  const handoffExhausted = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: secondStart,
    proposedHandoffUrl: httpsBook,
  });
  const handoffAbstain = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.UNKNOWN,
    retryBudget: firstAbstain,
    proposedHandoffUrl: httpsBook,
  });
  const handoffOk = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedNoBudget,
    proposedHandoffUrl: httpsBook,
  });
  const handoffHttp = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedNoBudget,
    proposedHandoffUrl: "http://fixture.worksocial.local/book",
  });
  if (
    !handoffExhausted.attached &&
    handoffExhausted.bookingHandoffUrl === null &&
    handoffExhausted.externalEffects === "NONE" &&
    handoffExhausted.semanticSearchLiveWiring === "NOT_WIRED" &&
    !handoffAbstain.attached &&
    handoffAbstain.bookingHandoffUrl === null &&
    handoffOk.attached &&
    handoffOk.bookingHandoffUrl === httpsBook &&
    handoffOk.cmsPublishWiring === "NOT_WIRED" &&
    !handoffHttp.attached &&
    handoffHttp.bookingHandoffUrl === null
  ) {
    details.push(
      "Booking handoff honesty: exhausted/abstain/http refuse; grounded HTTPS only",
    );
  } else {
    passed = false;
    details.push(
      `Booking handoff unexpectedly exhausted=${JSON.stringify(handoffExhausted)} ok=${JSON.stringify(handoffOk)}`,
    );
  }

  // T-X048 E16: inventory claim never invents hits/booking under exhausted budget.
  const fakeHit = {
    entryId: "invented",
    name: "Invented Room",
    score: 99,
    citations: [] as string[],
    supportedFactIds: [] as string[],
    groundingStatus: SearchGroundingStatus.GROUNDED,
    filterTrace: [] as string[],
  };
  const claimExhausted = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: secondStart,
    hits: [fakeHit],
    bookingHandoff: handoffExhausted,
  });
  const claimAbstain = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.UNKNOWN,
    retryBudget: firstAbstain,
    hits: [fakeHit],
    bookingHandoff: handoffAbstain,
  });
  const claimOk = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedNoBudget,
    hits: [fakeHit],
    bookingHandoff: handoffOk,
  });
  const claimExhaustedClarify = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.CLARIFY,
    retryBudget: secondStart,
    hits: [fakeHit],
    bookingHandoff: handoffExhausted,
  });
  if (
    claimExhausted.hits.length === 0 &&
    claimExhausted.bookingHandoffUrl === null &&
    claimExhausted.inventedInventory === false &&
    claimExhausted.externalEffects === "NONE" &&
    claimExhausted.semanticSearchLiveWiring === "NOT_WIRED" &&
    claimAbstain.hits.length === 0 &&
    claimAbstain.answerStatus === SearchAnswerStatus.UNKNOWN &&
    claimAbstain.inventedInventory === false &&
    claimExhausted.answerStatus === SearchAnswerStatus.NO_RESULT &&
    claimExhaustedClarify.answerStatus === SearchAnswerStatus.CLARIFY &&
    claimExhaustedClarify.hits.length === 0 &&
    claimExhaustedClarify.cmsPublishWiring === "NOT_WIRED" &&
    claimOk.hits.length === 1 &&
    claimOk.bookingHandoffUrl === httpsBook &&
    claimOk.inventedInventory === false
  ) {
    details.push(
      "Inventory-claim honesty (E16–E18): GROUNDED→NO_RESULT; CLARIFY preserved; abstain clear",
    );
  } else {
    passed = false;
    details.push(
      `Inventory claim unexpectedly exhausted=${JSON.stringify(claimExhausted)} ok=${JSON.stringify(claimOk)}`,
    );
  }

  // T-X048 E22 — NO_RESULT within budget still refuses handoff/inventory invention.
  const noResultBudget = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.NO_RESULT,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  const handoffNoResult = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.NO_RESULT,
    retryBudget: noResultBudget,
    proposedHandoffUrl: httpsBook,
  });
  const claimNoResult = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.NO_RESULT,
    retryBudget: noResultBudget,
    hits: [fakeHit],
    bookingHandoff: handoffNoResult,
  });
  if (
    !handoffNoResult.attached &&
    handoffNoResult.bookingHandoffUrl === null &&
    handoffNoResult.cmsPublishWiring === "NOT_WIRED" &&
    claimNoResult.hits.length === 0 &&
    claimNoResult.bookingHandoffUrl === null &&
    claimNoResult.answerStatus === SearchAnswerStatus.NO_RESULT &&
    claimNoResult.externalEffects === "NONE"
  ) {
    details.push(
      "E22: NO_RESULT within budget refuses handoff + clears hits (cms NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `E22 NO_RESULT unexpectedly handoff=${JSON.stringify(handoffNoResult)} claim=${JSON.stringify(claimNoResult)}`,
    );
  }

  // T-X048 E23 — UNKNOWN within budget still refuses handoff/inventory invention.
  const unknownBudget = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.UNKNOWN,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  const handoffUnknown = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.UNKNOWN,
    retryBudget: unknownBudget,
    proposedHandoffUrl: httpsBook,
  });
  const claimUnknown = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.UNKNOWN,
    retryBudget: unknownBudget,
    hits: [fakeHit],
    bookingHandoff: handoffUnknown,
  });
  if (
    !handoffUnknown.attached &&
    handoffUnknown.bookingHandoffUrl === null &&
    handoffUnknown.semanticSearchLiveWiring === "NOT_WIRED" &&
    claimUnknown.hits.length === 0 &&
    claimUnknown.answerStatus === SearchAnswerStatus.UNKNOWN &&
    claimUnknown.externalEffects === "NONE"
  ) {
    details.push(
      "E23: UNKNOWN within budget refuses handoff + clears hits (live NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `E23 UNKNOWN unexpectedly handoff=${JSON.stringify(handoffUnknown)} claim=${JSON.stringify(claimUnknown)}`,
    );
  }

  // T-X048 E24 — CLARIFY within budget still refuses handoff/inventory invention.
  const clarifyBudget = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.CLARIFY,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  const handoffClarify = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.CLARIFY,
    retryBudget: clarifyBudget,
    proposedHandoffUrl: httpsBook,
  });
  const claimClarify = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.CLARIFY,
    retryBudget: clarifyBudget,
    hits: [fakeHit],
    bookingHandoff: handoffClarify,
  });
  if (
    !handoffClarify.attached &&
    handoffClarify.bookingHandoffUrl === null &&
    handoffClarify.cmsPublishWiring === "NOT_WIRED" &&
    claimClarify.hits.length === 0 &&
    claimClarify.bookingHandoffUrl === null &&
    claimClarify.answerStatus === SearchAnswerStatus.CLARIFY &&
    claimClarify.externalEffects === "NONE"
  ) {
    details.push(
      "E24: CLARIFY within budget refuses handoff + clears hits (cms NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `E24 CLARIFY unexpectedly handoff=${JSON.stringify(handoffClarify)} claim=${JSON.stringify(claimClarify)}`,
    );
  }

  // T-X048 E25 — javascript: handoff refused even when GROUNDED within budget.
  const groundedBudget = evaluateHardSearchRetryBudget({
    answerStatus: SearchAnswerStatus.GROUNDED,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  const handoffJs = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedBudget,
    proposedHandoffUrl: "javascript:alert(1)",
  });
  const claimJs = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedBudget,
    hits: [fakeHit],
    bookingHandoff: handoffJs,
  });
  if (
    !handoffJs.attached &&
    handoffJs.bookingHandoffUrl === null &&
    claimJs.bookingHandoffUrl === null &&
    claimJs.hits.length === 1 &&
    claimJs.inventedInventory === false &&
    claimJs.externalEffects === "NONE"
  ) {
    details.push(
      "E25: javascript: handoff refused within budget (HTTPS-only; no invent)",
    );
  } else {
    passed = false;
    details.push(
      `E25 javascript unexpectedly handoff=${JSON.stringify(handoffJs)} claim=${JSON.stringify(claimJs)}`,
    );
  }

  // T-X048 E26 — data: handoff refused even when GROUNDED within budget.
  const handoffData = resolveHardSearchBookingHandoff({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedBudget,
    proposedHandoffUrl: "data:text/html,poison",
  });
  const claimData = resolveHardSearchInventoryClaim({
    answerStatus: SearchAnswerStatus.GROUNDED,
    retryBudget: groundedBudget,
    hits: [fakeHit],
    bookingHandoff: handoffData,
  });
  if (
    !handoffData.attached &&
    handoffData.bookingHandoffUrl === null &&
    claimData.bookingHandoffUrl === null &&
    claimData.hits.length === 1 &&
    claimData.inventedInventory === false &&
    claimData.externalEffects === "NONE"
  ) {
    details.push(
      "E26: data: handoff refused within budget (HTTPS-only; no invent)",
    );
  } else {
    passed = false;
    details.push(
      `E26 data unexpectedly handoff=${JSON.stringify(handoffData)} claim=${JSON.stringify(claimData)}`,
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
