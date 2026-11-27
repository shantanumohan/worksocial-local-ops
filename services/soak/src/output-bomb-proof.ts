/**
 * Fixture proof for T-X011 — output bomb bounded/quarantined.
 * Hillclimb deepen I7–F27: idempotent reclaim; assessment/quarantine drift refused; priorDeliverInvented drift; liveProviderSuccessClaimed/externalEffects/quarantinedStdout drift; invent-deliver on bomb refused; first/second-pass honesty drift; dual-pass dishonesty compound drift; dual-pass payload/code/withinBound/byteLength/reason/deliver drift; dual oversized deliver + cross-pass dishonesty compound; reason drift; empty stdout bound;
 * zero/negative/non-finite max refused; UTF-8 4-byte emoji bomb;
 * close-path one-shot bomb quarantine; live VERIFIED / force-deliver refused;
 * mismatched honesty; ACCEPTED≠VERIFIED.
 * Oversized stdout is refused (OUTPUT_TOO_LARGE) and not delivered.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoakProofKind, type SoakProofRecord } from "@worksocial/domain";
import {
  assessStdoutBound,
  assertOutputBombBoundedHonest,
  assertOutputBombReclaimIdempotent,
  invokeClaudeCli,
  quarantineStdoutDelivery,
  reclaimOutputBombDecision,
} from "@worksocial/claude-runner";

/**
 * Complete expected proof set for T-X011 fixture ACCEPTED.
 */
