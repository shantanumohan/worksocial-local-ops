/**
 * Ensure tests/acceptance-matrix-v6.json stays aligned with the full catalog:
 * - exactly 159 IDs (T-F01–26, T-US-001–060, T-X001–073)
 * - every matrix ID has a definition-shaped catalog entry (heading / list item / table row)
 * - every catalog definition ID appears in the matrix
 * - statuses are NOT_RUN | ACCEPTED | BLOCKED (never silently VERIFIED for live)
 * - ACCEPTED requires evidenceArtifactId + resultEnvironment fixture|sandbox + on-disk artifact
 * - ChatGPT Ads transport/entitlement gate retained on T-F07 / T-US-013 / T-US-014
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type MatrixCase = {
  id: string;
  kind: string;
  status: string;
  level?: string;
  title?: string;
  gates?: string[];
  fixtureClass?: string;
  requirements?: string[];
  definitionShape?: string;
  evidenceArtifactId?: string | null;
  resultEnvironment?: string | null;
};

type Matrix = {
  cases: MatrixCase[];
  totals: {
    all: number;
    flows: number;
    userStories: number;
    experience: number;
    notRun?: number;
    accepted?: number;
  };
  summary?: {
    total?: number;
    byStatus?: Record<string, number>;
    blockingOpen?: number;
    generatedAt?: string;
    source?: string;
  };
  sourceDocument?: string;
};

const ALLOWED_STATUSES = new Set(["NOT_RUN", "ACCEPTED", "BLOCKED", "FAILED"]);
const ACCEPTED_ENVS = new Set(["fixture", "sandbox"]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const catalogPath = resolve(root, "docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md");
const evidenceDir = resolve(root, "tests/acceptance-evidence/fixture");

const expectedIds = [
  ...Array.from({ length: 26 }, (_, i) => `T-F${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 60 }, (_, i) => `T-US-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 73 }, (_, i) => `T-X${String(i + 1).padStart(3, "0")}`),
];

const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as Matrix;
const catalog = readFileSync(catalogPath, "utf8");

/** Definition-shaped occurrences only — not family headings or prose mentions. */
function parseCatalogDefinitionIds(src: string): Map<string, "heading" | "list_item" | "table_row"> {
  const found = new Map<string, "heading" | "list_item" | "table_row">();
  for (const m of src.matchAll(/^### (T-F\d{2}) - .+$/gm)) {
    found.set(m[1]!, "heading");
  }
  for (const m of src.matchAll(/^- \*\*(T-US-\d{3})\*\* .+$/gm)) {
    found.set(m[1]!, "list_item");
  }
  for (const m of src.matchAll(/^\| (T-X\d{3}) \| .+? \| .+? \|$/gm)) {
    found.set(m[1]!, "table_row");
  }
  return found;
}

const errors: string[] = [];
const catalogDefs = parseCatalogDefinitionIds(catalog);

if (matrix.totals.all !== 159) {
  errors.push(`totals.all expected 159, got ${matrix.totals.all}`);
}
if (matrix.cases.length !== 159) {
  errors.push(`cases.length expected 159, got ${matrix.cases.length}`);
}

const matrixIds = matrix.cases.map((c) => c.id);
const matrixSet = new Set(matrixIds);
const expectedSet = new Set(expectedIds);

for (const id of expectedIds) {
  if (!matrixSet.has(id)) errors.push(`matrix missing expected id ${id}`);
  if (!catalogDefs.has(id)) errors.push(`catalog missing definition-shaped entry for ${id}`);
}
for (const id of matrixIds) {
  if (!expectedSet.has(id)) errors.push(`matrix has unexpected id ${id}`);
}
for (const id of catalogDefs.keys()) {
  if (!matrixSet.has(id)) errors.push(`catalog definition ${id} missing from matrix`);
}
if (matrixIds.length !== new Set(matrixIds).size) {
  errors.push("matrix contains duplicate ids");
}

let acceptedCount = 0;
let notRunCount = 0;
const caseStatusCounts: Record<string, number> = {};

for (const c of matrix.cases) {
  if (c.status.toUpperCase() === "VERIFIED") {
    errors.push(
      `${c.id} status VERIFIED is forbidden — never silently VERIFIED for live; use ACCEPTED with evidence or NOT_RUN`,
    );
  }
  if (!ALLOWED_STATUSES.has(c.status)) {
    errors.push(`${c.id} status must be NOT_RUN|ACCEPTED|BLOCKED|FAILED, got ${c.status}`);
  }
  caseStatusCounts[c.status] = (caseStatusCounts[c.status] ?? 0) + 1;
  if (c.status === "NOT_RUN") notRunCount += 1;
  if (c.status === "ACCEPTED") {
    acceptedCount += 1;
    if (!c.evidenceArtifactId || !String(c.evidenceArtifactId).trim()) {
      errors.push(`${c.id} ACCEPTED requires evidenceArtifactId`);
    }
    if (!c.resultEnvironment || !ACCEPTED_ENVS.has(c.resultEnvironment)) {
      errors.push(
        `${c.id} ACCEPTED requires resultEnvironment fixture|sandbox, got ${JSON.stringify(c.resultEnvironment)}`,
      );
    }
    if (c.evidenceArtifactId) {
      const evidencePath = resolve(evidenceDir, `${c.evidenceArtifactId}.json`);
      if (!existsSync(evidencePath)) {
        errors.push(
          `${c.id} ACCEPTED evidence missing at tests/acceptance-evidence/fixture/${c.evidenceArtifactId}.json — run pnpm release:evidence`,
        );
      } else {
        try {
          const art = JSON.parse(readFileSync(evidencePath, "utf8")) as {
            artifactId?: string;
            caseId?: string;
            environment?: string;
            redacted?: boolean;
            liveProviderSuccessClaimed?: boolean;
          };
          if (art.artifactId !== c.evidenceArtifactId) {
            errors.push(`${c.id} evidence artifactId mismatch`);
          }
          if (art.caseId !== c.id) {
            errors.push(`${c.id} evidence caseId mismatch`);
          }
          if (art.environment !== c.resultEnvironment) {
            errors.push(`${c.id} evidence environment mismatch`);
          }
          if (art.redacted !== true) {
            errors.push(`${c.id} evidence must be redacted`);
          }
          if (art.liveProviderSuccessClaimed === true) {
            errors.push(`${c.id} evidence must not claim live provider success`);
          }
        } catch (err) {
          errors.push(
            `${c.id} evidence artifact unreadable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
  if (!c.title || !c.title.trim()) {
    errors.push(`${c.id} missing title (unresolvable definition)`);
  }
  if (!c.fixtureClass) {
    errors.push(`${c.id} missing fixtureClass`);
  }
  const shape = catalogDefs.get(c.id);
  if (!shape) {
    errors.push(`${c.id} does not resolve to a definition-shaped catalog entry`);
  } else if (c.definitionShape && c.definitionShape !== shape) {
    errors.push(`${c.id} definitionShape ${c.definitionShape} != catalog ${shape}`);
  }

  if (c.kind === "flow") {
    if (c.level !== "full_stack_e2e") {
      errors.push(`${c.id} level must be full_stack_e2e, got ${JSON.stringify(c.level)}`);
    }
    if (c.level?.includes("|") || c.level?.toLowerCase().includes("status")) {
      errors.push(`${c.id} level still contains status/pipe payload`);
    }
    for (const r of c.requirements ?? []) {
      if (!/^RQ-\d+$/.test(r)) {
        errors.push(`${c.id} requirement not a clean RQ id: ${JSON.stringify(r)}`);
      }
    }
  }
  if (c.kind === "user_story" && c.level !== "behavior_acceptance") {
    errors.push(`${c.id} level must be behavior_acceptance`);
  }
  if (c.kind === "experience" && c.level !== "platform_security_resilience") {
    errors.push(`${c.id} level must be platform_security_resilience`);
  }
}

if (matrix.totals.notRun !== undefined && matrix.totals.notRun !== notRunCount) {
  errors.push(`totals.notRun expected ${notRunCount}, got ${matrix.totals.notRun}`);
}
if (matrix.totals.accepted !== undefined && matrix.totals.accepted !== acceptedCount) {
  errors.push(`totals.accepted expected ${acceptedCount}, got ${matrix.totals.accepted}`);
}

// summary.byStatus must match the full cases[] status map — ACCEPTED ≠ VERIFIED
if (matrix.summary?.byStatus) {
  const summaryKeys = new Set(Object.keys(matrix.summary.byStatus));
  const caseKeys = new Set(Object.keys(caseStatusCounts));
  for (const status of new Set([...summaryKeys, ...caseKeys])) {
    if (status === "VERIFIED") {
      const verifiedCount = matrix.summary.byStatus.VERIFIED ?? 0;
      if (verifiedCount !== 0 || (caseStatusCounts.VERIFIED ?? 0) !== 0) {
        errors.push(
          `summary.byStatus.VERIFIED must be 0 — ACCEPTED ≠ VERIFIED; never silently VERIFIED for live`,
        );
      }
      continue;
    }
    const expected = caseStatusCounts[status] ?? 0;
    const actual = matrix.summary.byStatus[status] ?? 0;
    if (expected !== actual) {
      errors.push(
        `summary.byStatus.${status} expected ${expected}, got ${actual} (drift vs cases[])`,
      );
    }
  }
  // Zero-count allowed statuses may be omitted from summary; non-zero must match.
  // Unexpected summary keys outside ALLOWED_STATUSES ∪ {VERIFIED} are honesty drift.
  for (const status of summaryKeys) {
    if (!ALLOWED_STATUSES.has(status) && status !== "VERIFIED") {
      errors.push(
        `summary.byStatus has unexpected status key ${status} (allowed: ${[...ALLOWED_STATUSES].join("|")})`,
      );
    }
  }
}
if (matrix.summary?.total !== undefined && matrix.summary.total !== matrix.cases.length) {
  errors.push(
    `summary.total expected ${matrix.cases.length}, got ${matrix.summary.total}`,
  );
}

const adsGateIds = ["T-F07", "T-US-013", "T-US-014"];
for (const id of adsGateIds) {
  const c = matrix.cases.find((x) => x.id === id);
  if (!c?.gates?.includes("chatgpt_ads_transport_entitlement")) {
    errors.push(`${id} must retain chatgpt_ads_transport_entitlement gate`);
  }
  if (c && c.status === "ACCEPTED") {
    errors.push(`${id} ChatGPT Ads case must not be ACCEPTED without transport/entitlement`);
  }
}

if (!catalog.includes("fixture") || !catalog.includes("sandbox") || !catalog.includes("authorized production")) {
  errors.push("catalog must preserve fixture/sandbox/authorized-production distinction");
}
if (!catalog.includes("transport") || !catalog.includes("entitlement")) {
  errors.push("catalog must preserve ChatGPT Ads transport/entitlement gate language");
}

if (errors.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        matrixPath,
        catalogPath,
        catalogDefinitionCount: catalogDefs.size,
        errorCount: errors.length,
        errors,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      cases: matrix.cases.length,
      catalogDefinitions: catalogDefs.size,
      notRun: notRunCount,
      accepted: acceptedCount,
      allNotRun: notRunCount === 159,
      chatgptAdsGates: adsGateIds,
      sourceDocument: matrix.sourceDocument ?? "docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md",
    },
    null,
    2,
  ),
);
