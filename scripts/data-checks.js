// Data-correctness checks on the raw Bi_Data tables.
// Usage: node scripts/data-checks.js [from] [to]   (defaults: current FY start .. today)
import { runReadOnly } from "../src/db.js";
import fs from "node:fs";

const today = new Date();
const fyStart = new Date(today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1, 3, 1);
const from = process.argv[2] || fyStart.toISOString().slice(0, 10);
const to = process.argv[3] || today.toISOString().slice(0, 10);

const BASE = `
  FROM dbo.Sales_Transactions_Detail s
  WHERE s.BillingDate >= @from AND s.BillingDate <= @to`;
const GOLDEN_FILTER = ` AND s.InvoiceType NOT IN ('ZFOC','ZGST','ZCR3') AND s.RefDocType NOT IN ('ZFOC','ZGST','ZCR3')`;
const REV = `(CASE WHEN s.SalesOrg='DOM' THEN s.BasicPrice ELSE s.GrossSalesRevenue END + s.QTY_DISCOUNT)`;

// Each check: id, area, rule (what must be true), sql returning columns [value, detail?], expect: value => pass?
const checks = [
  // ---------- A. Master data integrity ----------
  { id: "A1", area: "Master", rule: "Every product code on golden-scope sales exists in PB_Product_Master",
    sql: `SELECT COUNT(DISTINCT s.ProductCode) AS value, CAST(SUM(${REV}) AS bigint) AS revenue_impact ${BASE} ${GOLDEN_FILTER} AND NOT EXISTS (SELECT 1 FROM dbo.PB_Product_Master p WHERE p.Product_Code = s.ProductCode)`,
    expect: (v) => v === 0 },
  { id: "A2", area: "Master", rule: "Every customer code on golden-scope sales exists in PB_Customer_Master",
    sql: `SELECT COUNT(DISTINCT s.CustomerCode) AS value, CAST(SUM(${REV}) AS bigint) AS revenue_impact ${BASE} ${GOLDEN_FILTER} AND NOT EXISTS (SELECT 1 FROM dbo.PB_Customer_Master c WHERE CAST(c.BillToParty AS varchar(20)) = s.CustomerCode)`,
    expect: (v) => v === 0 },
  { id: "A3", area: "Master", rule: "Every sold customer has a non-blank Channel in the master",
    sql: `SELECT COUNT(DISTINCT s.CustomerCode) AS value, CAST(SUM(${REV}) AS bigint) AS revenue_impact ${BASE} AND EXISTS (SELECT 1 FROM dbo.PB_Customer_Master c WHERE CAST(c.BillToParty AS varchar(20)) = s.CustomerCode AND ISNULL(c.Channel,'') = '')`,
    expect: (v) => v === 0 },
  { id: "A4", area: "Master", rule: "Every branch code in sales exists in Branch (MIS)",
    sql: `SELECT COUNT(DISTINCT s.BranchCode) AS value, STRING_AGG(CAST(s.BranchCode AS varchar(10)), ',') WITHIN GROUP (ORDER BY s.BranchCode) AS detail FROM (SELECT DISTINCT s.BranchCode ${BASE} AND NOT EXISTS (SELECT 1 FROM dbo.[Branch (MIS)] b WHERE b.[Branch Code] = s.BranchCode)) s`,
    expect: (v) => v === 0 },
  { id: "A5", area: "Master", rule: "Product_Code is unique in PB_Product_Master",
    sql: `SELECT COUNT(*) AS value FROM (SELECT Product_Code FROM dbo.PB_Product_Master GROUP BY Product_Code HAVING COUNT(*) > 1) d`,
    expect: (v) => v === 0 },
  { id: "A6", area: "Master", rule: "BillToParty is unique in PB_Customer_Master",
    sql: `SELECT COUNT(*) AS value FROM (SELECT BillToParty FROM dbo.PB_Customer_Master GROUP BY BillToParty HAVING COUNT(*) > 1) d`,
    expect: (v) => v === 0 },
  { id: "A7", area: "Master", rule: "Conversion factor of products SOLD IN GOLDEN SCOPE is numeric, > 0 and <= 100 (bad values: blanks, commas, text, dimensions)",
    sql: `SELECT COUNT(DISTINCT p.Product_Code) AS value, STRING_AGG(CAST(p.Product_Code + '=' + ISNULL(NULLIF(p.Equivalent_Qty_Factor,''),'<blank>') AS varchar(max)), ', ') AS detail
          FROM dbo.PB_Product_Master p WHERE EXISTS (SELECT 1 ${BASE} ${GOLDEN_FILTER} AND s.ProductCode = p.Product_Code)
          AND p.Equivalent_Qty_Factor IS NOT NULL AND (TRY_CAST(p.Equivalent_Qty_Factor AS decimal(18,4)) IS NULL OR TRY_CAST(p.Equivalent_Qty_Factor AS decimal(18,4)) <= 0 OR TRY_CAST(p.Equivalent_Qty_Factor AS decimal(18,4)) > 100)`,
    expect: (v) => v === 0 },
  { id: "A11", area: "Master", rule: "Conversion factor column hygiene across the whole product master (non-numeric values present)",
    sql: `SELECT COUNT(*) AS value, STRING_AGG(CAST(Equivalent_Qty_Factor + '(' + CAST(n AS varchar) + ')' AS varchar(max)), ', ') AS detail FROM (SELECT Equivalent_Qty_Factor, COUNT(*) AS n FROM dbo.PB_Product_Master WHERE Equivalent_Qty_Factor IS NOT NULL AND Equivalent_Qty_Factor <> '' AND TRY_CAST(Equivalent_Qty_Factor AS decimal(18,4)) IS NULL GROUP BY Equivalent_Qty_Factor) x`,
    expect: (v) => v === 0, severity: "warn" },
  { id: "A12", area: "Master", rule: "Customers missing from the master are only plant/depot codes on stock-transfer (ZGST) documents",
    sql: `SELECT COUNT(DISTINCT s.CustomerCode) AS value, STRING_AGG(CAST(s.CustomerCode AS varchar(20)), ',') AS detail FROM (SELECT DISTINCT s.CustomerCode ${BASE} AND s.InvoiceType NOT IN ('ZGST','ZS1') AND NOT EXISTS (SELECT 1 FROM dbo.PB_Customer_Master c WHERE CAST(c.BillToParty AS varchar(20)) = s.CustomerCode)) s`,
    expect: (v) => v === 0 },
  { id: "A8", area: "Master", rule: "Sold products with NULL Equivalent_Qty_Factor (silently treated as 1)",
    sql: `SELECT COUNT(DISTINCT s.ProductCode) AS value, CAST(SUM(s.SaleQuantity) AS bigint) AS qty_impact ${BASE} AND EXISTS (SELECT 1 FROM dbo.PB_Product_Master p WHERE p.Product_Code = s.ProductCode AND p.Equivalent_Qty_Factor IS NULL)`,
    expect: (v) => v === 0, severity: "warn" },
  { id: "A9", area: "Master", rule: "Sold products with Material_Type outside FINH/MSPR/SEMI/TRAD (golden data drops them)",
    sql: `SELECT COUNT(DISTINCT s.ProductCode) AS value, CAST(SUM(${REV}) AS bigint) AS revenue_impact ${BASE} ${GOLDEN_FILTER} AND EXISTS (SELECT 1 FROM dbo.PB_Product_Master p WHERE p.Product_Code = s.ProductCode AND p.Material_Type NOT IN ('FINH','MSPR','SEMI','TRAD'))`,
    expect: (v, r) => Math.abs(Number(r.revenue_impact || 0)) === 0, severity: "warn" },
  { id: "A10", area: "Master", rule: "Sold products have a Business_Segment (needed for segment pages)",
    sql: `SELECT COUNT(DISTINCT s.ProductCode) AS value, CAST(SUM(${REV}) AS bigint) AS revenue_impact ${BASE} ${GOLDEN_FILTER} AND EXISTS (SELECT 1 FROM dbo.PB_Product_Master p WHERE p.Product_Code = s.ProductCode AND ISNULL(p.Business_Segment,'') = '')`,
    expect: (v) => v === 0 },

  // ---------- B. Transaction integrity ----------
  { id: "B1", area: "Transactions", rule: "No duplicate invoice lines (SAPRefNo + ItemNumber unique)",
    sql: `SELECT COUNT(*) AS value, CAST(SUM(dup_rev) AS bigint) AS revenue_impact FROM (SELECT s.SAPRefNo, s.ItemNumber, SUM(${REV}) - MIN(${REV}) AS dup_rev ${BASE} GROUP BY s.SAPRefNo, s.ItemNumber HAVING COUNT(*) > 1) d`,
    expect: (v) => v === 0 },
  { id: "B2", area: "Transactions", rule: "No invoices dated in the future",
    sql: `SELECT COUNT(*) AS value FROM dbo.Sales_Transactions_Detail s WHERE s.BillingDate > CAST(GETDATE() AS date)`,
    expect: (v) => v === 0 },
  { id: "B3", area: "Transactions", rule: "Data is fresh: latest BillingDate is within 2 days of today",
    sql: `SELECT DATEDIFF(day, MAX(BillingDate), CAST(GETDATE() AS date)) AS value, CONVERT(varchar(10), MAX(BillingDate), 120) AS detail FROM dbo.Sales_Transactions_Detail`,
    expect: (v) => v <= 2 },
  { id: "B4", area: "Transactions", rule: "No missing days: every non-Sunday day in the window has invoice lines (days with < 300 lines listed)",
    sql: `SELECT (DATEDIFF(day, @from, @to) + 1) - COUNT(DISTINCT CASE WHEN DATENAME(weekday, BillingDate) <> 'Sunday' THEN BillingDate END) - (SELECT COUNT(*) FROM (SELECT TOP (DATEDIFF(day, @from, @to) + 1) DATEADD(day, ROW_NUMBER() OVER (ORDER BY (SELECT 1)) - 1, @from) AS d FROM sys.all_objects) c WHERE DATENAME(weekday, d) = 'Sunday') AS value,
                 (SELECT STRING_AGG(CONVERT(varchar(10), d, 120) + '(' + CAST(n AS varchar) + ')', ', ') FROM (SELECT BillingDate AS d, COUNT(*) AS n FROM dbo.Sales_Transactions_Detail WHERE BillingDate BETWEEN @from AND @to GROUP BY BillingDate HAVING COUNT(*) < 300 AND DATENAME(weekday, BillingDate) <> 'Sunday') low) AS detail
          FROM dbo.Sales_Transactions_Detail WHERE BillingDate BETWEEN @from AND @to`,
    expect: (v) => v <= 0, severity: "warn" },
  { id: "B5", area: "Transactions", rule: "Invoice/reference types seen in data are all covered by the golden rules (no unknown codes with revenue)",
    sql: `SELECT COUNT(*) AS value, STRING_AGG(code + ':' + CAST(rev AS varchar(30)), ', ') AS detail FROM (
            SELECT code, CAST(SUM(rev) AS bigint) AS rev FROM (
              SELECT s.InvoiceType AS code, ${REV} AS rev ${BASE}
              UNION ALL SELECT s.RefDocType, ${REV} ${BASE}) x
            WHERE code NOT IN ('','ZNOR','ZSRN','ZSCH','ZFOC','ZGST','ZCR3','ZCR1','ZDR1','ZRK','ZDR3','ZSAM','ZSRE','ZBEN','ZBPY')
            GROUP BY code) y`,
    expect: () => true, severity: "info" },
  { id: "B6", area: "Transactions", rule: "Rule codes that never occur in the data (dead rules): ZRK, ZDR3, ZSRN, ZFOC",
    sql: `SELECT COUNT(*) AS value, STRING_AGG(code, ', ') AS detail FROM (VALUES ('ZRK'),('ZDR3'),('ZSRN'),('ZFOC')) v(code)
          WHERE NOT EXISTS (SELECT 1 FROM dbo.Sales_Transactions_Detail s WHERE s.InvoiceType = v.code OR s.RefDocType = v.code)`,
    expect: () => true, severity: "info" },
  { id: "B7", area: "Transactions", rule: "Positive-quantity lines with zero or negative revenue on normal sales (free goods not flagged)",
    sql: `SELECT COUNT(*) AS value, CAST(SUM(s.SaleQuantity) AS bigint) AS qty_impact ${BASE} ${GOLDEN_FILTER} AND s.InvoiceType IN ('ZNOR','ZSCH','ZSPL') AND s.ItemCategory NOT IN ('TANN','RENN') AND s.SaleQuantity > 0 AND ${REV} <= 0`,
    expect: (v) => v === 0, severity: "warn" },
  { id: "B8", area: "Transactions", rule: "Returns/credits (ZRE, ZCRE, ZCR1, ZDRE...) carry negative values so they reduce revenue",
    sql: `SELECT COUNT(*) AS value, CAST(SUM(${REV}) AS bigint) AS revenue_impact ${BASE} AND s.InvoiceType IN ('ZRE','ZCRE','ZCR1','ZS1','ZS2') AND ${REV} > 0`,
    expect: (v) => v === 0, severity: "warn" },

  // ---------- C. Golden transformation impact (what the rules remove) ----------
  { id: "C1", area: "Golden rules", rule: "Revenue excluded by the ZGST/ZCR3/ZFOC filter (should be explainable: GST-only docs, credit notes)",
    sql: `SELECT CAST(SUM(r) AS bigint) AS value, STRING_AGG(t, ', ') AS detail FROM (
            SELECT s.InvoiceType + '=' + CAST(CAST(SUM(${REV}) AS bigint) AS varchar(30)) AS t, SUM(${REV}) AS r ${BASE} AND (s.InvoiceType IN ('ZFOC','ZGST','ZCR3') OR s.RefDocType IN ('ZFOC','ZGST','ZCR3')) GROUP BY s.InvoiceType) x`,
    expect: () => true, severity: "info" },
  { id: "C2", area: "Golden rules", rule: "Difference between BasicPrice and GrossSalesRevenue on DOM lines (golden uses BasicPrice)",
    sql: `SELECT CAST(SUM(s.BasicPrice - s.GrossSalesRevenue) AS bigint) AS value, CAST(SUM(s.BasicPrice) AS bigint) AS basic_total, CAST(SUM(s.GrossSalesRevenue) AS bigint) AS gross_total ${BASE} ${GOLDEN_FILTER} AND s.SalesOrg='DOM'`,
    expect: () => true, severity: "info" },
  { id: "C3", area: "Golden rules", rule: "Revenue zeroed by the sample/benefit rule (ZSAM/ZSRE/ZBEN/ZBPY)",
    sql: `SELECT CAST(SUM(${REV}) AS bigint) AS value, COUNT(*) AS lines_ ${BASE} ${GOLDEN_FILTER} AND (s.InvoiceType IN ('ZSAM','ZSRE','ZBEN','ZBPY') OR s.RefDocType IN ('ZSAM','ZSRE','ZBEN','ZBPY'))`,
    expect: () => true, severity: "info" },
  { id: "C4", area: "Golden rules", rule: "Quantity zeroed by the quantity rule (TANN/RENN, credit/debit, sample/benefit)",
    sql: `SELECT CAST(SUM(s.SaleQuantity) AS bigint) AS value, COUNT(*) AS lines_ ${BASE} ${GOLDEN_FILTER} AND (s.ItemCategory IN ('TANN','RENN') OR s.InvoiceType IN ('ZCR1','ZDR1','ZRK','ZDR3','ZSAM','ZSRE','ZBEN','ZBPY') OR s.RefDocType IN ('ZSAM','ZSRE','ZBEN','ZBPY','ZCR1','ZDR1','ZRK','ZDR3'))`,
    expect: () => true, severity: "info" },
  { id: "C5", area: "Golden rules", rule: "QTY_DISCOUNT total added to revenue (golden adds it back)",
    sql: `SELECT CAST(SUM(s.QTY_DISCOUNT) AS bigint) AS value ${BASE} ${GOLDEN_FILTER}`,
    expect: () => true, severity: "info" },
  { id: "C6", area: "Golden rules", rule: "NetValue (what SAP says was invoiced) vs golden Sales Revenue, as a sanity ratio",
    sql: `SELECT CAST(SUM(s.NetValue) AS bigint) AS value, CAST(SUM(CASE WHEN s.InvoiceType IN ('ZSAM','ZSRE','ZBEN','ZBPY') OR s.RefDocType IN ('ZSAM','ZSRE','ZBEN','ZBPY') THEN 0 ELSE ${REV} END) AS bigint) AS golden_revenue ${BASE} ${GOLDEN_FILTER}`,
    expect: () => true, severity: "info" },
];

