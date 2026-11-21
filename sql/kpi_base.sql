-- Confirmed base for all sales KPIs (reconciled against the Power BI "Sales Dashboards" screenshots,
-- FY2027 to 08-Nov-2026). Use this CTE and aggregate on top of it.
-- Parameters: @from_date, @to_date (inclusive, BillingDate).
WITH kpi_base AS (
  SELECT
    s.BillingDate, s.SAPRefNo, s.ItemNumber, s.InvoiceType, s.RefDocType, s.SalesOrg,
    s.CustomerCode, s.ProductCode, s.BranchCode, s.State, s.ItemCategory,
    c.Channel, c.RegionDesc AS customer_region,
    b.Region AS branch_region, b.[Branch Name] AS branch_name, b.BranchType AS branch_type,
    p.Business_Segment, p.Business_Segment_Spares_Adj, p.Product_Category, p.Product_Subcategory,
    p.ProductSubcategory_Level2, p.Product_Hierarchy, p.Product_Description_With_Code, p.Division,
    ISNULL(TRY_CAST(p.Equivalent_Qty_Factor AS decimal(18,4)), 1) AS eqf,
    -- quantity rules
    CASE WHEN s.ItemCategory IN ('TANN','RENN')
           OR s.InvoiceType IN ('ZCR1','ZDR1','ZRK','ZDR3','ZSAM','ZSRE','ZBEN','ZBPY')
           OR s.RefDocType  IN ('ZSAM','ZSRE','ZBEN','ZBPY','ZCR1','ZDR1','ZRK','ZDR3')
         THEN 0 ELSE s.SaleQuantity END AS sales_qty_wo_conv,
    CASE WHEN s.ItemCategory IN ('TANN','RENN')
           OR s.InvoiceType IN ('ZSAM','ZSRE','ZBEN','ZBPY')
           OR s.RefDocType  IN ('ZSAM','ZSRE','ZBEN','ZBPY')
         THEN s.SaleQuantity ELSE 0 END AS free_qty_wo_conv,
    -- revenue rule (CONFIRMED: DOM uses BasicPrice; plus QTY_DISCOUNT; zero for samples/benefits)
    CASE WHEN s.InvoiceType IN ('ZSAM','ZSRE','ZBEN','ZBPY') OR s.RefDocType IN ('ZSAM','ZSRE','ZBEN','ZBPY')
         THEN 0
         ELSE (CASE WHEN s.SalesOrg = 'DOM' THEN s.BasicPrice ELSE s.GrossSalesRevenue END) + s.QTY_DISCOUNT
    END AS sales_revenue,
    CASE WHEN s.RefDocType IN ('ZNOR','ZSRN','ZSCH') THEN 'Normal' ELSE 'Special' END AS type_of_sale
  FROM dbo.Sales_Transactions_Detail s
  LEFT JOIN dbo.PB_Product_Master  p ON p.Product_Code = s.ProductCode
  LEFT JOIN dbo.PB_Customer_Master c ON CAST(c.BillToParty AS varchar(20)) = s.CustomerCode
  LEFT JOIN dbo.[Branch (MIS)]     b ON b.[Branch Code] = s.BranchCode
  WHERE s.BillingDate >= @from_date AND s.BillingDate <= @to_date
    AND s.InvoiceType NOT IN ('ZFOC','ZGST','ZCR3')
    AND s.RefDocType  NOT IN ('ZFOC','ZGST','ZCR3')
)
-- Example: totals
SELECT
  SUM(sales_revenue)                 AS sales_revenue,
  SUM(sales_qty_wo_conv * eqf)       AS sales_quantity,
  SUM(sales_qty_wo_conv)             AS sales_qty_wo_conversion,
  SUM(free_qty_wo_conv * eqf)        AS free_quantity
FROM kpi_base;
