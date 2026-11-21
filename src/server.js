#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runReadOnly, quoteIdent, settings } from "./db.js";

const server = new McpServer({ name: "mssql-prestige", version: "0.1.0" });

function text(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

function fail(err) {
  return { isError: true, content: [{ type: "text", text: `Error: ${err.message || err}` }] };
}

const dbArg = z
  .string()
  .optional()
  .describe(`Database name. Defaults to ${settings.database}.`);

server.registerTool(
  "list_databases",
  {
    title: "List databases",
    description: "Lists the user databases on the SQL Server (system databases excluded).",
    inputSchema: {},
  },
  async () => {
    try {
      const r = await runReadOnly(
        "SELECT name, state_desc, create_date FROM sys.databases WHERE database_id > 4 ORDER BY name"
      );
      return text(r.rows);
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "list_tables",
  {
    title: "List tables and views",
    description:
      "Lists tables and views in a database with their approximate row counts. Optional name filter (substring, case-insensitive).",
    inputSchema: { database: dbArg, filter: z.string().optional().describe("Substring to match in the table name") },
  },
  async ({ database, filter }) => {
    try {
      const r = await runReadOnly(
        `SELECT s.name AS [schema], o.name AS [table], o.type_desc AS kind,
                ISNULL(p.rows, 0) AS approx_rows
         FROM sys.objects o
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         LEFT JOIN (SELECT object_id, SUM(rows) AS rows FROM sys.partitions WHERE index_id IN (0,1) GROUP BY object_id) p
           ON p.object_id = o.object_id
         WHERE o.type IN ('U','V')
           AND (@filter IS NULL OR o.name LIKE '%' + @filter + '%')
         ORDER BY s.name, o.name`,
        { database, maxRows: settings.maxRows, params: { filter: filter ?? null } }
      );
      return text({ database: database || settings.database, count: r.rowCount, truncated: r.truncated, tables: r.rows });
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "describe_table",
  {
    title: "Describe table",
    description: "Shows the columns, types, nullability, primary key and foreign keys of a table or view.",
    inputSchema: {
      database: dbArg,
      table: z.string().describe("Table name, optionally schema-qualified like dbo.Orders"),
    },
  },
  async ({ database, table }) => {
    try {
      const [schemaName, tableName] = table.includes(".") ? table.split(".", 2) : ["dbo", table];
      const cols = await runReadOnly(
        `SELECT c.column_id AS ordinal, c.name AS [column], t.name AS type,
                c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
                CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
         FROM sys.columns c
         JOIN sys.types t ON t.user_type_id = c.user_type_id
         JOIN sys.objects o ON o.object_id = c.object_id
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         LEFT JOIN (SELECT ic.object_id, ic.column_id FROM sys.index_columns ic
                    JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND i.is_primary_key = 1) pk
           ON pk.object_id = c.object_id AND pk.column_id = c.column_id
         WHERE s.name = @schema AND o.name = @table
         ORDER BY c.column_id`,
        { database, params: { schema: schemaName, table: tableName } }
      );
      if (cols.rowCount === 0) throw new Error(`Table ${schemaName}.${tableName} not found.`);
      const fks = await runReadOnly(
        `SELECT fk.name AS constraint_name, pc.name AS [column],
                rs.name + '.' + ro.name AS references_table, rc.name AS references_column
         FROM sys.foreign_keys fk
         JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
         JOIN sys.objects po ON po.object_id = fk.parent_object_id
         JOIN sys.schemas ps ON ps.schema_id = po.schema_id
         JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
         JOIN sys.objects ro ON ro.object_id = fk.referenced_object_id
         JOIN sys.schemas rs ON rs.schema_id = ro.schema_id
         JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
         WHERE ps.name = @schema AND po.name = @table`,
        { database, params: { schema: schemaName, table: tableName } }
      );
      return text({ table: `${schemaName}.${tableName}`, columns: cols.rows, foreign_keys: fks.rows });
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "sample_rows",
  {
    title: "Sample rows",
    description: "Returns the first few rows of a table so you can see real values.",
    inputSchema: {
      database: dbArg,
      table: z.string().describe("Table name, optionally schema-qualified"),
      limit: z.number().int().min(1).max(100).default(10),
    },
  },
  async ({ database, table, limit }) => {
    try {
      const [schemaName, tableName] = table.includes(".") ? table.split(".", 2) : ["dbo", table];
      const r = await runReadOnly(
        `SELECT TOP (${limit}) * FROM ${quoteIdent(schemaName)}.${quoteIdent(tableName)}`,
        { database, maxRows: limit }
      );
      return text(r);
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "run_query",
  {
    title: "Run read-only SQL query",
    description:
      `Runs a single SELECT query and returns the rows. Anything that modifies data is rejected. ` +
      `Results are capped at ${settings.maxRows} rows and ${settings.timeoutMs / 1000} seconds; ` +
      `use aggregation (GROUP BY) rather than pulling raw rows for KPIs.`,
    inputSchema: {
      database: dbArg,
      sql: z.string().describe("T-SQL SELECT statement"),
      max_rows: z.number().int().min(1).max(settings.maxRows).optional(),
    },
  },
  async ({ database, sql: sqlText, max_rows }) => {
    try {
      const r = await runReadOnly(sqlText, { database, maxRows: max_rows });
      return text(r);
    } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
