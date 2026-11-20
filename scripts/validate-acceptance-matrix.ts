/**
 * Ensure tests/acceptance-matrix-v6.json stays aligned with the full catalog:
 * - exactly 159 IDs (T-F01–26, T-US-001–060, T-X001–073)
 * - every matrix ID appears in the catalog document
 * - every catalog ID appears in the matrix
 * - every case status is NOT_RUN
 * - ChatGPT Ads transport/entitlement gate retained on T-F07 / T-US-013 / T-US-014
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type MatrixCase = {
  id: string;
  kind: string;
  status: string;
  title?: string;
  gates?: string[];
  fixtureClass?: string;
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

const errors: string[] = [];

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
}
for (const id of matrixIds) {
  if (!expectedSet.has(id)) errors.push(`matrix has unexpected id ${id}`);
}
if (matrixIds.length !== new Set(matrixIds).size) {
  errors.push("matrix contains duplicate ids");
}

for (const c of matrix.cases) {
  if (c.status !== "NOT_RUN") {
    errors.push(`${c.id} status must be NOT_RUN, got ${c.status}`);
  }
  if (!catalog.includes(c.id)) {
    errors.push(`${c.id} does not resolve in catalog document`);
  }
  if (!c.title || !c.title.trim()) {
    errors.push(`${c.id} missing title (unresolvable definition)`);
  }
  if (!c.fixtureClass) {
    errors.push(`${c.id} missing fixtureClass`);
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

const catalogIds = new Set<string>();
for (const m of catalog.matchAll(/\b(T-F\d{2}|T-US-\d{3}|T-X\d{3})\b/g)) {
  catalogIds.add(m[1]!);
}
for (const id of expectedIds) {
  if (!catalogIds.has(id)) errors.push(`catalog missing expected id ${id}`);
}

if (errors.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        matrixPath,
        catalogPath,
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
      allNotRun: true,
      chatgptAdsGates: adsGateIds,
      sourceDocument: matrix.sourceDocument ?? "docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md",
    },
    null,
    2,
  ),
);
