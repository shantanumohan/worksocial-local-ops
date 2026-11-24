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
  refuseClaimedVerifiedStaging,
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
