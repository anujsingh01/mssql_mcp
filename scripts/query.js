// Ad-hoc read-only query from the command line:  node scripts/query.js [--db NAME] "SELECT ..."
import { runReadOnly } from "../src/db.js";
const args = process.argv.slice(2);
let database;
if (args[0] === "--db") { database = args[1]; args.splice(0, 2); }
const sqlText = args.join(" ");
try {
  const r = await runReadOnly(sqlText, { database });
  console.table(r.rows);
  console.log(`${r.rowCount} rows${r.truncated ? " (truncated)" : ""} in ${r.elapsedMs} ms`);
} catch (e) { console.error("Error:", e.message); process.exitCode = 1; }
process.exit();
