/**
 * @deprecated Use services/supervisor/src/cli.ts — kept as a redirect so old docs/scripts fail loudly with guidance.
 */
console.error(
  "supervisor-stub.ts is retired. Use: pnpm local:start|local:stop|local:doctor or tsx services/supervisor/src/cli.ts <command>",
);
process.exit(1);
