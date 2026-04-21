import * as XLSX from "xlsx";

export type HistoryDocRow = {
  doc_type: "PO" | "DN" | "SHIPMENT" | "GR";
  doc_no: string | null;
  doc_date: string | null;
  year_month: string | null;
  vendor_code: string | null;
  buyer_code: string | null;
  sku: string | null;
  description: string | null;
  qty: number;
  unit_price: number | null;
  amount: number | null;
  currency: string | null;
  bl_no: string | null;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  buyer_gr_date: string | null;
  invoice_no: string | null;
  vessel: string | null;
  container: string | null;
  remarks: string | null;
  business_unit: string | null;
  raw_data: any;
};

export type HistorySettlementRow = {
  year_month: string;
  buyer_code: string | null;
  forwarding_cost: number;
  processing_cost: number;
  other_cost: number;
  notes: string | null;
  dn_nos: string[];
  business_unit: string | null;
};

export type HistoryParseResult = {
  documents: HistoryDocRow[];
  settlements: HistorySettlementRow[];
  summary: {
    po_count: number;
    dn_count: number;
    shipment_count: number;
    gr_count: number;
    settlement_count: number;
  };
};

function excelDateToISO(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // M/D/YYYY or M-D-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, mo, dd, yy] = m;
    return `${yy}-${mo.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

function yearMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return dateStr.slice(0, 7);
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function readSheet(wb: XLSX.WorkBook, names: string[]): any[] {
  for (const n of names) {
    const sheet = wb.Sheets[n] || wb.Sheets[n.toLowerCase()] || wb.Sheets[n.toUpperCase()];
    if (sheet) return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }
  // Case-insensitive match
  const target = names[0].toLowerCase();
  const matchName = wb.SheetNames.find(n => n.toLowerCase() === target);
  if (matchName) return XLSX.utils.sheet_to_json(wb.Sheets[matchName], { defval: "" });
  return [];
}

export function parseHistoryExcel(
  buffer: Buffer,
  businessUnit: string | null = null
): HistoryParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const documents: HistoryDocRow[] = [];
  const settlements: HistorySettlementRow[] = [];

  // sku → vendor_code 매핑 (PO 시트에서 구축, DN/Shipment에서 lookup)
  // Shipment 원본에는 vendor_code가 없으므로 sku 기반으로 역추적해서 주입.
  // 같은 sku는 일반적으로 한 벤더에만 속하므로 첫 match만 사용.
  const skuToVendor = new Map<string, string>();

  // === PO 시트 ===
  const poRows = readSheet(wb, ["PO", "po"]);
  for (const r of poRows) {
    const date = excelDateToISO(r.po_date || r.date || r.PO_Date);
    const sku = str(r.sku || r.SKU);
    const vendor = str(r.vendor_code || r.Vendor_Code || r.vendor);
    if (sku && vendor && !skuToVendor.has(sku)) {
      skuToVendor.set(sku, vendor);
    }
    documents.push({
      doc_type: "PO",
      doc_no: str(r.po_no || r.PO_No),
      doc_date: date,
      year_month: yearMonth(date),
      vendor_code: vendor,
      buyer_code: null,
      sku,
      description: str(r.description || r.Description || r.desc),
      qty: num(r.qty || r.Qty || r.quantity),
      unit_price: num(r.unit_price || r.UnitPrice) || null,
      amount: num(r.amount || r.Amount) || null,
      currency: str(r.currency || r.Currency),
      bl_no: null, etd: null, eta: null, atd: null, ata: null,
      buyer_gr_date: null, invoice_no: null, vessel: null, container: null,
      remarks: str(r.remarks || r.Remarks),
      business_unit: businessUnit,
      raw_data: r,
    });
  }

  // === DN 시트 ===
  const dnRows = readSheet(wb, ["DN", "dn"]);
  for (const r of dnRows) {
    const date = excelDateToISO(r.dn_date || r.date || r.DN_Date);
    const sku = str(r.sku || r.SKU);
    documents.push({
      doc_type: "DN",
      doc_no: str(r.dn_no || r.DN_No),
      doc_date: date,
      year_month: yearMonth(date),
      vendor_code: sku ? skuToVendor.get(sku) || null : null,
      buyer_code: str(r.buyer_code || r.Buyer_Code || r.buyer || r.ship_to),
      sku,
      description: str(r.description || r.Description),
      qty: num(r.qty || r.Qty || r.quantity),
      unit_price: null,
      amount: null,
      currency: null,
      bl_no: null, etd: null, eta: null, atd: null, ata: null,
      buyer_gr_date: null, invoice_no: null, vessel: null, container: null,
      remarks: str(r.remarks || r.Remarks),
      business_unit: businessUnit,
      raw_data: r,
    });
  }

  // === Shipment 시트 ===
  // dn_no를 remarks에 저장 (안분 매칭용 키)
  const shipRows = readSheet(wb, ["Shipment", "shipment", "SHIPMENT"]);
  for (const r of shipRows) {
    const date = excelDateToISO(r.ship_date || r.date || r.Ship_Date);
    const shipDnNo = str(r.dn_no || r.DN_No || r.DN_NO);
    const sku = str(r.sku || r.SKU);
    documents.push({
      doc_type: "SHIPMENT",
      doc_no: str(r.shipment_no || r.Shipment_No),
      doc_date: date,
      year_month: yearMonth(date),
      // Shipment 시트엔 vendor_code가 없어서 sku → PO vendor 역추적으로 채움
      vendor_code: sku ? skuToVendor.get(sku) || null : null,
      buyer_code: str(r.buyer_code || r.Buyer_Code || r.buyer),
      sku,
      description: str(r.description || r.Description),
      qty: num(r.qty || r.Qty),
      unit_price: null, amount: null, currency: null,
      bl_no: str(r.bl_no || r.BL_No),
      etd: excelDateToISO(r.etd || r.ETD),
      eta: excelDateToISO(r.eta || r.ETA),
      atd: excelDateToISO(r.atd || r.ATD),
      ata: excelDateToISO(r.ata || r.ATA),
      buyer_gr_date: excelDateToISO(r.buyer_gr_date || r.Buyer_GR_Date),
      invoice_no: str(r.invoice_no || r.Invoice_No),
      vessel: str(r.vessel || r.Vessel),
      container: str(r.container || r.Container),
      remarks: shipDnNo || str(r.remarks || r.Remarks),  // dn_no를 remarks에 저장 (안분 매칭용)
      business_unit: businessUnit,
      raw_data: r,
    });
  }

  // === GR 시트 ===
  const grRows = readSheet(wb, ["GR", "gr"]);
  for (const r of grRows) {
    const date = excelDateToISO(r.gr_date || r.date || r.GR_Date);
    documents.push({
      doc_type: "GR",
      doc_no: str(r.gr_no || r.GR_No),
      doc_date: date,
      year_month: yearMonth(date),
      vendor_code: str(r.vendor_code || r.Vendor_Code),
      buyer_code: null,
      sku: str(r.sku || r.SKU),
      description: str(r.description || r.Description),
      qty: num(r.qty || r.Qty),
      unit_price: null, amount: null, currency: null,
      bl_no: null, etd: null, eta: null, atd: null, ata: null,
      buyer_gr_date: null, invoice_no: null, vessel: null, container: null,
      remarks: str(r.remarks || r.Remarks),
      business_unit: businessUnit,
      raw_data: r,
    });
  }

  // === Settlement 시트 ===
  // 그룹핑 로직: 비용이 있는 row = 새 그룹 시작, 이후 DN_NO만 있는 row = 그룹에 추가
  const stRows = readSheet(wb, ["Settlement", "settlement", "SETTLEMENT"]);
  let currentGroup: HistorySettlementRow | null = null;
  for (const r of stRows) {
    const ym = str(r.year_month || r.Year_Month || r.yearmonth || r.YM);
    if (!ym) continue;

    const forwarding = num(r.forwarding_cost || r.Forwarding_Cost || r.forwarding);
    const processing = num(r.processing_cost || r.Processing_Cost || r.processing);
    const other = num(r.other_cost || r.Other_Cost || r.other);
    const hasCost = forwarding > 0 || processing > 0 || other > 0;
    const dnNo = str(r.DN_NO || r.dn_no || r.DN_No || r.dnno);

    if (hasCost) {
      // 이전 그룹 저장
      if (currentGroup) settlements.push(currentGroup);
      // 새 그룹 시작
      currentGroup = {
        year_month: ym,
        buyer_code: str(r.buyer_code || r.Buyer_Code || r.buyer),
        forwarding_cost: forwarding,
        processing_cost: processing,
        other_cost: other,
        notes: str(r.notes || r.Notes),
        dn_nos: dnNo ? [dnNo] : [],
        business_unit: businessUnit,
      };
    } else if (currentGroup && dnNo) {
      // 기존 그룹에 DN_NO 추가
      currentGroup.dn_nos.push(dnNo);
    }
  }
  if (currentGroup) settlements.push(currentGroup);

  return {
    documents,
    settlements,
    summary: {
      po_count: documents.filter(d => d.doc_type === "PO").length,
      dn_count: documents.filter(d => d.doc_type === "DN").length,
      shipment_count: documents.filter(d => d.doc_type === "SHIPMENT").length,
      gr_count: documents.filter(d => d.doc_type === "GR").length,
      settlement_count: settlements.length,
    },
  };
}
