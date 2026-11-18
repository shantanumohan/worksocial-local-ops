import { runSupervisor } from "../services/supervisor/src/index.ts";

const result = runSupervisor("doctor");
console.log(JSON.stringify(result, null, 2));
process.exit(0);
