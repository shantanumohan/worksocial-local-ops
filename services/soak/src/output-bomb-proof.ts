/**
 * Fixture proof for T-X011 — output bomb bounded/quarantined.
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
      overQ.deliver === false
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
    if (safe.withinBound && safeQ.deliver === true) {
      details.push("Under-bound stdout remains deliverable");
    } else {
      passed = false;
      details.push(
        `Under-bound unexpectedly ${JSON.stringify({ safe, safeQ })}`,
      );
    }

    // 3. UTF-8 multi-byte counted by bytes, not characters.
    const multi = "é".repeat(maxBytes); // 2 bytes each in UTF-8
    const multiBound = assessStdoutBound(multi, maxBytes);
    if (
      !multiBound.withinBound &&
      multiBound.code === "OUTPUT_TOO_LARGE" &&
      multiBound.byteLength > maxBytes
    ) {
      details.push(
        `UTF-8 multi-byte bomb counted by bytes (${multiBound.byteLength}B)`,
      );
    } else {
      passed = false;
      details.push(`UTF-8 bound unexpectedly ${JSON.stringify(multiBound)}`);
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

    details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
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
