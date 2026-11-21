import sql from "mssql";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load .env from the project root no matter where node was started from.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

export const settings = {
  host: process.env.MSSQL_HOST || "10.225.132.35",
  port: Number(process.env.MSSQL_PORT || 1433),
  user: () => need("MSSQL_USER"),
  password: () => need("MSSQL_PASSWORD"),
  database: process.env.MSSQL_DATABASE || "master",
  maxRows: Number(process.env.MSSQL_MAX_ROWS || 500),
  timeoutMs: Number(process.env.MSSQL_QUERY_TIMEOUT_SECONDS || 30) * 1000,
};

let poolPromise = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      server: settings.host,
      port: settings.port,
      user: settings.user(),
      password: settings.password(),
      database: settings.database,
      connectionTimeout: 15000,
      requestTimeout: settings.timeoutMs,
      pool: { max: 3, min: 0, idleTimeoutMillis: 60000 },
      options: {
        // The server reported "encryption not supported" in its pre-login handshake;
        // traffic is already inside the VPN tunnel.
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        appName: "claude-mssql-mcp",
      },
    })
      .connect()
      .catch((err) => {
        poolPromise = null; // allow a retry on the next call
        throw err;
      });
  }
  return poolPromise;
}

// ---------- read-only guard ----------

const FORBIDDEN = [
  "insert", "update", "delete", "merge", "truncate", "drop", "alter", "create",
  "exec", "execute", "grant", "revoke", "deny", "backup", "restore", "shutdown",
  "kill", "dbcc", "waitfor", "openrowset", "openquery", "opendatasource", "bulk",
  "reconfigure", "sp_", "xp_", "into",
];

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function stripStrings(s) {
  // Remove string literals and bracketed identifiers so words inside them are not flagged.
  return s.replace(/'(?:[^']|'')*'/g, "''").replace(/\[[^\]]*\]/g, "[x]");
}

/** Throws if the SQL is anything other than a single SELECT / WITH ... SELECT. */
export function assertReadOnly(sqlText) {
  const cleaned = stripComments(sqlText).trim().replace(/;+\s*$/, "");
  if (!cleaned) throw new Error("Empty query.");
  if (cleaned.includes(";")) throw new Error("Only one statement is allowed per query.");
  const bare = stripStrings(cleaned).toLowerCase();
  if (!/^(select|with)\b/.test(bare)) {
    throw new Error("Only SELECT queries are allowed (the query must start with SELECT or WITH).");
  }
  const words = bare.match(/[a-z_][a-z0-9_]*/g) || [];
  for (const w of words) {
    if (FORBIDDEN.includes(w) || w.startsWith("sp_") || w.startsWith("xp_")) {
      throw new Error(`Read-only server: the keyword "${w.toUpperCase()}" is not allowed.`);
    }
  }
  return cleaned;
}

// ---------- query runner with row cap ----------

function quoteIdent(name) {
  if (!/^[A-Za-z0-9_ .\-$#@]+$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `[${name.replace(/]/g, "]]")}]`;
}

/**
 * Runs a read-only query. Streams rows and cancels the request once maxRows
 * is reached, so the server never sends more than we need.
 */
export async function runReadOnly(sqlText, { database, maxRows, params } = {}) {
  const text = assertReadOnly(sqlText);
  const cap = Math.min(Math.max(1, maxRows || settings.maxRows), settings.maxRows);
  const pool = await getPool();
  const request = pool.request();
  request.stream = true;
  for (const [k, v] of Object.entries(params || {})) request.input(k, v);

  const prefix = database ? `USE ${quoteIdent(database)};\n` : "";
  // "USE db; SELECT ..." is two statements by design; the guard already approved SELECT.
  const started = Date.now();
  const rows = [];
  let columns = [];
  let truncated = false;

  await new Promise((resolve, reject) => {
    request.on("recordset", (cols) => {
      columns = Object.keys(cols).map((name) => ({
        name,
        type: cols[name].type?.declaration || cols[name].type?.name || "unknown",
      }));
    });
    request.on("row", (row) => {
      if (rows.length < cap) rows.push(row);
      else if (!truncated) {
        truncated = true;
        request.cancel();
      }
    });
    request.on("error", (err) => {
      // A cancel we requested surfaces as ECANCEL; that is expected.
      if (truncated && (err.code === "ECANCEL" || /cancel/i.test(err.message))) return;
      reject(err);
    });
    request.on("done", () => resolve());
    request.query(prefix + text);
  });

  return { columns, rows, rowCount: rows.length, truncated, elapsedMs: Date.now() - started };
}

export { quoteIdent, sql };
