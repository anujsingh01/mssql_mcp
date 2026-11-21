# MSSQL MCP (Prestige)

A read-only MCP server that lets Claude query the Prestige SQL Server over the FortiClient VPN.

## Before using it
1. Connect the VPN in FortiClient (profile "Prestage").
2. Make sure `.env` exists with the database login (copy `.env.example` and fill it in).

## Tools
- `list_databases` – user databases on the server
- `list_tables` – tables/views in a database with row counts
- `describe_table` – columns, keys and foreign keys
- `sample_rows` – first N rows of a table
- `run_query` – a single SELECT, capped at `MSSQL_MAX_ROWS` rows

Anything that writes (INSERT/UPDATE/DELETE/EXEC/...) is rejected before it reaches the server.

## Test
```
npm test
```

## Ad-hoc query from the terminal
```
node scripts/query.js "SELECT TOP 5 * FROM dbo.PB_Product_Master"
```

## Data
The login only sees the `Bi_Data` database (read-only). See `docs/data-map.md`.

## Data checks
```
node scripts/data-checks.js 2026-04-01 2026-11-08
```
Writes `docs/data-check-report.md`. Rules and the raw-to-golden analysis: `docs/raw-to-golden-gap.md`.