export async function proofOutputBombBoundedQuarantined(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const workDir = mkdtempSync(join(tmpdir(), "ws-output-bomb-"));

  try {
    const maxBytes = 2_048;

    // 1. Pure bound: oversized UTF-8 → OUTPUT_TOO_LARGE; quarantine (no deliver).
    const bombText = "A".repeat(maxBytes + 64);
    const over = assessStdoutBound(bombText, maxBytes);
    const overQ = quarantineStdoutDelivery(over);
    if (
      !over.withinBound &&
      over.code === "OUTPUT_TOO_LARGE" &&
      over.liveProviderSuccessClaimed === false &&
      over.externalEffects === "NONE" &&
      overQ.deliver === false &&
      !overQ.deliver &&
      overQ.quarantinedStdout === null
    ) {
      details.push(
        `Oversized stdout (${over.byteLength}B > ${maxBytes}) → OUTPUT_TOO_LARGE quarantined`,
      );
    } else {
      passed = false;
      details.push(
        `Oversized bound unexpectedly ${JSON.stringify({ over, overQ })}`,
      );
    }

    // 2. Under-bound content remains deliverable.
    const safe = assessStdoutBound("ok-fixture\n", maxBytes);
    const safeQ = quarantineStdoutDelivery(safe);
    if (
      safe.withinBound &&
      safeQ.deliver === true &&
      safeQ.liveProviderSuccessClaimed === false
    ) {
      details.push("Under-bound stdout remains deliverable");
    } else {
      passed = false;
      details.push(
        `Under-bound unexpectedly ${JSON.stringify({ safe, safeQ })}`,
      );
    }

    // 2b. Exact-at-bound is deliverable; zero/negative/non-finite max refuses.
    const atBound = assessStdoutBound("A".repeat(maxBytes), maxBytes);
    const zeroMax = assessStdoutBound("x", 0);
    const negMax = assessStdoutBound("x", -1);
    const infMax = assessStdoutBound("x", Number.POSITIVE_INFINITY);
    const nanMax = assessStdoutBound("x", Number.NaN);
    if (
      atBound.withinBound &&
      !zeroMax.withinBound &&
      zeroMax.code === "OUTPUT_TOO_LARGE" &&
      !negMax.withinBound &&
      !infMax.withinBound &&
      !nanMax.withinBound
    ) {
      details.push(
        "Exact-at-bound deliverable; maxOutputBytes≤0/∞/NaN → OUTPUT_TOO_LARGE",
      );
    } else {
      passed = false;
      details.push(
        `at-bound/non-finite unexpectedly ${JSON.stringify({ atBound, zeroMax, negMax, infMax, nanMax })}`,
      );
    }

    // 2c. Empty stdout under a finite bound remains deliverable.
    const empty = assessStdoutBound("", maxBytes);
    const emptyQ = quarantineStdoutDelivery(empty);
    if (empty.withinBound && empty.byteLength === 0 && emptyQ.deliver === true) {
      details.push("Empty stdout under finite bound remains deliverable");
    } else {
      passed = false;
      details.push(
        `empty stdout unexpectedly ${JSON.stringify({ empty, emptyQ })}`,
      );
    }

    // 3. UTF-8 multi-byte counted by bytes, not characters (2-byte + 4-byte).
    const multi = "é".repeat(maxBytes); // 2 bytes each in UTF-8
    const multiBound = assessStdoutBound(multi, maxBytes);
    const emoji = "🔥".repeat(Math.ceil(maxBytes / 2)); // 4 bytes each
    const emojiBound = assessStdoutBound(emoji, maxBytes);
    if (
      !multiBound.withinBound &&
      multiBound.code === "OUTPUT_TOO_LARGE" &&
      multiBound.byteLength > maxBytes &&
      !emojiBound.withinBound &&
      emojiBound.code === "OUTPUT_TOO_LARGE" &&
      emojiBound.byteLength > maxBytes
    ) {
      details.push(
        `UTF-8 multi-byte bomb counted by bytes (2B=${multiBound.byteLength}; 4B=${emojiBound.byteLength})`,
      );
    } else {
      passed = false;
      details.push(
        `UTF-8 bound unexpectedly ${JSON.stringify({ multiBound, emojiBound })}`,
      );
    }

    // 3b. Live VERIFIED / force-deliver claims refused.
    const liveClaim = quarantineStdoutDelivery(safe, {
      claimLiveVerified: true,
    });
    const forceBomb = quarantineStdoutDelivery(over, {
      forceDeliverDespiteBomb: true,
    });
    if (
      !liveClaim.deliver &&
      liveClaim.code === "LIVE_CLAIM_REFUSED" &&
      !forceBomb.deliver &&
      forceBomb.code === "LIVE_CLAIM_REFUSED"
    ) {
      details.push(
        "claimLiveVerified / forceDeliverDespiteBomb → LIVE_CLAIM_REFUSED",
      );
    } else {
      passed = false;
      details.push(
        `live claims unexpectedly claim=${JSON.stringify(liveClaim)} force=${JSON.stringify(forceBomb)}`,
      );
    }

    const dualLive = quarantineStdoutDelivery(over, {
      claimLiveVerified: true,
      forceDeliverDespiteBomb: true,
    });
    if (
      !dualLive.deliver &&
      dualLive.code === "LIVE_CLAIM_REFUSED" &&
      dualLive.quarantinedStdout === null
    ) {
      details.push(
        "simultaneous claimLiveVerified+forceDeliverDespiteBomb → LIVE_CLAIM_REFUSED",
      );
    } else {
      passed = false;
      details.push(`dual live claim unexpectedly ${JSON.stringify(dualLive)}`);
    }

    const honesty = assertOutputBombBoundedHonest({
      assessment: over,
      quarantine: overQ,
    });
    const mismatched = assertOutputBombBoundedHonest({
      assessment: safe,
      quarantine: overQ,
    });
    const liveHonest = assertOutputBombBoundedHonest({
      assessment: safe,
      quarantine: liveClaim,
    });
    if (
      honesty.ok &&
      !mismatched.ok &&
      mismatched.code === "OUTPUT_BOMB_DISHONEST" &&
      liveHonest.ok
    ) {
      details.push(
        `assertOutputBombBoundedHonest → honest over/quarantine; mismatched DISHONEST; LIVE_CLAIM honest; ACCEPTED≠VERIFIED`,
      );
    } else {
      passed = false;
      details.push(
        `honesty unexpectedly h=${JSON.stringify(honesty)} m=${JSON.stringify(mismatched)} l=${JSON.stringify(liveHonest)}`,
      );
    }

    // 4. Production invokeClaudeCli path with local bomb executable (shebang).
    //    Bomb ignores Claude argv; adapter must SIGKILL + quarantine (no stdout).
    const bombScript = join(workDir, "bomb-cli.mjs");
    writeFileSync(
      bombScript,
      [
        "#!/usr/bin/env node",
        "const chunk = Buffer.alloc(1024, 0x41);",
        "let n = 0;",
        "const iv = setInterval(() => {",
        "  process.stdout.write(chunk);",
        "  n += chunk.length;",
        "  if (n > 20000) clearInterval(iv);",
        "}, 1);",
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(bombScript, 0o755);

    const bombInvoke = await invokeClaudeCli({
      executablePath: bombScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "ignored-by-bomb",
      timeoutMs: 5_000,
      maxOutputBytes: maxBytes,
    });
    if (
      !bombInvoke.ok &&
      bombInvoke.code === "OUTPUT_TOO_LARGE" &&
      bombInvoke.stdout === undefined
    ) {
      details.push(
        "invokeClaudeCli bomb → OUTPUT_TOO_LARGE; bomb stdout quarantined (not delivered)",
      );
    } else {
      passed = false;
      details.push(`Bomb invoke unexpectedly ${JSON.stringify(bombInvoke)}`);
    }

    // 4b. Double bomb still quarantined (no invent delivery).
    const bombInvoke2 = await invokeClaudeCli({
      executablePath: bombScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "ignored-by-bomb-2",
      timeoutMs: 5_000,
      maxOutputBytes: maxBytes,
    });
    if (
      !bombInvoke2.ok &&
      bombInvoke2.code === "OUTPUT_TOO_LARGE" &&
      bombInvoke2.stdout === undefined
    ) {
      details.push(
        "double invokeClaudeCli bomb → OUTPUT_TOO_LARGE twice (no invent delivery)",
      );
    } else {
      passed = false;
      details.push(`Double bomb unexpectedly ${JSON.stringify(bombInvoke2)}`);
    }

    // 4c. Nonpositive / non-finite maxOutputBytes refused before spawn (no quiet ok:true).
    const zeroBoundInvoke = await invokeClaudeCli({
      executablePath: bombScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "should-not-spawn-as-success",
      timeoutMs: 2_000,
      maxOutputBytes: 0,
    });
    const negBoundInvoke = await invokeClaudeCli({
      executablePath: bombScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "should-not-spawn-neg",
      timeoutMs: 2_000,
      maxOutputBytes: -7,
    });
    const infBoundInvoke = await invokeClaudeCli({
      executablePath: bombScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "should-not-spawn-inf",
      timeoutMs: 2_000,
      maxOutputBytes: Number.POSITIVE_INFINITY,
    });
    if (
      !zeroBoundInvoke.ok &&
      zeroBoundInvoke.code === "OUTPUT_TOO_LARGE" &&
      !negBoundInvoke.ok &&
      negBoundInvoke.code === "OUTPUT_TOO_LARGE" &&
      !infBoundInvoke.ok &&
      infBoundInvoke.code === "OUTPUT_TOO_LARGE"
    ) {
      details.push(
        "maxOutputBytes≤0/-/∞ invokeClaudeCli → OUTPUT_TOO_LARGE before spawn",
      );
    } else {
      passed = false;
      details.push(
        `non-finite-bound invoke unexpectedly z=${JSON.stringify(zeroBoundInvoke)} n=${JSON.stringify(negBoundInvoke)} i=${JSON.stringify(infBoundInvoke)}`,
      );
    }

    // 4d. One-shot bomb (writes oversized then exits) — close-path quarantine.
    const oneshotScript = join(workDir, "oneshot-bomb.mjs");
    writeFileSync(
      oneshotScript,
      [
        "#!/usr/bin/env node",
        `process.stdout.write(Buffer.alloc(${maxBytes + 512}, 0x42));`,
        "process.exit(0);",
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(oneshotScript, 0o755);
    const oneshot = await invokeClaudeCli({
      executablePath: oneshotScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "oneshot-bomb",
      timeoutMs: 5_000,
      maxOutputBytes: maxBytes,
    });
    if (
      !oneshot.ok &&
      oneshot.code === "OUTPUT_TOO_LARGE" &&
      oneshot.stdout === undefined
    ) {
      details.push(
        "one-shot bomb → OUTPUT_TOO_LARGE on close-path; bomb stdout quarantined",
      );
    } else {
      passed = false;
      details.push(`one-shot bomb unexpectedly ${JSON.stringify(oneshot)}`);
    }

    // 5. Positive control: under-bound local CLI delivers stdout.
    const okScript = join(workDir, "ok-cli.mjs");
    writeFileSync(
      okScript,
      [
        "#!/usr/bin/env node",
        'process.stdout.write(\'{"ok":true}\\n\');',
        "process.exit(0);",
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(okScript, 0o755);

    const okInvoke = await invokeClaudeCli({
      executablePath: okScript,
      agentName: "A25",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "benign",
      timeoutMs: 5_000,
      maxOutputBytes: maxBytes,
    });
    if (okInvoke.ok && okInvoke.stdout.includes('"ok":true')) {
      details.push("Under-bound invokeClaudeCli stdout delivered");
    } else {
      passed = false;
      details.push(`Under-bound invoke unexpectedly ${JSON.stringify(okInvoke)}`);
    }

    // 6. Idempotent reclaim (I7): double reclaim of bomb agrees; no invent deliver.
    const reclaim1 = reclaimOutputBombDecision(bombText, maxBytes);
    const reclaim2 = reclaimOutputBombDecision(bombText, maxBytes);
    const reclaimIdem = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: reclaim2,
    });
    const afterForce = reclaimOutputBombDecision(bombText, maxBytes, {
      forceDeliverDespiteBomb: true,
    });
    const reclaimAfterForce = reclaimOutputBombDecision(bombText, maxBytes);
    if (
      reclaimIdem.ok &&
      reclaimIdem.code === "OUTPUT_BOMB_RECLAIM_IDEMPOTENT" &&
      reclaim1.quarantine.deliver === false &&
      reclaim1.priorDeliverInvented === false &&
      afterForce.quarantine.deliver === false &&
      afterForce.quarantine.code === "LIVE_CLAIM_REFUSED" &&
      reclaimAfterForce.quarantine.deliver === false &&
      !reclaimAfterForce.assessment.withinBound &&
      reclaimAfterForce.quarantine.code === "OUTPUT_TOO_LARGE"
    ) {
      details.push(
        "idempotent reclaim: double bomb reclaim agrees; post-force reclaim still OUTPUT_TOO_LARGE (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `idempotent reclaim unexpectedly idem=${JSON.stringify(reclaimIdem)} r1=${JSON.stringify(reclaim1)} afterForce=${JSON.stringify(afterForce)} after=${JSON.stringify(reclaimAfterForce)}`,
      );
    }

    const codeTampered: typeof reclaim2 = { ...reclaim2 };
    if (
      !reclaim2.assessment.withinBound &&
      "code" in reclaim2.assessment
    ) {
      const tamperedAssessment = {
        ...reclaim2.assessment,
      } as { code: string; withinBound: false };
      tamperedAssessment.code = "INVENTED_CODE";
      codeTampered.assessment = tamperedAssessment as typeof reclaim2.assessment;
    }
    const codeDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: codeTampered,
    });
    if (
      !codeDrift.ok &&
      codeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      codeDrift.reasons.includes("reclaim assessment.code drifted on over-bound")
    ) {
      details.push(
        "reclaim assessment.code drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(`code drift unexpectedly ${JSON.stringify(codeDrift)}`);
    }

    const byteTampered: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim2.assessment.withinBound) {
      byteTampered.assessment = {
        ...reclaim2.assessment,
        byteLength: reclaim2.assessment.byteLength + 1,
      };
    }
    const byteDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: byteTampered,
    });
    if (
      !byteDrift.ok &&
      byteDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      byteDrift.reasons.includes("reclaim assessment.byteLength drifted")
    ) {
      details.push(
        "reclaim assessment.byteLength drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(`byteLength drift unexpectedly ${JSON.stringify(byteDrift)}`);
    }

    const boundTampered: typeof reclaim2 = { ...reclaim2 };
    if (
      !reclaim2.assessment.withinBound &&
      "code" in reclaim2.assessment
    ) {
      const tamperedBound = {
        ...reclaim2.assessment,
        withinBound: true,
      };
      boundTampered.assessment = tamperedBound as unknown as typeof reclaim2.assessment;
    }
    const boundDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: boundTampered,
    });
    if (
      !boundDrift.ok &&
      boundDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      boundDrift.reasons.includes("reclaim assessment.withinBound drifted")
    ) {
      details.push(
        "reclaim assessment.withinBound drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(`withinBound drift unexpectedly ${JSON.stringify(boundDrift)}`);
    }

    const quarantineCodeTampered: typeof reclaim2 = { ...reclaim2 };
    if (
      !reclaim1.quarantine.deliver &&
      !reclaim2.quarantine.deliver &&
      reclaim1.quarantine.code === reclaim2.quarantine.code
    ) {
      quarantineCodeTampered.quarantine = {
        ...reclaim2.quarantine,
        code: "INVENTED_QUARANTINE_CODE",
      } as unknown as typeof reclaim2.quarantine;
    }
    const quarantineCodeDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: quarantineCodeTampered,
    });
    if (
      !quarantineCodeDrift.ok &&
      quarantineCodeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      quarantineCodeDrift.reasons.includes("reclaim quarantine.code drifted")
    ) {
      details.push(
        "reclaim quarantine.code drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `quarantine.code drift unexpectedly ${JSON.stringify(quarantineCodeDrift)}`,
      );
    }

    const deliverTampered: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim2.assessment.withinBound && !reclaim2.quarantine.deliver) {
      deliverTampered.quarantine = {
        ...reclaim2.quarantine,
        deliver: true,
      } as unknown as typeof reclaim2.quarantine;
    }
    const deliverDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: deliverTampered,
    });
    if (
      !deliverDrift.ok &&
      deliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      deliverDrift.reasons.includes("reclaim quarantine.deliver drifted")
    ) {
      details.push(
        "reclaim quarantine.deliver drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `quarantine.deliver drift unexpectedly ${JSON.stringify(deliverDrift)}`,
      );
    }

    const priorDeliverTampered = {
      ...reclaim2,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim2;
    const priorDeliverDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: priorDeliverTampered,
    });
    if (
      !priorDeliverDrift.ok &&
      priorDeliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      priorDeliverDrift.reasons.includes(
        "priorDeliverInvented must be false on both reclaim passes",
      )
    ) {
      details.push(
        "reclaim priorDeliverInvented drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `priorDeliverInvented drift unexpectedly ${JSON.stringify(priorDeliverDrift)}`,
      );
    }

    const liveClaimTampered = {
      ...reclaim2,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim2;
    const liveClaimDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: liveClaimTampered,
    });
    if (
      !liveClaimDrift.ok &&
      liveClaimDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      liveClaimDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      )
    ) {
      details.push(
        "reclaim liveProviderSuccessClaimed drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `liveProviderSuccessClaimed drift unexpectedly ${JSON.stringify(liveClaimDrift)}`,
      );
    }

    const effectsTampered = {
      ...reclaim2,
      externalEffects: "LIVE" as const,
    } as unknown as typeof reclaim2;
    const effectsDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: effectsTampered,
    });
    if (
      !effectsDrift.ok &&
      effectsDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      effectsDrift.reasons.includes("externalEffects must be NONE on reclaim")
    ) {
      details.push(
        "reclaim externalEffects drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `externalEffects drift unexpectedly ${JSON.stringify(effectsDrift)}`,
      );
    }

    const payloadTampered: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.quarantine.deliver && !reclaim2.quarantine.deliver) {
      payloadTampered.quarantine = {
        ...reclaim2.quarantine,
        quarantinedStdout: bombText.slice(0, 32),
      } as unknown as typeof reclaim2.quarantine;
    }
    const payloadDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: payloadTampered,
    });
    if (
      !payloadDrift.ok &&
      payloadDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      payloadDrift.reasons.includes("reclaim must not retain bomb payload")
    ) {
      details.push(
        "reclaim quarantinedStdout payload drift → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `quarantinedStdout drift unexpectedly ${JSON.stringify(payloadDrift)}`,
      );
    }

    const inventDeliverTampered: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.assessment.withinBound && !reclaim2.assessment.withinBound) {
      inventDeliverTampered.quarantine = {
        ...reclaim2.quarantine,
        deliver: true,
      } as unknown as typeof reclaim2.quarantine;
    }
    const inventDeliverDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: inventDeliverTampered,
    });
    if (
      !inventDeliverDrift.ok &&
      inventDeliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      inventDeliverDrift.reasons.includes(
        "idempotent reclaim must not deliver oversized stdout",
      )
    ) {
      details.push(
        "reclaim invent-deliver on bomb → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `invent-deliver drift unexpectedly ${JSON.stringify(inventDeliverDrift)}`,
      );
    }

    const firstLiveTampered = {
      ...reclaim1,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim1;
    const firstLiveDrift = assertOutputBombReclaimIdempotent({
      first: firstLiveTampered,
      second: reclaim2,
    });
    if (
      !firstLiveDrift.ok &&
      firstLiveDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstLiveDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      )
    ) {
      details.push(
        "reclaim first-pass liveProviderSuccessClaimed drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first liveProviderSuccessClaimed drift unexpectedly ${JSON.stringify(firstLiveDrift)}`,
      );
    }

    const firstEffectsTampered = {
      ...reclaim1,
      externalEffects: "SYNC" as const,
    } as unknown as typeof reclaim1;
    const firstEffectsDrift = assertOutputBombReclaimIdempotent({
      first: firstEffectsTampered,
      second: reclaim2,
    });
    if (
      !firstEffectsDrift.ok &&
      firstEffectsDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstEffectsDrift.reasons.includes("externalEffects must be NONE on reclaim")
    ) {
      details.push(
        "reclaim first-pass externalEffects drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first externalEffects drift unexpectedly ${JSON.stringify(firstEffectsDrift)}`,
      );
    }

    const firstDeliverTampered: typeof reclaim1 = { ...reclaim1 };
    if (!reclaim1.assessment.withinBound) {
      firstDeliverTampered.quarantine = {
        ...reclaim1.quarantine,
        deliver: true,
      } as unknown as typeof reclaim1.quarantine;
    }
    const firstDeliverDrift = assertOutputBombReclaimIdempotent({
      first: firstDeliverTampered,
      second: reclaim2,
    });
    if (
      !firstDeliverDrift.ok &&
      firstDeliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      (firstDeliverDrift.reasons.includes("reclaim quarantine.deliver drifted") ||
        firstDeliverDrift.reasons.includes(
          "idempotent reclaim must not deliver oversized stdout",
        ))
    ) {
      details.push(
        "reclaim first-pass invent deliver → OUTPUT_BOMB_RECLAIM_DRIFT (no invent deliver)",
      );
    } else {
      passed = false;
      details.push(
        `first deliver drift unexpectedly ${JSON.stringify(firstDeliverDrift)}`,
      );
    }

    const firstPayloadTampered: typeof reclaim1 = { ...reclaim1 };
    if (!reclaim1.quarantine.deliver) {
      firstPayloadTampered.quarantine = {
        ...reclaim1.quarantine,
        quarantinedStdout: bombText.slice(0, 16),
      } as unknown as typeof reclaim1.quarantine;
    }
    const firstPayloadDrift = assertOutputBombReclaimIdempotent({
      first: firstPayloadTampered,
      second: reclaim2,
    });
    if (
      !firstPayloadDrift.ok &&
      firstPayloadDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstPayloadDrift.reasons.includes("reclaim must not retain bomb payload")
    ) {
      details.push(
        "reclaim first-pass quarantinedStdout payload → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first quarantinedStdout drift unexpectedly ${JSON.stringify(firstPayloadDrift)}`,
      );
    }

    const firstPriorTampered = {
      ...reclaim1,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim1;
    const firstPriorDrift = assertOutputBombReclaimIdempotent({
      first: firstPriorTampered,
      second: reclaim2,
    });
    if (
      !firstPriorDrift.ok &&
      firstPriorDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstPriorDrift.reasons.includes(
        "priorDeliverInvented must be false on both reclaim passes",
      )
    ) {
      details.push(
        "reclaim first-pass priorDeliverInvented drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first priorDeliverInvented drift unexpectedly ${JSON.stringify(firstPriorDrift)}`,
      );
    }

    const firstCodeTampered: typeof reclaim1 = { ...reclaim1 };
    if (!reclaim1.assessment.withinBound && "code" in reclaim1.assessment) {
      const tampered = { ...reclaim1.assessment } as { code: string; withinBound: false };
      tampered.code = "INVENTED_FIRST_CODE";
      firstCodeTampered.assessment = tampered as typeof reclaim1.assessment;
    }
    const firstCodeDrift = assertOutputBombReclaimIdempotent({
      first: firstCodeTampered,
      second: reclaim2,
    });
    if (
      !firstCodeDrift.ok &&
      firstCodeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstCodeDrift.reasons.includes("reclaim assessment.code drifted on over-bound")
    ) {
      details.push(
        "reclaim first-pass assessment.code drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first code drift unexpectedly ${JSON.stringify(firstCodeDrift)}`,
      );
    }

    const firstByteTampered: typeof reclaim1 = { ...reclaim1 };
    if (!reclaim1.assessment.withinBound) {
      firstByteTampered.assessment = {
        ...reclaim1.assessment,
        byteLength: reclaim1.assessment.byteLength + 2,
      };
    }
    const firstByteDrift = assertOutputBombReclaimIdempotent({
      first: firstByteTampered,
      second: reclaim2,
    });
    if (
      !firstByteDrift.ok &&
      firstByteDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstByteDrift.reasons.includes("reclaim assessment.byteLength drifted")
    ) {
      details.push(
        "reclaim first-pass assessment.byteLength drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first byteLength drift unexpectedly ${JSON.stringify(firstByteDrift)}`,
      );
    }

    const firstQuarantineCodeTampered: typeof reclaim1 = { ...reclaim1 };
    if (
      !reclaim1.quarantine.deliver &&
      !reclaim2.quarantine.deliver &&
      reclaim1.quarantine.code === reclaim2.quarantine.code
    ) {
      firstQuarantineCodeTampered.quarantine = {
        ...reclaim1.quarantine,
        code: "INVENTED_FIRST_Q_CODE",
      } as unknown as typeof reclaim1.quarantine;
    }
    const firstQCodeDrift = assertOutputBombReclaimIdempotent({
      first: firstQuarantineCodeTampered,
      second: reclaim2,
    });
    if (
      !firstQCodeDrift.ok &&
      firstQCodeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstQCodeDrift.reasons.includes("reclaim quarantine.code drifted")
    ) {
      details.push(
        "reclaim first-pass quarantine.code drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first quarantine.code drift unexpectedly ${JSON.stringify(firstQCodeDrift)}`,
      );
    }

    const firstWithinTampered: typeof reclaim1 = { ...reclaim1 };
    if (!reclaim1.assessment.withinBound) {
      firstWithinTampered.assessment = {
        ...reclaim1.assessment,
        withinBound: true,
      } as unknown as typeof reclaim1.assessment;
    }
    const firstWithinDrift = assertOutputBombReclaimIdempotent({
      first: firstWithinTampered,
      second: reclaim2,
    });
    if (
      !firstWithinDrift.ok &&
      firstWithinDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstWithinDrift.reasons.includes("reclaim assessment.withinBound drifted")
    ) {
      details.push(
        "reclaim first-pass assessment.withinBound drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first withinBound drift unexpectedly ${JSON.stringify(firstWithinDrift)}`,
      );
    }

    const firstReasonTampered: typeof reclaim1 = { ...reclaim1 };
    if (
      !reclaim1.quarantine.deliver &&
      !reclaim2.quarantine.deliver &&
      reclaim1.quarantine.code === reclaim2.quarantine.code
    ) {
      firstReasonTampered.quarantine = {
        ...reclaim1.quarantine,
        reason: `${reclaim1.quarantine.reason} (invent-first)`,
      };
    }
    const firstReasonDrift = assertOutputBombReclaimIdempotent({
      first: firstReasonTampered,
      second: reclaim2,
    });
    if (
      !firstReasonDrift.ok &&
      firstReasonDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      firstReasonDrift.reasons.includes("reclaim quarantine.reason drifted")
    ) {
      details.push(
        "reclaim first-pass quarantine.reason drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `first reason drift unexpectedly ${JSON.stringify(firstReasonDrift)}`,
      );
    }

    const firstDeliverOnlyTampered: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.quarantine.deliver && !reclaim2.quarantine.deliver) {
      firstDeliverOnlyTampered.quarantine = {
        ...reclaim2.quarantine,
        deliver: true,
      } as unknown as typeof reclaim2.quarantine;
    }
    const secondDeliverOnlyDrift = assertOutputBombReclaimIdempotent({
      first: reclaim1,
      second: firstDeliverOnlyTampered,
    });
    if (
      !secondDeliverOnlyDrift.ok &&
      secondDeliverOnlyDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      (secondDeliverOnlyDrift.reasons.includes("reclaim quarantine.deliver drifted") ||
        secondDeliverOnlyDrift.reasons.includes(
          "idempotent reclaim must not deliver oversized stdout",
        ))
    ) {
      details.push(
        "reclaim second-only deliver drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `second-only deliver drift unexpectedly ${JSON.stringify(secondDeliverOnlyDrift)}`,
      );
    }

    const dualPriorTampered = {
      ...reclaim1,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim1;
    const dualPriorSecond = {
      ...reclaim2,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim2;
    const dualPriorDrift = assertOutputBombReclaimIdempotent({
      first: dualPriorTampered,
      second: dualPriorSecond,
    });
    if (
      !dualPriorDrift.ok &&
      dualPriorDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualPriorDrift.reasons.includes(
        "priorDeliverInvented must be false on both reclaim passes",
      )
    ) {
      details.push(
        "reclaim dual-pass priorDeliverInvented drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual priorDeliver drift unexpectedly ${JSON.stringify(dualPriorDrift)}`,
      );
    }

    const dualLiveTampered = {
      ...reclaim1,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim1;
    const dualLiveSecond = {
      ...reclaim2,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim2;
    const dualLiveDrift = assertOutputBombReclaimIdempotent({
      first: dualLiveTampered,
      second: dualLiveSecond,
    });
    if (
      !dualLiveDrift.ok &&
      dualLiveDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualLiveDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      )
    ) {
      details.push(
        "reclaim dual-pass liveProviderSuccessClaimed drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual live claim drift unexpectedly ${JSON.stringify(dualLiveDrift)}`,
      );
    }

    const dualEffectsTampered = {
      ...reclaim1,
      externalEffects: "LIVE" as const,
    } as unknown as typeof reclaim1;
    const dualEffectsSecond = {
      ...reclaim2,
      externalEffects: "SYNC" as const,
    } as unknown as typeof reclaim2;
    const dualEffectsDrift = assertOutputBombReclaimIdempotent({
      first: dualEffectsTampered,
      second: dualEffectsSecond,
    });
    if (
      !dualEffectsDrift.ok &&
      dualEffectsDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualEffectsDrift.reasons.includes("externalEffects must be NONE on reclaim")
    ) {
      details.push(
        "reclaim dual-pass externalEffects drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual externalEffects drift unexpectedly ${JSON.stringify(dualEffectsDrift)}`,
      );
    }

    const dualPayloadFirst: typeof reclaim1 = { ...reclaim1 };
    const dualPayloadSecond: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.quarantine.deliver && !reclaim2.quarantine.deliver) {
      dualPayloadFirst.quarantine = {
        ...reclaim1.quarantine,
        quarantinedStdout: bombText.slice(0, 8),
      } as unknown as typeof reclaim1.quarantine;
      dualPayloadSecond.quarantine = {
        ...reclaim2.quarantine,
        quarantinedStdout: bombText.slice(0, 12),
      } as unknown as typeof reclaim2.quarantine;
    }
    const dualPayloadDrift = assertOutputBombReclaimIdempotent({
      first: dualPayloadFirst,
      second: dualPayloadSecond,
    });
    if (
      !dualPayloadDrift.ok &&
      dualPayloadDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualPayloadDrift.reasons.includes("reclaim must not retain bomb payload")
    ) {
      details.push(
        "reclaim dual-pass quarantinedStdout payload → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual quarantinedStdout drift unexpectedly ${JSON.stringify(dualPayloadDrift)}`,
      );
    }

    const dualQCodeFirst: typeof reclaim1 = { ...reclaim1 };
    const dualQCodeSecond: typeof reclaim2 = { ...reclaim2 };
    if (
      !reclaim1.quarantine.deliver &&
      !reclaim2.quarantine.deliver &&
      reclaim1.quarantine.code === reclaim2.quarantine.code
    ) {
      dualQCodeFirst.quarantine = {
        ...reclaim1.quarantine,
        code: "INVENTED_DUAL_Q_A",
      } as unknown as typeof reclaim1.quarantine;
      dualQCodeSecond.quarantine = {
        ...reclaim2.quarantine,
        code: "INVENTED_DUAL_Q_B",
      } as unknown as typeof reclaim2.quarantine;
    }
    const dualQCodeDrift = assertOutputBombReclaimIdempotent({
      first: dualQCodeFirst,
      second: dualQCodeSecond,
    });
    if (
      !dualQCodeDrift.ok &&
      dualQCodeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualQCodeDrift.reasons.includes("reclaim quarantine.code drifted")
    ) {
      details.push(
        "reclaim dual-pass quarantine.code drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual quarantine.code drift unexpectedly ${JSON.stringify(dualQCodeDrift)}`,
      );
    }

    const dualAssessFirst: typeof reclaim1 = { ...reclaim1 };
    const dualAssessSecond: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.assessment.withinBound && !reclaim2.assessment.withinBound) {
      dualAssessFirst.assessment = {
        ...reclaim1.assessment,
        code: "INVENTED_DUAL_ASSESS_A",
      } as unknown as typeof reclaim1.assessment;
      dualAssessSecond.assessment = {
        ...reclaim2.assessment,
        code: "INVENTED_DUAL_ASSESS_B",
      } as unknown as typeof reclaim2.assessment;
    }
    const dualAssessCodeDrift = assertOutputBombReclaimIdempotent({
      first: dualAssessFirst,
      second: dualAssessSecond,
    });
    if (
      !dualAssessCodeDrift.ok &&
      dualAssessCodeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualAssessCodeDrift.reasons.includes(
        "reclaim assessment.code drifted on over-bound",
      )
    ) {
      details.push(
        "reclaim dual-pass assessment.code drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual assessment.code drift unexpectedly ${JSON.stringify(dualAssessCodeDrift)}`,
      );
    }

    const dualWithinFirst: typeof reclaim1 = { ...reclaim1 };
    const dualWithinSecond: typeof reclaim2 = { ...reclaim2 };
    if (reclaim1.assessment.withinBound === reclaim2.assessment.withinBound) {
      dualWithinFirst.assessment = {
        ...reclaim1.assessment,
        withinBound: !reclaim1.assessment.withinBound,
      } as unknown as typeof reclaim1.assessment;
      dualWithinSecond.assessment = {
        ...reclaim2.assessment,
        withinBound: reclaim1.assessment.withinBound,
      } as unknown as typeof reclaim2.assessment;
    }
    const dualWithinDrift = assertOutputBombReclaimIdempotent({
      first: dualWithinFirst,
      second: dualWithinSecond,
    });
    if (
      !dualWithinDrift.ok &&
      dualWithinDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualWithinDrift.reasons.includes("reclaim assessment.withinBound drifted")
    ) {
      details.push(
        "reclaim dual-pass assessment.withinBound drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual withinBound drift unexpectedly ${JSON.stringify(dualWithinDrift)}`,
      );
    }

    const dualByteFirst: typeof reclaim1 = { ...reclaim1 };
    const dualByteSecond: typeof reclaim2 = { ...reclaim2 };
    if (
      reclaim1.assessment.withinBound === reclaim2.assessment.withinBound &&
      reclaim1.assessment.byteLength === reclaim2.assessment.byteLength
    ) {
      dualByteFirst.assessment = {
        ...reclaim1.assessment,
        byteLength: reclaim1.assessment.byteLength + 1,
      } as unknown as typeof reclaim1.assessment;
      dualByteSecond.assessment = {
        ...reclaim2.assessment,
        byteLength: reclaim2.assessment.byteLength + 2,
      } as unknown as typeof reclaim2.assessment;
    }
    const dualByteDrift = assertOutputBombReclaimIdempotent({
      first: dualByteFirst,
      second: dualByteSecond,
    });
    if (
      !dualByteDrift.ok &&
      dualByteDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualByteDrift.reasons.includes("reclaim assessment.byteLength drifted")
    ) {
      details.push(
        "reclaim dual-pass assessment.byteLength drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual byteLength drift unexpectedly ${JSON.stringify(dualByteDrift)}`,
      );
    }

    const dualReasonFirst: typeof reclaim1 = { ...reclaim1 };
    const dualReasonSecond: typeof reclaim2 = { ...reclaim2 };
    if (
      !reclaim1.quarantine.deliver &&
      !reclaim2.quarantine.deliver &&
      reclaim1.quarantine.code === reclaim2.quarantine.code
    ) {
      dualReasonFirst.quarantine = {
        ...reclaim1.quarantine,
        reason: `${reclaim1.quarantine.reason} (dual-a)`,
      };
      dualReasonSecond.quarantine = {
        ...reclaim2.quarantine,
        reason: `${reclaim2.quarantine.reason} (dual-b)`,
      };
    }
    const dualReasonOnlyDrift = assertOutputBombReclaimIdempotent({
      first: dualReasonFirst,
      second: dualReasonSecond,
    });
    if (
      !dualReasonOnlyDrift.ok &&
      dualReasonOnlyDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualReasonOnlyDrift.reasons.includes("reclaim quarantine.reason drifted")
    ) {
      details.push(
        "reclaim dual-pass quarantine.reason drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual reason-only drift unexpectedly ${JSON.stringify(dualReasonOnlyDrift)}`,
      );
    }

    const dualBothDeliverFirst: typeof reclaim1 = { ...reclaim1 };
    const dualBothDeliverSecond: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.assessment.withinBound && !reclaim2.assessment.withinBound) {
      dualBothDeliverFirst.quarantine = {
        ...reclaim1.quarantine,
        deliver: true,
      } as unknown as typeof reclaim1.quarantine;
      dualBothDeliverSecond.quarantine = {
        ...reclaim2.quarantine,
        deliver: true,
      } as unknown as typeof reclaim2.quarantine;
    }
    const dualBothDeliverDrift = assertOutputBombReclaimIdempotent({
      first: dualBothDeliverFirst,
      second: dualBothDeliverSecond,
    });
    if (
      !dualBothDeliverDrift.ok &&
      dualBothDeliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualBothDeliverDrift.reasons.includes(
        "idempotent reclaim must not deliver oversized stdout",
      )
    ) {
      details.push(
        "reclaim dual-pass oversized deliver → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual both-deliver drift unexpectedly ${JSON.stringify(dualBothDeliverDrift)}`,
      );
    }

    const dualFirstOnlyDelFirst: typeof reclaim1 = { ...reclaim1 };
    const dualFirstOnlyDelSecond: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.quarantine.deliver && !reclaim2.quarantine.deliver) {
      dualFirstOnlyDelFirst.quarantine = {
        ...reclaim1.quarantine,
        deliver: true,
      } as unknown as typeof reclaim1.quarantine;
      dualFirstOnlyDelSecond.quarantine = {
        ...reclaim2.quarantine,
        deliver: false,
      };
    }
    const dualFirstOnlyDeliverDrift = assertOutputBombReclaimIdempotent({
      first: dualFirstOnlyDelFirst,
      second: dualFirstOnlyDelSecond,
    });
    if (
      !dualFirstOnlyDeliverDrift.ok &&
      dualFirstOnlyDeliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualFirstOnlyDeliverDrift.reasons.includes("reclaim quarantine.deliver drifted")
    ) {
      details.push(
        "reclaim dual-pass first-only deliver drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual first-only deliver drift unexpectedly ${JSON.stringify(dualFirstOnlyDeliverDrift)}`,
      );
    }

    const dualCrossDishonestFirst = {
      ...reclaim1,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim1;
    const dualCrossDishonestSecond = {
      ...reclaim2,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim2;
    const dualCrossDishonestDrift = assertOutputBombReclaimIdempotent({
      first: dualCrossDishonestFirst,
      second: dualCrossDishonestSecond,
    });
    if (
      !dualCrossDishonestDrift.ok &&
      dualCrossDishonestDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualCrossDishonestDrift.reasons.includes(
        "priorDeliverInvented must be false on both reclaim passes",
      ) &&
      dualCrossDishonestDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      )
    ) {
      details.push(
        "reclaim cross-pass priorDeliver+liveClaim compound drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual cross dishonesty drift unexpectedly ${JSON.stringify(dualCrossDishonestDrift)}`,
      );
    }

    const dualSplitDeliverFirst: typeof reclaim1 = { ...reclaim1 };
    const dualSplitDeliverSecond: typeof reclaim2 = { ...reclaim2 };
    if (!reclaim1.assessment.withinBound && !reclaim2.assessment.withinBound) {
      dualSplitDeliverFirst.quarantine = {
        ...reclaim1.quarantine,
        deliver: true,
      } as unknown as typeof reclaim1.quarantine;
      dualSplitDeliverSecond.quarantine = {
        ...reclaim2.quarantine,
        deliver: false,
      } as unknown as typeof reclaim2.quarantine;
    }
    const dualSplitDeliverDrift = assertOutputBombReclaimIdempotent({
      first: dualSplitDeliverFirst,
      second: dualSplitDeliverSecond,
    });
    if (
      !dualSplitDeliverDrift.ok &&
      dualSplitDeliverDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      (dualSplitDeliverDrift.reasons.includes("reclaim quarantine.deliver drifted") ||
        dualSplitDeliverDrift.reasons.includes(
          "idempotent reclaim must not deliver oversized stdout",
        ))
    ) {
      details.push(
        "reclaim dual-pass oversized split deliver drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual split deliver drift unexpectedly ${JSON.stringify(dualSplitDeliverDrift)}`,
      );
    }

    const dualCrossPriorEffectsFirst = {
      ...reclaim1,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim1;
    const dualCrossPriorEffectsSecond = {
      ...reclaim2,
      externalEffects: "LIVE" as const,
    } as unknown as typeof reclaim2;
    const dualCrossPriorEffectsDrift = assertOutputBombReclaimIdempotent({
      first: dualCrossPriorEffectsFirst,
      second: dualCrossPriorEffectsSecond,
    });
    if (
      !dualCrossPriorEffectsDrift.ok &&
      dualCrossPriorEffectsDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualCrossPriorEffectsDrift.reasons.includes(
        "priorDeliverInvented must be false on both reclaim passes",
      ) &&
      dualCrossPriorEffectsDrift.reasons.includes(
        "externalEffects must be NONE on reclaim",
      )
    ) {
      details.push(
        "reclaim cross-pass priorDeliver+externalEffects drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual cross prior+effects drift unexpectedly ${JSON.stringify(dualCrossPriorEffectsDrift)}`,
      );
    }

    const dualCrossEffectsLiveFirst = {
      ...reclaim1,
      externalEffects: "SYNC" as const,
    } as unknown as typeof reclaim1;
    const dualCrossEffectsLiveSecond = {
      ...reclaim2,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim2;
    const dualCrossEffectsLiveDrift = assertOutputBombReclaimIdempotent({
      first: dualCrossEffectsLiveFirst,
      second: dualCrossEffectsLiveSecond,
    });
    if (
      !dualCrossEffectsLiveDrift.ok &&
      dualCrossEffectsLiveDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualCrossEffectsLiveDrift.reasons.includes(
        "externalEffects must be NONE on reclaim",
      ) &&
      dualCrossEffectsLiveDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      )
    ) {
      details.push(
        "reclaim cross-pass externalEffects+liveClaim drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual cross effects+live drift unexpectedly ${JSON.stringify(dualCrossEffectsLiveDrift)}`,
      );
    }

    const dualCrossLivePriorFirst = {
      ...reclaim1,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim1;
    const dualCrossLivePriorSecond = {
      ...reclaim2,
      priorDeliverInvented: true,
    } as unknown as typeof reclaim2;
    const dualCrossLivePriorDrift = assertOutputBombReclaimIdempotent({
      first: dualCrossLivePriorFirst,
      second: dualCrossLivePriorSecond,
    });
    if (
      !dualCrossLivePriorDrift.ok &&
      dualCrossLivePriorDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualCrossLivePriorDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      ) &&
      dualCrossLivePriorDrift.reasons.includes(
        "priorDeliverInvented must be false on both reclaim passes",
      )
    ) {
      details.push(
        "reclaim cross-pass liveClaim+priorDeliver swap drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual cross live+prior swap drift unexpectedly ${JSON.stringify(dualCrossLivePriorDrift)}`,
      );
    }

    const dualCrossPayloadLiveFirst: typeof reclaim1 = { ...reclaim1 };
    if (!reclaim1.quarantine.deliver) {
      dualCrossPayloadLiveFirst.quarantine = {
        ...reclaim1.quarantine,
        quarantinedStdout: bombText.slice(0, 4),
      } as unknown as typeof reclaim1.quarantine;
    }
    const dualCrossPayloadLiveSecond = {
      ...reclaim2,
      liveProviderSuccessClaimed: true,
    } as unknown as typeof reclaim2;
    const dualCrossPayloadLiveDrift = assertOutputBombReclaimIdempotent({
      first: dualCrossPayloadLiveFirst,
      second: dualCrossPayloadLiveSecond,
    });
    if (
      !dualCrossPayloadLiveDrift.ok &&
      dualCrossPayloadLiveDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      dualCrossPayloadLiveDrift.reasons.includes(
        "reclaim must not retain bomb payload",
      ) &&
      dualCrossPayloadLiveDrift.reasons.includes(
        "liveProviderSuccessClaimed must be false on reclaim",
      )
    ) {
      details.push(
        "reclaim cross-pass payload+liveClaim drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual cross payload+live drift unexpectedly ${JSON.stringify(dualCrossPayloadLiveDrift)}`,
      );
    }

    const dualCrossReasonCodeFirst: typeof reclaim1 = { ...reclaim1 };
    const dualCrossReasonCodeSecond: typeof reclaim2 = { ...reclaim2 };
    if (
      !reclaim1.quarantine.deliver &&
      !reclaim2.quarantine.deliver &&
      reclaim1.quarantine.code === reclaim2.quarantine.code
    ) {
      dualCrossReasonCodeFirst.quarantine = {
        ...reclaim1.quarantine,
        reason: `${reclaim1.quarantine.reason} (cross-r)`,
      };
      dualCrossReasonCodeSecond.quarantine = {
        ...reclaim2.quarantine,
        code: "INVENTED_CROSS_Q_CODE",
      } as unknown as typeof reclaim2.quarantine;
    }
    const dualCrossReasonCodeDrift = assertOutputBombReclaimIdempotent({
      first: dualCrossReasonCodeFirst,
      second: dualCrossReasonCodeSecond,
    });
    if (
      !dualCrossReasonCodeDrift.ok &&
      dualCrossReasonCodeDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT" &&
      (dualCrossReasonCodeDrift.reasons.includes(
        "reclaim quarantine.reason drifted",
      ) ||
        dualCrossReasonCodeDrift.reasons.includes("reclaim quarantine.code drifted"))
    ) {
      details.push(
        "reclaim cross-pass reason+code drift → OUTPUT_BOMB_RECLAIM_DRIFT",
      );
    } else {
      passed = false;
      details.push(
        `dual cross reason+code drift unexpectedly ${JSON.stringify(dualCrossReasonCodeDrift)}`,
      );
    }

    const emptyBound = assessStdoutBound("", maxBytes);
    const reasonTampered = {
      ...reclaim2,
      quarantine: {
        ...reclaim2.quarantine,
        reason: `${reclaim2.quarantine.deliver === false ? reclaim2.quarantine.reason : ""} (invent)`,
      },
    };
    const reasonDrift =
      !reclaim1.quarantine.deliver &&
      !reasonTampered.quarantine.deliver &&
      reclaim1.quarantine.code === reasonTampered.quarantine.code
        ? assertOutputBombReclaimIdempotent({
            first: reclaim1,
            second: reasonTampered,
          })
        : { ok: true, code: "OUTPUT_BOMB_RECLAIM_IDEMPOTENT" as const, reasons: [], externalEffects: "NONE" as const };
    if (
      emptyBound.withinBound &&
      emptyBound.byteLength === 0 &&
      !reasonDrift.ok &&
      reasonDrift.code === "OUTPUT_BOMB_RECLAIM_DRIFT"
    ) {
      details.push(
        "empty stdout within bound; reclaim quarantine.reason drift refused",
      );
    } else if (!emptyBound.withinBound || emptyBound.byteLength !== 0) {
      passed = false;
      details.push(`empty bound unexpectedly ${JSON.stringify(emptyBound)}`);
    } else {
      passed = false;
      details.push(`reason drift unexpectedly ${JSON.stringify(reasonDrift)}`);
    }

    details.push(
      "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED",
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  return {
    proofId: `proof-output-bomb-${randomUUID()}`,
    kind: SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-output-bomb-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
