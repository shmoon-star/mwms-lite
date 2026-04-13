import * as XLSX from "xlsx";

export type WmsParseResult = {
  totalRows: number;
  dates: string[];
  daily: { date: string; IN: number; OUT: number }[];
  inoutType: { name: string; value: number }[];
  brands: { name: string; value: number }[];
  pivot: Record<string, Record<string, number>>;
  stores: Record<string, Record<string, number>>;
  models: Record<string, Record<string, number>>; // date → { modelName: qty }
  summary: { totalIN: number; totalOUT: number; days: number };
};

/** Excel 시리얼 번호 → YYYY-MM-DD 변환 */
function excelDateToString(v: any): string {
  if (!v) return "";
  const s = String(v).trim();
  // 이미 YYYY-MM-DD 형식이면 그대로
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Excel 시리얼 번호 (숫자)
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return s;
}

/**
 * Excel 버퍼를 파싱하여 WMS 분석 데이터 반환
 * Contents 시트에서 Type, InOut Type, Date, PCS 컬럼 기준으로 집계
 */
export function parseWmsExcel(buffer: Buffer): WmsParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("content")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  if (json.length < 2) {
    throw new Error("No data rows");
  }

  const headers = json[0].map((h: any) => String(h || "").trim());
  const typeIdx = headers.indexOf("Type");
  const dateIdx = headers.indexOf("Date");
  const inoutIdx = headers.indexOf("InOut Type");
  const pcsIdx = headers.indexOf("PCS");
  const brandIdx = headers.indexOf("Model Group");
  const venderIdx = headers.indexOf("Vender");
  const modelNameIdx = headers.indexOf("Model Name");

  if (typeIdx < 0 || dateIdx < 0 || pcsIdx < 0) {
    throw new Error("Missing required columns: Type, Date, PCS");
  }

  const daily: Record<string, { IN: number; OUT: number }> = {};
  const byInout: Record<string, number> = {};
  const brands: Record<string, number> = {};
  const pivotRaw: Record<string, Record<string, number>> = {};
  const storeData: Record<string, Record<string, number>> = {};
  const modelData: Record<string, Record<string, number>> = {}; // date → { modelName: qty } (IN only)
  let totalRows = 0;

  for (let i = 1; i < json.length; i++) {
    const row = json[i];
    const type = String(row[typeIdx] || "").trim();
    const inout = inoutIdx >= 0 ? String(row[inoutIdx] || "").trim() : "";
    const rawDate = row[dateIdx];
    const date = excelDateToString(rawDate);
    const pcs = Number(row[pcsIdx]) || 0;

    if (!type || !inout || !date) continue;
    totalRows++;

    const dShort = date.length > 5 ? date.slice(5) : date;

    if (!daily[dShort]) daily[dShort] = { IN: 0, OUT: 0 };
    if (type === "IN") daily[dShort].IN += pcs;
    else if (type === "OUT") daily[dShort].OUT += pcs;

    byInout[inout] = (byInout[inout] || 0) + pcs;

    if (brandIdx >= 0 && type === "OUT") {
      const brand = String(row[brandIdx] || "").trim();
      if (brand) brands[brand] = (brands[brand] || 0) + pcs;
    }

    const pivotKey = `${type}|${inout}`;
    if (!pivotRaw[pivotKey]) pivotRaw[pivotKey] = {};
    pivotRaw[pivotKey][dShort] = (pivotRaw[pivotKey][dShort] || 0) + pcs;

    // IN일 때 Model Name별 수집
    if (type === "IN" && modelNameIdx >= 0) {
      const modelName = String(row[modelNameIdx] || "").trim();
      if (modelName) {
        if (!modelData[dShort]) modelData[dShort] = {};
        modelData[dShort][modelName] = (modelData[dShort][modelName] || 0) + pcs;
      }
    }

    if (type === "OUT" && inout !== "B2C Interface") {
      const store = venderIdx >= 0 ? String(row[venderIdx] || "").trim() : "";
      if (store) {
        if (!storeData[store]) storeData[store] = {};
        storeData[store][dShort] = (storeData[store][dShort] || 0) + pcs;
      }
    }
  }

  const dailyArr = Object.entries(daily)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  const inoutArr = Object.entries(byInout)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const brandArr = Object.entries(brands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 15) + "..." : name, value }));

  const dates = dailyArr.map(d => d.date);
  const totalIN = dailyArr.reduce((s, d) => s + d.IN, 0);
  const totalOUT = dailyArr.reduce((s, d) => s + d.OUT, 0);

  return {
    totalRows,
    dates,
    daily: dailyArr,
    inoutType: inoutArr,
    brands: brandArr,
    pivot: pivotRaw,
    stores: storeData,
    models: modelData,
    summary: { totalIN, totalOUT, days: dates.length },
  };
}
