# Builds docs/Raw-to-Golden-Gap-Report.pdf  (run: uv run --with reportlab python scripts/build-gap-pdf.py)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

OUT = "docs/Raw-to-Golden-Gap-Report.pdf"
ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=16, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor("#1f3b4d"))
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=12.5, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#1f3b4d"))
P  = ParagraphStyle("P", parent=ss["Normal"], fontSize=9.5, leading=13, spaceAfter=5)
S  = ParagraphStyle("S", parent=P, fontSize=8, leading=10.5, spaceAfter=0)
SB = ParagraphStyle("SB", parent=S, fontName="Helvetica-Bold")
B  = ParagraphStyle("B", parent=P, leftIndent=12, bulletIndent=2)
TEAL = colors.HexColor("#1f6f78"); LIGHT = colors.HexColor("#eef4f5"); GREY = colors.HexColor("#c9d3d6")

def p(t, st=P): return Paragraph(t, st)
def s(t): return Paragraph(t, S)
def table(header, rows, widths, zebra=True):
    data = [[Paragraph(h, SB) for h in header]] + [[s(c) if isinstance(c, str) else c for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [("BACKGROUND", (0,0), (-1,0), LIGHT), ("LINEBELOW", (0,0), (-1,0), 0.8, TEAL),
             ("GRID", (0,0), (-1,-1), 0.3, GREY), ("VALIGN", (0,0), (-1,-1), "TOP"),
             ("LEFTPADDING", (0,0), (-1,-1), 4), ("RIGHTPADDING", (0,0), (-1,-1), 4), ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3)]
    if zebra:
        for i in range(2, len(data), 2): style.append(("BACKGROUND", (0,i), (-1,i), colors.HexColor("#f7f9fa")))
    t.setStyle(TableStyle(style)); return t
def bullets(items): return [Paragraph(i, B, bulletText="•") for i in items]

story = []
story += [p("Raw Data to Golden Data: Gap Analysis and Data-Correctness Checklist", ParagraphStyle("T", parent=ss["Title"], fontSize=20, textColor=TEAL, alignment=0, spaceAfter=4)),
          p("Sales dashboards (Power BI) vs. the Bi_Data SQL Server tables. Prepared 14 November 2026. Figures cover FY2027, 1 April 2026 to 8 November 2026, the same window as the dashboard screenshots.", ParagraphStyle("sub", parent=P, textColor=colors.HexColor("#555555")))]

story += [p("1. Summary", H1), *bullets([
  "<b>Raw data</b> is the SQL table <i>Sales_Transactions_Detail</i>: every SAP billing line, 3.1 million lines this financial year. <b>Golden data</b> is what Power BI holds after eleven cleaning and calculation steps. We have no access to the golden data; every step was reverse-engineered from the hand-over notes and then proven by rebuilding the dashboard figures from raw.",
  "<b>Proof:</b> Sales Quantity rebuilt from raw equals the dashboard to the unit (23,179,854 vs 23,179,855) for every branch and segment and 13 of 16 channels. Revenue matches to 99.9% (23,316 M vs 23,296 M), with every channel difference explained.",
  "<b>Main finding:</b> ten of the eleven steps are justified. One step, excluding <b>ZCR3 credit notes</b>, cannot be vouched for without the business: it leaves 106 M of revenue and 330,839 units un-deducted (0.46% and 1.4% of the year so far).",
  "<b>Data health:</b> 26 automated rules were run on the raw data. 12 pass, 2 fail (small), 4 warn, 8 are informational. No duplicate lines, no future dates, no missing days, refreshed daily.",
  "<b>Biggest hidden risk:</b> the quantity conversion factor in the product master is free text in SAP (values such as '50,000', 'M', blanks and box dimensions). It is clean for the products sold today, but a new product with a bad value would silently distort quantity KPIs."])]

story += [p("2. Why the raw table is called raw: the eleven golden steps", H1),
          p("Each step the Power BI model applies, how big it is, and whether it is justified.")]
rows = [
 ["T1a", "Drop ZGST documents", "Stock transfers between plants and depots. The 'customer' is a plant code (TND1, APD1, WBW1), not a customer. 563,695 lines.", "18.99 bn 'revenue', 52.3 M units", "<b>Correct.</b> Internal movement, not a sale."],
 ["T1b", "Drop ZCR3 documents", "Credit notes against normal invoices, one unit at full price per line, with a scheme or claim reference. 322,676 lines, 14,893 documents.", "-106 M revenue, -330,839 units", "<b>Needs business confirmation.</b> If these are genuine returns or claims, golden sales are overstated. Ordinary returns (ZRE) are deducted; these are not."],
 ["T1c", "Drop ZFOC documents", "Never occurs in the data.", "0", "Dead rule, harmless."],
 ["T2", "Domestic revenue = BasicPrice", "For SalesOrg DOM the revenue field is BasicPrice, not GrossSalesRevenue.", "BasicPrice exceeds Gross by 132 M (0.58%)", "<b>Plausible but undocumented.</b> Ask which pricing conditions sit between the two."],
 ["T3", "Add QTY_DISCOUNT", "Quantity discounts (negative) are added to revenue.", "-12.5 M", "Plausible: revenue is net of quantity discount."],
 ["T4", "Zero revenue for ZSAM / ZSRE / ZBEN / ZBPY", "Samples, benefits and buy-backs keep their lines but no revenue.", "8.4 M on 14,191 lines", "<b>Correct.</b>"],
 ["T5", "Sales quantity = 0 for free items", "Item categories TANN/RENN and credit, debit and sample types are counted as Free Quantity instead.", "719,715 units on 49,706 lines", "<b>Correct.</b>"],
 ["T6", "Multiply by Equivalent_Qty_Factor", "Converts sets and packs to equivalent units using the product master. NULL factor is treated as 1 (1,542 sold products, 16.5 M units).", "Raw 21.43 M units becomes 23.18 M golden units", "<b>Works today, fragile.</b> The column is free text in SAP. None of the dirty values are on sold products now; a new product could break it silently."],
 ["T7", "Type of Sale", "Normal when reference type is ZNOR, ZSRN or ZSCH, otherwise Special.", "Classification only", "OK. ZSRN never occurs."],
 ["T8", "Product master filter", "Keep Material_Type FINH, MSPR, SEMI, TRAD; drop tools, capital items, raw material, packaging. Spares hierarchy re-coded.", "2 products, 5,489 revenue in scope", "<b>Correct</b> and immaterial."],
 ["T9", "Channel, region and branch from masters", "Channel and region from PB_Customer_Master by bill-to code; branch from Branch (MIS). The customer master is a snapshot with no history.", "AD and ARD revenue differ 0.2%; Exports 2.47 M (one customer with blank channel)", "Explains the remaining revenue gap. Reclassifying a customer re-states its history."],
 ["T10", "History before April 2022 from a CSV", "Appended in Power BI from a OneDrive file; not in SQL.", "n/a", "Multi-year charts beyond FY23 cannot be rebuilt from SQL."],
 ["T11", "Targets and budgets from Excel", "SQL holds six candidate target or budget tables; which one is live is unknown.", "n/a", "<b>Open.</b> Must be confirmed before Target KPIs are rebuilt."],
]
story.append(table(["#", "Golden step", "What it does", "Size this FY", "Verdict"], rows, [10*mm, 30*mm, 60*mm, 32*mm, 48*mm]))

story += [p("3. What the golden data does not check (risks found in raw)", H1), *bullets([
  "Equivalent_Qty_Factor is free text: 42,069 products blank, 33,607 NULL, 532 with '50000', plus commas, letters and dimensions. Only finished goods (FINH) are reasonably clean: 7 NULL and 9 blank out of 6,663.",
  "Customer channel is overwritten in place, so prior-year channel figures move when a customer is reclassified.",
  "One active customer in scope has a blank channel (2.47 M revenue). Power BI appears to map it to Exports.",
  "Two sold products have no Business_Segment (5,489 revenue), so they fall outside the segment pages.",
  "ZS2 debit memos carry positive values on 246 lines (6.0 M). Confirm they should add to revenue.",
  "Good news: no duplicate invoice lines, no future-dated invoices, no missing days this year, and the latest invoice is today's."])]

story += [p("4. Checklist: how to tell whether the golden data is right", H1),
          p("Rules A and B must pass before any chart is trusted. Rules C are reported for a person to judge at each refresh. Rules D are the manual reconciliation. The automated rules run with one command: <font face='Courier'>node scripts/data-checks.js [from] [to]</font>, which writes docs/data-check-report.md.")]
checks = [
 ["A1","Master","Every product on a golden-scope sales line exists in the product master","PASS"],
 ["A2","Master","Every customer on a golden-scope sales line exists in the customer master","PASS"],
 ["A3","Master","Every such customer has a non-blank Channel","FAIL: 1 customer, 2.47 M"],
 ["A4","Master","Every branch code exists in Branch (MIS)","PASS"],
 ["A5","Master","Product_Code is unique in the product master","PASS"],
 ["A6","Master","BillToParty is unique in the customer master","PASS"],
 ["A7","Master","Conversion factor of every sold product is numeric, above 0 and at most 100","PASS"],
 ["A8","Master","Sold products with NULL factor (treated as 1) are reviewed, not silently accepted","WARN: 1,542 products"],
 ["A9","Master","Sold products have a valid Material_Type","WARN: 2 products, 5,489"],
 ["A10","Master","Sold products have a Business_Segment","FAIL: 2 products, 5,489"],
 ["A11","Master","Factor column hygiene across the whole master (non-numeric values present)","WARN"],
 ["A12","Master","Customers missing from the master occur only on stock-transfer documents","PASS"],
 ["B1","Transactions","No duplicate invoice line (SAPRefNo + ItemNumber)","PASS"],
 ["B2","Transactions","No future-dated invoices","PASS"],
 ["B3","Transactions","Latest invoice date within 2 days of today","PASS"],
 ["B4","Transactions","Every non-Sunday day has invoice lines; low-volume days listed","PASS (2 Oct low: holiday)"],
 ["B5","Transactions","Every invoice or reference type in the data is covered by a rule; unknown codes listed with revenue","INFO: 16 codes listed"],
 ["B6","Transactions","Rule codes that never occur (dead rules) are listed","INFO: ZRK, ZDR3"],
 ["B7","Transactions","No positive-quantity normal sale with zero or negative revenue","PASS"],
 ["B8","Transactions","Credit and return types carry negative values","WARN: ZS2 positive, 6.0 M"],
 ["C1","Golden impact","Revenue removed by the ZGST / ZCR3 / ZFOC filter, by type","INFO"],
 ["C2","Golden impact","BasicPrice vs GrossSalesRevenue difference on domestic lines","INFO: 132 M"],
 ["C3","Golden impact","Revenue zeroed by the sample and benefit rule","INFO: 8.4 M"],
 ["C4","Golden impact","Quantity moved to free quantity","INFO: 719,715"],
 ["C5","Golden impact","QTY_DISCOUNT added back","INFO: -12.5 M"],
 ["C6","Golden impact","SAP NetValue vs golden revenue (golden must be below NetValue, which includes tax)","INFO: 25.29 bn vs 23.32 bn"],
 ["D1","Reconciliation","Sales Quantity total and by channel, branch and segment equals Power BI to the unit","Done: matches"],
 ["D2","Reconciliation","Revenue total within 0.1% of Power BI and every channel difference explained","Done: 99.9%"],
 ["D3","Reconciliation","Previous-year figures with the same rules match the PY cards","Not yet"],
 ["D4","Reconciliation","Target figures match once the target source is confirmed","Not yet"],
]
story.append(table(["ID", "Group", "Rule", "Result on FY2027 to 8 Nov 2026"], checks, [12*mm, 24*mm, 100*mm, 44*mm]))

story += [p("5. Questions that close the gap", H1), p("For the Power BI and SAP teams. Question 1 is the only one that could change the dashboard's numbers."),
  *[Paragraph(q, B, bulletText=f"{i}.") for i, q in enumerate([
  "Are ZCR3 credit notes returns or claims? Should they reduce sales? (0.46% of revenue and 1.4% of units at stake.)",
  "Which pricing conditions sit between BasicPrice and GrossSalesRevenue, and why is BasicPrice the reported domestic revenue?",
  "Which target table is live, and how are targets allocated to branch, channel and segment?",
  "Is customer channel history preserved anywhere, or are prior-year channel figures expected to move when a customer is reclassified?",
  "Can SAP enforce a numeric Equivalent_Qty_Factor for finished goods?",
  "Why does the Revenue page YTD card (22,941 M) differ from the Channel page total (23,296 M)?"], 1)]]

story += [p("6. Sources", H2), *bullets([
  "Power BI Dashboard Details (AI POC) hand-over notes: data sources, transformations and KPI list.",
  "Sales Dashboards PDF: eight dashboard pages used as the reference figures.",
  "Bi_Data database, read-only login, queried on 14 November 2026. Formulas in sql/kpi_base.sql; reconciliation detail in docs/reconciliation.md; check script scripts/data-checks.js."])]

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(colors.HexColor("#777777"))
    canvas.drawString(15*mm, 10*mm, "Raw to Golden gap analysis, Bi_Data sales, 14 Nov 2026"); canvas.drawRightString(A4[0]-15*mm, 10*mm, f"Page {doc.page}"); canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=16*mm,
                        title="Raw to Golden Data Gap Analysis", author="TTK Prestige AI team")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
