# Data check report

Window: 2026-04-01 to 2026-11-08. Generated 2026-11-14 03:23.

| Status | ID | Area | Rule | Value | Detail |
|---|---|---|---|---:|---|
| PASS | A1 | Master | Every product code on golden-scope sales exists in PB_Product_Master | 0 | revenue_impact=null |
| PASS | A2 | Master | Every customer code on golden-scope sales exists in PB_Customer_Master | 0 | revenue_impact=null |
| FAIL | A3 | Master | Every sold customer has a non-blank Channel in the master | 1 | revenue_impact=2467651 |
| PASS | A4 | Master | Every branch code in sales exists in Branch (MIS) | 0 | detail=null |
| PASS | A5 | Master | Product_Code is unique in PB_Product_Master | 0 |  |
| PASS | A6 | Master | BillToParty is unique in PB_Customer_Master | 0 |  |
| PASS | A7 | Master | Conversion factor of products SOLD IN GOLDEN SCOPE is numeric, > 0 and <= 100 (bad values: blanks, commas, text, dimensions) | 0 | detail=null |
| WARN | A11 | Master | Conversion factor column hygiene across the whole product master (non-numeric values present) | 75 | detail=42X26X45.6(1), 47X30X48(1), 58.2X39.5X45(1), 47X39.5X38(1), 63.5X43X38(1), 49.5X40X44.5(1), 53.5X39X46.5(1), 40X25X39.5(1), 42.5X38.5X40(1), 51.2X42.5X29.5(1), 58X43.5X41.5(1), 55X42.5X49(1), 55.5X42.5X41.5(1), 49.5X40X47.5(1), 00*500*250(1), 57.5X44X59.5(1), 55.5X42.5X60(2), 57.3X29X42(1), 55.5X42.5X45(1), 63.5X43X29(2), 58 X 39 X 38.5(1), 51.5X42X57(1), 48X48.2X24.5(1), 57.5X41.5X53.5(1), |
| PASS | A12 | Master | Customers missing from the master are only plant/depot codes on stock-transfer (ZGST) documents | 0 | detail=null |
| WARN | A8 | Master | Sold products with NULL Equivalent_Qty_Factor (silently treated as 1) | 1542 | qty_impact=16480027 |
| WARN | A9 | Master | Sold products with Material_Type outside FINH/MSPR/SEMI/TRAD (golden data drops them) | 2 | revenue_impact=5489 |
| FAIL | A10 | Master | Sold products have a Business_Segment (needed for segment pages) | 2 | revenue_impact=5489 |
| PASS | B1 | Transactions | No duplicate invoice lines (SAPRefNo + ItemNumber unique) | 0 | revenue_impact=null |
| PASS | B2 | Transactions | No invoices dated in the future | 0 |  |
| PASS | B3 | Transactions | Data is fresh: latest BillingDate is within 2 days of today | 0 | detail=2026-11-14 |
| PASS | B4 | Transactions | No missing days: every non-Sunday day in the window has invoice lines (days with < 300 lines listed) | 0 | detail=2026-10-02(238) |
| INFO | B5 | Transactions | Invoice/reference types seen in data are all covered by the golden rules (no unknown codes with revenue) | 16 | detail=ZCRE:-10024226, ZDRE:-44799115, ZDRN:-81029965, ZDRW:-7189458, ZEXP:716588654, ZINS:3254817991, ZINT:1108998527, ZOTR:-132052882, ZOTS:1289256469, ZRE:-689968614, ZREW:-14773955, ZS1:-646466558, ZS1E:-6191904, ZS2:6011622, ZSC1:71547437, ZSPL:3029151517 |
| INFO | B6 | Transactions | Rule codes that never occur in the data (dead rules): ZRK, ZDR3, ZSRN, ZFOC | 2 | detail=ZRK, ZDR3 |
| PASS | B7 | Transactions | Positive-quantity lines with zero or negative revenue on normal sales (free goods not flagged) | 0 | qty_impact=null |
| WARN | B8 | Transactions | Returns/credits (ZRE, ZCRE, ZCR1, ZDRE...) carry negative values so they reduce revenue | 246 | revenue_impact=6011622 |
| INFO | C1 | Golden rules | Revenue excluded by the ZGST/ZCR3/ZFOC filter (should be explainable: GST-only docs, credit notes) | 18561125783 | detail=ZCR3=-106286658, ZGST=18985039501, ZS1=-317627058 |
| INFO | C2 | Golden rules | Difference between BasicPrice and GrossSalesRevenue on DOM lines (golden uses BasicPrice) | 132002118 | basic_total=22981523745; gross_total=22849521626 |
| INFO | C3 | Golden rules | Revenue zeroed by the sample/benefit rule (ZSAM/ZSRE/ZBEN/ZBPY) | 8371139 | lines_=14191 |
| INFO | C4 | Golden rules | Quantity zeroed by the quantity rule (TANN/RENN, credit/debit, sample/benefit) | 719715 | lines_=49706 |
| INFO | C5 | Golden rules | QTY_DISCOUNT total added to revenue (golden adds it back) | -12527994 |  |
| INFO | C6 | Golden rules | NetValue (what SAP says was invoiced) vs golden Sales Revenue, as a sanity ratio | 25286673859 | golden_revenue=23315822985 |
