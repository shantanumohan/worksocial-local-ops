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
