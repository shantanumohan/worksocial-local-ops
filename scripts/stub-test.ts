/**
 * Placeholder suite runner.
 *
 * Intentionally fails (non-zero exit). NOT_IMPLEMENTED / incomplete suites must
 * never satisfy required CI or release checks by exiting 0.
 */
const name = process.argv[2] ?? "unknown";

const report = {
  suite: name,
  status: "INCOMPLETE",
  implemented: false,
  productionActivated: false,
  releaseGateEligible: false,
  message: `Stub suite '${name}' is NOT_IMPLEMENTED — incomplete; cannot satisfy required checks or release evidence.`,
};

console.error(JSON.stringify(report, null, 2));
process.exit(1);
