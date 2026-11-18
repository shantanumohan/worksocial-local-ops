const name = process.argv[2] ?? "unknown";
console.log(
  JSON.stringify(
    {
      suite: name,
      status: "NOT_IMPLEMENTED",
      productionActivated: false,
      message: `Stub suite '${name}' — no external effects; implement in later WPs.`,
    },
    null,
    2,
  ),
);
process.exit(0);
