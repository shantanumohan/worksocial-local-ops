/**
 * Fixture proof for T-X011 — output bomb bounded/quarantined.
 * Hillclimb deepen: exact-at-bound ok; zero/negative/non-finite max refused;
 * UTF-8 4-byte emoji bomb; close-path one-shot bomb quarantine; live VERIFIED /
 * force-deliver refused; mismatched honesty; ACCEPTED≠VERIFIED.
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
  invokeClaudeCli,
  quarantineStdoutDelivery,
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
