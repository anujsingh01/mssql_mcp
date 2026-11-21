// Quick end-to-end check: start the MCP server over stdio and call each tool.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({ command: "node", args: [path.join(root, "src/server.js")] });
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);

const show = (label, r) => {
  const t = r.content?.[0]?.text ?? "";
  console.log(`\n=== ${label}${r.isError ? " (ERROR)" : ""} ===\n${t.slice(0, 1500)}${t.length > 1500 ? "\n...[truncated]" : ""}`);
};

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

show("list_databases", await client.callTool({ name: "list_databases", arguments: {} }));
show("run_query ok", await client.callTool({ name: "run_query", arguments: { sql: "SELECT @@VERSION AS version, DB_NAME() AS db" } }));
show("run_query blocked", await client.callTool({ name: "run_query", arguments: { sql: "DELETE FROM x" } }));
show("run_query blocked 2", await client.callTool({ name: "run_query", arguments: { sql: "SELECT 1; DROP TABLE x" } }));

await client.close();
