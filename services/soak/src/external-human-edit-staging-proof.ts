/**
 * Fixture proof for T-X025 — external human edit during staging.
 *
 * Agent stages against a pinned base revision; human edit while STAGED_PENDING
 * retains CONFLICT; blind overwrite forbidden; independent verify never invents
 * VERIFIED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  StagingConflictStatus,
  StagingVerifyOutcome,
  applyExternalHumanEdit,
  attemptBlindAgentOverwrite,
  createExternalEditStagingState,
  digestFields,
  externalHumanEditLiveWiringStatus,
  independentVerifyStagingChange,
  normalizeClaimedVerified,
  normalizeLiveTemporalWiringRequest,
  normalizeOwnerAcknowledged,
  refuseClaimedVerifiedStaging,
  refuseSilentConflictClear,
  stageAgentChangeAgainstBase,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X025 fixture ACCEPTED.
 */
export function proofExternalHumanEditConflictRetained(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const pageId = `page-ext-edit-${randomUUID().slice(0, 8)}`;
  const changeId = `chg-ext-edit-${randomUUID().slice(0, 8)}`;

  const baseFields = {
    title: "Pilot page",
    metaDescription: "Original meta",
    h1: "Welcome",
    bodyExcerpt: "Original body",
  };
  const agentDesired = {
    title: "Agent staged title",
    metaDescription: "Agent meta",
    h1: "Agent H1",
    bodyExcerpt: "Agent staged body",
  };
  const humanEdit = {
    title: "Human edited title",
    metaDescription: "Human meta",
    h1: "Human H1",
    bodyExcerpt: "Human body during staging",
  };

  let state = createExternalEditStagingState({
    pageId,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });

  const staged = stageAgentChangeAgainstBase(state, {
    changeId,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (
    staged.ok &&
    staged.state.change?.status === StagingConflictStatus.STAGED_PENDING &&
    staged.state.page.contentDigest === digestFields(agentDesired)
  ) {
    details.push(
      `Staged against base rev-1 → STAGED_PENDING changeId=${changeId}`,
    );
    state = staged.state;
  } else {
    passed = false;
    details.push(`Stage against base failed: ${JSON.stringify(staged)}`);
  }

  const tHuman = new Date(Date.parse(nowIso) + 60_000).toISOString();
  state = applyExternalHumanEdit(state, {
    fields: humanEdit,
    nowIso: tHuman,
  });
  if (
    state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    state.change.humanObservedDigest === digestFields(humanEdit) &&
    state.change.desiredDigest === digestFields(agentDesired) &&
    state.page.fields.title === "Human edited title"
  ) {
    details.push(
      `External human edit → CONFLICT_RETAINED humanRev=${state.change.humanObservedRevision}`,
    );
  } else {
    passed = false;
    details.push(
      `Human edit did not retain conflict: status=${state.change?.status}`,
    );
  }

  const overwrite = attemptBlindAgentOverwrite(state, { nowIso: tHuman });
  if (
    !overwrite.ok &&
    overwrite.code === "OVERWRITE_FORBIDDEN" &&
    overwrite.state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    overwrite.state.page.fields.title === "Human edited title" &&
    overwrite.state.externalEffects === "NONE"
  ) {
    details.push(
      `Blind overwrite refused (${overwrite.code}); human fields preserved; attempts=${overwrite.state.agentOverwriteAttempts}`,
    );
    state = overwrite.state;
  } else {
    passed = false;
    details.push(`Overwrite unexpectedly ${JSON.stringify(overwrite)}`);
  }

  const verify = independentVerifyStagingChange(state, { nowIso: tHuman });
  if (
    !verify.matched &&
    verify.verifiedClaimed === false &&
    verify.outcome === StagingVerifyOutcome.CONFLICT_RETAINED &&
    verify.state.change?.status === StagingConflictStatus.CONFLICT_RETAINED
  ) {
    details.push(
      "Independent verify → CONFLICT_RETAINED; verifiedClaimed=false (ACCEPTED≠VERIFIED)",
    );
  } else {
    passed = false;
    details.push(`Verify unexpected ${JSON.stringify(verify)}`);
  }

  // Positive control: stale base refuses stage (pre-stage human edit).
  let control = createExternalEditStagingState({
    pageId: `${pageId}-ctrl`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  control = applyExternalHumanEdit(control, {
    fields: humanEdit,
    nowIso: tHuman,
  });
  const stale = stageAgentChangeAgainstBase(control, {
    changeId: `${changeId}-stale`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso: tHuman,
  });
  if (!stale.ok && stale.code === "BASE_REVISION_MISMATCH") {
    details.push(`Pre-stage human edit → BASE_REVISION_MISMATCH (${stale.code})`);
  } else {
    passed = false;
    details.push(`Stale-base stage unexpectedly ${JSON.stringify(stale)}`);
  }

  // Live Temporal request refused; claimed VERIFIED refused; wiring helper NOT_WIRED.
  const liveRefuse = attemptBlindAgentOverwrite(state, {
    nowIso: tHuman,
    requestLiveTemporalWiring: true,
  });
  if (
    !liveRefuse.ok &&
    liveRefuse.code === "LIVE_TEMPORAL_WIRING_NOT_WIRED" &&
    liveRefuse.liveTemporalWiring === "NOT_WIRED" &&
    liveRefuse.externalEffects === "NONE"
  ) {
    details.push(
      "Live Temporal request → LIVE_TEMPORAL_WIRING_NOT_WIRED (NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(`Live Temporal refuse unexpectedly ${JSON.stringify(liveRefuse)}`);
  }

  const claimed = refuseClaimedVerifiedStaging(state, {
    claimedVerified: true,
    nowIso: tHuman,
  });
  if (
    !claimed.ok &&
    claimed.code === "CLAIMED_VERIFIED_REFUSED" &&
    claimed.verifiedClaimed === false &&
    claimed.liveTemporalWiring === "NOT_WIRED"
  ) {
    details.push(
      "Claimed VERIFIED → CLAIMED_VERIFIED_REFUSED (ACCEPTED≠VERIFIED)",
    );
  } else {
    passed = false;
    details.push(`Claimed VERIFIED refuse unexpectedly ${JSON.stringify(claimed)}`);
  }

  // Second human edit while CONFLICT_RETAINED updates observations; restage refused.
  const secondHuman = {
    title: "Second human edit",
    metaDescription: "Human meta 2",
    h1: "Human H1 2",
    bodyExcerpt: "Second human body",
  };
  const tSecond = new Date(Date.parse(nowIso) + 120_000).toISOString();
  state = applyExternalHumanEdit(state, {
    fields: secondHuman,
    nowIso: tSecond,
  });
  const restage = stageAgentChangeAgainstBase(state, {
    changeId: `${changeId}-restage`,
    expectedBaseRevision: state.page.revision,
    desiredFields: agentDesired,
    nowIso: tSecond,
  });
  if (
    state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    state.change.humanObservedDigest === digestFields(secondHuman) &&
    !restage.ok &&
    restage.code === "CHANGE_ALREADY_OPEN" &&
    externalHumanEditLiveWiringStatus() === "NOT_WIRED" &&
    state.liveTemporalWiring === "NOT_WIRED" &&
    state.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "Second human edit updates observations; CHANGE_ALREADY_OPEN; liveTemporalWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `Second-edit/restage unexpectedly status=${state.change?.status} restage=${JSON.stringify(restage)}`,
    );
  }

  // STAGED_PENDING blind force (no human edit) still OVERWRITE_FORBIDDEN.
  let pendingOnly = createExternalEditStagingState({
    pageId: `${pageId}-pending`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const pendingStaged = stageAgentChangeAgainstBase(pendingOnly, {
    changeId: `${changeId}-pending`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (pendingStaged.ok) {
    pendingOnly = pendingStaged.state;
  }
  const pendingForce = attemptBlindAgentOverwrite(pendingOnly, { nowIso });
  if (
    pendingStaged.ok &&
    !pendingForce.ok &&
    pendingForce.code === "OVERWRITE_FORBIDDEN" &&
    pendingForce.state.page.contentDigest === digestFields(agentDesired) &&
    pendingForce.state.change?.status === StagingConflictStatus.STAGED_PENDING &&
    pendingForce.liveTemporalWiring === "NOT_WIRED"
  ) {
    details.push(
      "STAGED_PENDING blind force → OVERWRITE_FORBIDDEN; page unchanged; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `STAGED_PENDING force unexpectedly ${JSON.stringify(pendingForce)}`,
    );
  }

  // Blank changeId / live stage / normalize fail-closed.
  const blankId = stageAgentChangeAgainstBase(
    createExternalEditStagingState({
      pageId: `${pageId}-blank`,
      fields: baseFields,
      revision: "rev-1",
      nowIso,
    }),
    {
      changeId: "  ",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso,
    },
  );
  const liveStage = stageAgentChangeAgainstBase(
    createExternalEditStagingState({
      pageId: `${pageId}-live`,
      fields: baseFields,
      revision: "rev-1",
      nowIso,
    }),
    {
      changeId: `${changeId}-live`,
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso,
      requestLiveTemporalWiring: true,
    },
  );
  if (
    !blankId.ok &&
    blankId.code === "CHANGE_ID_REQUIRED" &&
    blankId.liveTemporalWiring === "NOT_WIRED" &&
    !liveStage.ok &&
    liveStage.code === "LIVE_TEMPORAL_WIRING_NOT_WIRED" &&
    normalizeLiveTemporalWiringRequest(true) === true &&
    normalizeLiveTemporalWiringRequest("true") === true &&
    normalizeLiveTemporalWiringRequest(1) === false &&
    normalizeLiveTemporalWiringRequest("TRUE") === false &&
    normalizeLiveTemporalWiringRequest(" true ") === false
  ) {
    details.push(
      "Blank changeId → CHANGE_ID_REQUIRED; live stage → NOT_WIRED; normalizeLiveTemporalWiringRequest literal-only",
    );
  } else {
    passed = false;
    details.push(
      `Blank/live/normalize unexpectedly blank=${JSON.stringify(blankId)} live=${JSON.stringify(liveStage)}`,
    );
  }

  // NO_OPEN_CHANGE; multi-overwrite under conflict; silent clear forbidden; live verify refused.
  const emptyOverwrite = attemptBlindAgentOverwrite(
    createExternalEditStagingState({
      pageId: `${pageId}-empty`,
      fields: baseFields,
      revision: "rev-1",
      nowIso,
    }),
    { nowIso },
  );
  const multi = attemptBlindAgentOverwrite(state, { nowIso: tSecond });
  if (multi.ok === false) {
    state = multi.state;
  }
  const silent = refuseSilentConflictClear(state, { nowIso: tSecond });
  const liveVerify = independentVerifyStagingChange(state, {
    nowIso: tSecond,
    requestLiveTemporalWiring: true,
  });
  if (
    !emptyOverwrite.ok &&
    emptyOverwrite.code === "NO_OPEN_CHANGE" &&
    emptyOverwrite.state.agentOverwriteAttempts === 1 &&
    multi.ok === false &&
    multi.code === "OVERWRITE_FORBIDDEN" &&
    multi.state.agentOverwriteAttempts >= 2 &&
    multi.state.page.fields.title === "Second human edit" &&
    !silent.ok &&
    silent.code === "SILENT_CLEAR_FORBIDDEN" &&
    silent.state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    liveVerify.refusedLiveTemporalWiring === true &&
    liveVerify.verifiedClaimed === false &&
    liveVerify.liveTemporalWiring === "NOT_WIRED"
  ) {
    details.push(
      "NO_OPEN_CHANGE; multi-overwrite keeps human; SILENT_CLEAR_FORBIDDEN; live verify → NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `N3 controls unexpectedly empty=${JSON.stringify(emptyOverwrite)} multi=${JSON.stringify(multi)} silent=${JSON.stringify(silent)} liveVerify=${JSON.stringify(liveVerify)}`,
    );
  }

  // Identical human re-edit bumps revision; no-open-change invents no conflict;
  // claimedVerified literal-only.
  const revBeforeIdentical = state.change?.humanObservedRevision;
  state = applyExternalHumanEdit(state, {
    fields: secondHuman,
    nowIso: new Date(Date.parse(nowIso) + 180_000).toISOString(),
  });
  let bare = createExternalEditStagingState({
    pageId: `${pageId}-bare`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  bare = applyExternalHumanEdit(bare, { fields: humanEdit, nowIso: tHuman });
  const aliasClaim = refuseClaimedVerifiedStaging(state, {
    claimedVerified: "TRUE",
    nowIso: tHuman,
  });
  if (
    state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    state.change.humanObservedRevision !== revBeforeIdentical &&
    state.change.desiredDigest === digestFields(agentDesired) &&
    bare.change === null &&
    bare.externalEffects === "NONE" &&
    normalizeClaimedVerified("true") === true &&
    normalizeClaimedVerified("TRUE") === false &&
    aliasClaim.code === "CLAIMED_VERIFIED_REFUSED" &&
    /verifiedClaimed stays false/.test(aliasClaim.reason)
  ) {
    details.push(
      "Identical human re-edit bumps rev; no-open-change invents no conflict; claimedVerified literal-only",
    );
  } else {
    passed = false;
    details.push(
      `N4 edges unexpectedly bare.change=${bare.change} alias=${aliasClaim.reason} rev=${state.change?.humanObservedRevision}`,
    );
  }

  // Owner-ack literal-only; after ack overwrite still forbidden.
  const aliasAck = refuseSilentConflictClear(state, {
    ownerAcknowledged: "TRUE",
    nowIso: tHuman,
  });
  const literalAck = refuseSilentConflictClear(state, {
    ownerAcknowledged: "true",
    nowIso: tHuman,
  });
  const afterAck =
    literalAck.ok === true
      ? attemptBlindAgentOverwrite(literalAck.state, { nowIso: tHuman })
      : null;
  if (
    !aliasAck.ok &&
    aliasAck.code === "SILENT_CLEAR_FORBIDDEN" &&
    normalizeOwnerAcknowledged("TRUE") === false &&
    normalizeOwnerAcknowledged("true") === true &&
    literalAck.ok === true &&
    literalAck.code === "OWNER_ACK_RECORDED_CONFLICT_KEPT" &&
    afterAck &&
    !afterAck.ok &&
    afterAck.code === "OVERWRITE_FORBIDDEN" &&
    afterAck.state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    afterAck.liveTemporalWiring === "NOT_WIRED"
  ) {
    details.push(
      "Owner-ack literal-only; alias TRUE → SILENT_CLEAR_FORBIDDEN; after ack overwrite still OVERWRITE_FORBIDDEN",
    );
  } else {
    passed = false;
    details.push(
      `N5 owner-ack unexpectedly alias=${JSON.stringify(aliasAck)} literal=${JSON.stringify(literalAck)} after=${JSON.stringify(afterAck)}`,
    );
  }

  // N6: non-rev revision bump + MATCHED_PENDING_ONLY refuses claimedVerified.
  let vState = createExternalEditStagingState({
    pageId: `page-vrev-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "v1",
    nowIso: nowIso,
  });
  const vStaged = stageAgentChangeAgainstBase(vState, {
    changeId: `chg-vrev-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "v1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (vStaged.ok) {
    vState = vStaged.state;
  }
  const matchedClaim = independentVerifyStagingChange(vState, {
    nowIso: tHuman,
    claimedVerified: true,
  });
  const aliasMatchedClaim = independentVerifyStagingChange(vState, {
    nowIso: tHuman,
    claimedVerified: "TRUE",
  });
  if (
    vStaged.ok &&
    vStaged.state.page.revision === "v1-next" &&
    matchedClaim.outcome === StagingVerifyOutcome.MATCHED_PENDING_ONLY &&
    matchedClaim.matched === true &&
    matchedClaim.verifiedClaimed === false &&
    matchedClaim.refusedClaimedVerified === true &&
    matchedClaim.details.some((d) => /CLAIMED_VERIFIED_REFUSED/.test(d)) &&
    matchedClaim.liveTemporalWiring === "NOT_WIRED" &&
    matchedClaim.externalEffects === "NONE" &&
    aliasMatchedClaim.verifiedClaimed === false &&
    aliasMatchedClaim.refusedClaimedVerified === undefined &&
    !aliasMatchedClaim.details.some((d) => /CLAIMED_VERIFIED_REFUSED/.test(d))
  ) {
    details.push(
      "N6 non-rev v1→v1-next; MATCHED_PENDING_ONLY refuses claimedVerified (literal-only; alias TRUE invents no claim)",
    );
  } else {
    passed = false;
    details.push(
      `N6 edges unexpectedly rev=${vStaged.ok ? vStaged.state.page.revision : "fail"} matched=${JSON.stringify(matchedClaim.details)} alias=${JSON.stringify(aliasMatchedClaim.details)}`,
    );
  }

  // N7: convergent human edit still CONFLICT; post-match overwrite forbidden; NO_CONFLICT on STAGED_PENDING.
  let convState = createExternalEditStagingState({
    pageId: `page-conv-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const convStaged = stageAgentChangeAgainstBase(convState, {
    changeId: `chg-conv-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (convStaged.ok) {
    convState = convStaged.state;
  }
  const postMatchOverwrite = convStaged.ok
    ? attemptBlindAgentOverwrite(matchedClaim.state, { nowIso: tHuman })
    : null;
  const noConflictOnStaged = convStaged.ok
    ? refuseSilentConflictClear(convStaged.state, {
        ownerAcknowledged: true,
        nowIso: tHuman,
      })
    : null;
  if (convStaged.ok) {
    convState = applyExternalHumanEdit(convState, {
      fields: agentDesired,
      nowIso: tHuman,
    });
  }
  const convVerify = independentVerifyStagingChange(convState, {
    nowIso: tHuman,
    claimedVerified: true,
  });
  if (
    convStaged.ok &&
    convState.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    convState.change.humanObservedDigest === digestFields(agentDesired) &&
    convState.change.desiredDigest === digestFields(agentDesired) &&
    /convergent digest still CONFLICT_RETAINED/.test(
      convState.change.recoveryNote ?? "",
    ) &&
    convVerify.outcome === StagingVerifyOutcome.CONFLICT_RETAINED &&
    convVerify.matched === false &&
    convVerify.verifiedClaimed === false &&
    convVerify.refusedClaimedVerified === true &&
    convVerify.details.some((d) => /CLAIMED_VERIFIED_REFUSED/.test(d)) &&
    postMatchOverwrite &&
    !postMatchOverwrite.ok &&
    postMatchOverwrite.code === "OVERWRITE_FORBIDDEN" &&
    noConflictOnStaged &&
    !noConflictOnStaged.ok &&
    noConflictOnStaged.code === "NO_CONFLICT"
  ) {
    details.push(
      "N7 convergent human edit still CONFLICT_RETAINED; verify refuses claimedVerified; post-MATCHED overwrite OVERWRITE_FORBIDDEN; STAGED_PENDING clear → NO_CONFLICT",
    );
  } else {
    passed = false;
    details.push(
      `N7 edges unexpectedly conv=${convState.change?.status} note=${convState.change?.recoveryNote} verify=${convVerify.outcome} post=${postMatchOverwrite && !postMatchOverwrite.ok ? postMatchOverwrite.code : "?"} noc=${noConflictOnStaged && !noConflictOnStaged.ok ? noConflictOnStaged.code : "?"}`,
    );
  }

  // N8: whitespace create throw; live verify literal "true"; MATCHED then claimed refuse.
  let whitespaceThrows = false;
  try {
    createExternalEditStagingState({
      pageId: "   ",
      fields: baseFields,
      revision: "rev-1",
      nowIso,
    });
  } catch (e) {
    whitespaceThrows = /pageId is required/.test(
      e instanceof Error ? e.message : String(e),
    );
  }
  let revisionThrows = false;
  try {
    createExternalEditStagingState({
      pageId: "page-n8",
      fields: baseFields,
      revision: "   ",
      nowIso,
    });
  } catch (e) {
    revisionThrows = /revision is required/.test(
      e instanceof Error ? e.message : String(e),
    );
  }
  let n8State = createExternalEditStagingState({
    pageId: `page-n8-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const n8Staged = stageAgentChangeAgainstBase(n8State, {
    changeId: `chg-n8-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (n8Staged.ok) {
    n8State = n8Staged.state;
  }
  const liveLiteralVerify = independentVerifyStagingChange(n8State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: "true",
  });
  const aliasLiveVerify = independentVerifyStagingChange(n8State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: "TRUE",
  });
  const matchedN8 = independentVerifyStagingChange(n8State, { nowIso: tHuman });
  const claimedAfterMatch = refuseClaimedVerifiedStaging(matchedN8.state, {
    claimedVerified: true,
    nowIso: tHuman,
  });
  if (
    whitespaceThrows &&
    revisionThrows &&
    n8Staged.ok &&
    liveLiteralVerify.refusedLiveTemporalWiring === true &&
    liveLiteralVerify.verifiedClaimed === false &&
    liveLiteralVerify.details.some((d) => /LIVE_TEMPORAL_WIRING_NOT_WIRED/.test(d)) &&
    aliasLiveVerify.refusedLiveTemporalWiring === undefined &&
    aliasLiveVerify.outcome === StagingVerifyOutcome.MATCHED_PENDING_ONLY &&
    matchedN8.outcome === StagingVerifyOutcome.MATCHED_PENDING_ONLY &&
    claimedAfterMatch.code === "CLAIMED_VERIFIED_REFUSED" &&
    claimedAfterMatch.verifiedClaimed === false &&
    /fixture ACCEPTED only, not VERIFIED/.test(claimedAfterMatch.reason) &&
    claimedAfterMatch.liveTemporalWiring === "NOT_WIRED" &&
    claimedAfterMatch.externalEffects === "NONE"
  ) {
    details.push(
      "N8 whitespace pageId/revision throw; live verify literal true → NOT_WIRED; alias TRUE invents no live refuse; MATCHED then CLAIMED_VERIFIED_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `N8 edges unexpectedly ws=${whitespaceThrows}/${revisionThrows} live=${liveLiteralVerify.refusedLiveTemporalWiring} alias=${aliasLiveVerify.outcome} claimed=${claimedAfterMatch.code}`,
    );
  }

  // N9: dual live+claimed verify refuse; post-MATCHED human edit CONFLICT; live overwrite literal.
  let n9State = createExternalEditStagingState({
    pageId: `page-n9-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const n9Staged = stageAgentChangeAgainstBase(n9State, {
    changeId: `chg-n9-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (n9Staged.ok) {
    n9State = n9Staged.state;
  }
  const dual = independentVerifyStagingChange(n9State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: true,
    claimedVerified: true,
  });
  const liveOverwriteLiteral = attemptBlindAgentOverwrite(n9State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: "true",
  });
  const matchedN9 = independentVerifyStagingChange(n9State, { nowIso: tHuman });
  if (matchedN9.outcome === StagingVerifyOutcome.MATCHED_PENDING_ONLY) {
    n9State = matchedN9.state;
    n9State = applyExternalHumanEdit(n9State, {
      fields: humanEdit,
      nowIso: tHuman,
    });
  }
  const afterEditVerify = independentVerifyStagingChange(n9State, {
    nowIso: tHuman,
    claimedVerified: "true",
  });
  if (
    n9Staged.ok &&
    dual.refusedLiveTemporalWiring === true &&
    dual.refusedClaimedVerified === true &&
    dual.verifiedClaimed === false &&
    dual.details.some((d) => /LIVE_TEMPORAL_WIRING_NOT_WIRED/.test(d)) &&
    dual.details.some((d) => /CLAIMED_VERIFIED_REFUSED/.test(d)) &&
    liveOverwriteLiteral.ok === false &&
    liveOverwriteLiteral.code === "LIVE_TEMPORAL_WIRING_NOT_WIRED" &&
    matchedN9.outcome === StagingVerifyOutcome.MATCHED_PENDING_ONLY &&
    n9State.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    n9State.change.humanObservedDigest === digestFields(humanEdit) &&
    afterEditVerify.outcome === StagingVerifyOutcome.CONFLICT_RETAINED &&
    afterEditVerify.matched === false &&
    afterEditVerify.refusedClaimedVerified === true &&
    afterEditVerify.verifiedClaimed === false
  ) {
    details.push(
      "N9 dual live+claimed verify refuse; live overwrite literal true → NOT_WIRED; post-MATCHED human edit → CONFLICT_RETAINED (never elevates)",
    );
  } else {
    passed = false;
    details.push(
      `N9 edges unexpectedly dual=${dual.refusedLiveTemporalWiring}/${dual.refusedClaimedVerified} liveOw=${!liveOverwriteLiteral.ok ? liveOverwriteLiteral.code : "ok"} post=${n9State.change?.status} after=${afterEditVerify.outcome}`,
    );
  }

  // N10: alias live overwrite → OVERWRITE_FORBIDDEN; empty-field human CONFLICT; owner-ack then claimed refuse.
  let n10State = createExternalEditStagingState({
    pageId: `page-n10-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const n10Staged = stageAgentChangeAgainstBase(n10State, {
    changeId: `chg-n10-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (n10Staged.ok) {
    n10State = n10Staged.state;
  }
  const aliasLiveOverwrite = attemptBlindAgentOverwrite(n10State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: "TRUE",
  });
  const emptyHuman = {
    title: "",
    metaDescription: "",
    h1: "",
    bodyExcerpt: "",
  };
  if (n10Staged.ok) {
    n10State = applyExternalHumanEdit(n10State, {
      fields: emptyHuman,
      nowIso: tHuman,
    });
  }
  const ackN10 = refuseSilentConflictClear(n10State, {
    ownerAcknowledged: "true",
    nowIso: tHuman,
  });
  const claimedAfterAck =
    ackN10.ok === true
      ? refuseClaimedVerifiedStaging(ackN10.state, {
          claimedVerified: true,
          nowIso: tHuman,
        })
      : null;
  if (
    n10Staged.ok &&
    aliasLiveOverwrite.ok === false &&
    aliasLiveOverwrite.code === "OVERWRITE_FORBIDDEN" &&
    n10State.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    n10State.change.humanObservedDigest === digestFields(emptyHuman) &&
    n10State.liveProviderSuccessClaimed === false &&
    n10State.externalEffects === "NONE" &&
    ackN10.ok === true &&
    ackN10.code === "OWNER_ACK_RECORDED_CONFLICT_KEPT" &&
    ackN10.state.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    claimedAfterAck &&
    claimedAfterAck.code === "CLAIMED_VERIFIED_REFUSED" &&
    claimedAfterAck.verifiedClaimed === false &&
    /CONFLICT_RETAINED cannot elevate/.test(claimedAfterAck.reason) &&
    claimedAfterAck.liveTemporalWiring === "NOT_WIRED" &&
    claimedAfterAck.externalEffects === "NONE"
  ) {
    details.push(
      "N10 alias TRUE live overwrite → OVERWRITE_FORBIDDEN (no live refuse invented); empty-field human edit CONFLICT_RETAINED; owner-ack then CLAIMED_VERIFIED_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `N10 edges unexpectedly alias=${!aliasLiveOverwrite.ok ? aliasLiveOverwrite.code : "ok"} empty=${n10State.change?.status} ack=${ackN10.ok ? ackN10.code : (!ackN10.ok ? ackN10.code : "?")} claimed=${claimedAfterAck?.code}`,
    );
  }

  // N11: numeric live alias; owner-ack 1/TRUE silent forbid; convergent verify stays CONFLICT.
  let n11State = createExternalEditStagingState({
    pageId: `page-n11-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const n11Staged = stageAgentChangeAgainstBase(n11State, {
    changeId: `chg-n11-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (n11Staged.ok) {
    n11State = n11Staged.state;
  }
  const numericLiveOw = attemptBlindAgentOverwrite(n11State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: 1,
  });
  if (n11Staged.ok) {
    n11State = applyExternalHumanEdit(n11State, {
      fields: agentDesired,
      nowIso: tHuman,
    });
  }
  const ackNum = refuseSilentConflictClear(n11State, {
    ownerAcknowledged: 1,
    nowIso: tHuman,
  });
  const ackUpper = refuseSilentConflictClear(n11State, {
    ownerAcknowledged: "TRUE",
    nowIso: tHuman,
  });
  const convergentVerify = independentVerifyStagingChange(n11State, {
    nowIso: tHuman,
    claimedVerified: 1,
  });
  if (
    n11Staged.ok &&
    numericLiveOw.ok === false &&
    numericLiveOw.code === "OVERWRITE_FORBIDDEN" &&
    n11State.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    n11State.change.humanObservedDigest === n11State.change.desiredDigest &&
    ackNum.ok === false &&
    ackNum.code === "SILENT_CLEAR_FORBIDDEN" &&
    ackUpper.ok === false &&
    ackUpper.code === "SILENT_CLEAR_FORBIDDEN" &&
    convergentVerify.outcome === StagingVerifyOutcome.CONFLICT_RETAINED &&
    convergentVerify.matched === false &&
    convergentVerify.verifiedClaimed === false &&
    convergentVerify.refusedClaimedVerified === undefined &&
    convergentVerify.liveTemporalWiring === "NOT_WIRED" &&
    convergentVerify.externalEffects === "NONE"
  ) {
    details.push(
      "N11 numeric live 1 → OVERWRITE_FORBIDDEN; owner-ack 1/TRUE → SILENT_CLEAR_FORBIDDEN; convergent CONFLICT verify never elevates",
    );
  } else {
    passed = false;
    details.push(
      `N11 edges unexpectedly numLive=${!numericLiveOw.ok ? numericLiveOw.code : "ok"} ack1=${ackNum.ok ? "ok" : ackNum.code} ackU=${ackUpper.ok ? "ok" : ackUpper.code} conv=${convergentVerify.outcome}`,
    );
  }

  // N12: live verify "TRUE" alias → MATCHED_PENDING_ONLY; ownerAck false; post-ack overwrite; claimed "TRUE" alias.
  let n12State = createExternalEditStagingState({
    pageId: `page-n12-${randomUUID().slice(0, 8)}`,
    fields: baseFields,
    revision: "rev-1",
    nowIso,
  });
  const n12Staged = stageAgentChangeAgainstBase(n12State, {
    changeId: `chg-n12-${randomUUID().slice(0, 8)}`,
    expectedBaseRevision: "rev-1",
    desiredFields: agentDesired,
    nowIso,
  });
  if (n12Staged.ok) {
    n12State = n12Staged.state;
  }
  const n12AliasLiveVerify = independentVerifyStagingChange(n12State, {
    nowIso: tHuman,
    requestLiveTemporalWiring: "TRUE",
  });
  if (n12Staged.ok) {
    n12State = applyExternalHumanEdit(n12State, {
      fields: humanEdit,
      nowIso: tHuman,
    });
  }
  const ackFalse = refuseSilentConflictClear(n12State, {
    ownerAcknowledged: false,
    nowIso: tHuman,
  });
  const ackN12 = refuseSilentConflictClear(n12State, {
    ownerAcknowledged: "true",
    nowIso: tHuman,
  });
  const postAckOw =
    ackN12.ok === true
      ? attemptBlindAgentOverwrite(ackN12.state, { nowIso: tHuman })
      : null;
  const claimedAlias =
    ackN12.ok === true
      ? refuseClaimedVerifiedStaging(ackN12.state, {
          claimedVerified: "TRUE",
          nowIso: tHuman,
        })
      : null;
  if (
    n12Staged.ok &&
    n12AliasLiveVerify.refusedLiveTemporalWiring === undefined &&
    n12AliasLiveVerify.outcome === StagingVerifyOutcome.MATCHED_PENDING_ONLY &&
    n12AliasLiveVerify.matched === true &&
    n12AliasLiveVerify.verifiedClaimed === false &&
    n12State.change?.status === StagingConflictStatus.CONFLICT_RETAINED &&
    ackFalse.ok === false &&
    ackFalse.code === "SILENT_CLEAR_FORBIDDEN" &&
    ackN12.ok === true &&
    postAckOw &&
    postAckOw.ok === false &&
    postAckOw.code === "OVERWRITE_FORBIDDEN" &&
    claimedAlias &&
    claimedAlias.code === "CLAIMED_VERIFIED_REFUSED" &&
    /no live elevation path/.test(claimedAlias.reason)
  ) {
    details.push(
      "N12 live verify TRUE alias → MATCHED_PENDING_ONLY (no LIVE refuse); ownerAck false SILENT_CLEAR; post-ack OVERWRITE_FORBIDDEN; claimed TRUE alias no elevation",
    );
  } else {
    passed = false;
    details.push(
      `N12 edges unexpectedly live=${n12AliasLiveVerify.outcome} ackF=${ackFalse.ok ? "ok" : ackFalse.code} post=${postAckOw && !postAckOw.ok ? postAckOw.code : "ok"} claimed=${claimedAlias?.code}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false liveTemporalWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-ext-human-edit-${randomUUID()}`,
    kind: SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx025-${randomUUID().slice(0, 8)}`,
    createdAtIso: tHuman,
    fixtureOnly: true,
  };
}