const results = [];
for (const c of checks) {
  try {
    const r = await runReadOnly(c.sql, { params: { from, to }, maxRows: 5 });
    const row = r.rows[0] || {};
    const value = row.value == null ? 0 : Number(row.value);
    const pass = c.expect(value, row);
    const status = c.severity === "info" ? "INFO" : pass ? "PASS" : c.severity === "warn" ? "WARN" : "FAIL";
    const extras = Object.entries(row).filter(([k]) => k !== "value").map(([k, v]) => `${k}=${v}`).join("; ");
    results.push({ ...c, status, value, extras });
    console.log(`${status.padEnd(4)} ${c.id.padEnd(4)} ${c.rule}\n      value=${value}${extras ? "  " + extras.slice(0, 300) : ""}`);
  } catch (e) {
    results.push({ ...c, status: "ERROR", value: null, extras: e.message });
    console.log(`ERR  ${c.id.padEnd(4)} ${c.rule}\n      ${e.message}`);
  }
}

const md = [`# Data check report`, ``, `Window: ${from} to ${to}. Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}.`, ``,
  `| Status | ID | Area | Rule | Value | Detail |`, `|---|---|---|---|---:|---|`,
  ...results.map((r) => `| ${r.status} | ${r.id} | ${r.area} | ${r.rule} | ${r.value ?? ""} | ${(r.extras || "").replace(/\|/g, "/").slice(0, 400)} |`)].join("\n");
fs.writeFileSync(new URL("../docs/data-check-report.md", import.meta.url), md + "\n");
console.log(`\nSummary: ${results.filter(r => r.status === "PASS").length} pass, ${results.filter(r => r.status === "FAIL").length} fail, ${results.filter(r => r.status === "WARN").length} warn, ${results.filter(r => r.status === "INFO").length} info. Report: docs/data-check-report.md`);
process.exit();
