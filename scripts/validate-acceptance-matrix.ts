/**
 * Ensure tests/acceptance-matrix-v6.json stays aligned with the full catalog:
 * - exactly 159 IDs (T-F01–26, T-US-001–060, T-X001–073)
 * - every matrix ID has a definition-shaped catalog entry (heading / list item / table row)
 * - every catalog definition ID appears in the matrix
 * - every case status is NOT_RUN; flow levels/requirements are cleanly parsed
 * - ChatGPT Ads transport/entitlement gate retained on T-F07 / T-US-013 / T-US-014
 */
import { readFileSync } from "node:fs";
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
};

type Matrix = {
  cases: MatrixCase[];
  totals: { all: number; flows: number; userStories: number; experience: number };
  sourceDocument?: string;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const catalogPath = resolve(root, "docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md");

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

for (const c of matrix.cases) {
  if (c.status !== "NOT_RUN") {
    errors.push(`${c.id} status must be NOT_RUN, got ${c.status}`);
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

const adsGateIds = ["T-F07", "T-US-013", "T-US-014"];
for (const id of adsGateIds) {
  const c = matrix.cases.find((x) => x.id === id);
  if (!c?.gates?.includes("chatgpt_ads_transport_entitlement")) {
    errors.push(`${id} must retain chatgpt_ads_transport_entitlement gate`);
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
      allNotRun: true,
      chatgptAdsGates: adsGateIds,
      sourceDocument: matrix.sourceDocument ?? "docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md",
    },
    null,
    2,
  ),
);
