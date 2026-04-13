import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    // Contents 시트 찾기
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("content")) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    if (json.length < 2) {
      return NextResponse.json({ ok: false, error: "No data rows" }, { status: 400 });
    }

    // 컬럼 인덱스 찾기
    const headers = json[0].map((h: any) => String(h || "").trim());
    const typeIdx = headers.indexOf("Type");
    const dateIdx = headers.indexOf("Date");
    const inoutIdx = headers.indexOf("InOut Type");
    const orderTypeIdx = headers.indexOf("Order Type");
    const pcsIdx = headers.indexOf("PCS");
    const brandIdx = headers.indexOf("Model Group");
    const venderIdx = headers.indexOf("Vender");
    const addrIdx = headers.findIndex((h: string) => h.includes("Ship To Addr"));

    if (typeIdx < 0 || dateIdx < 0 || pcsIdx < 0) {
      return NextResponse.json({ ok: false, error: "Missing required columns: Type, Date, PCS" }, { status: 400 });
    }

    // ── 집계 ──
    const daily: Record<string, { IN: number; OUT: number }> = {};
    const byInout: Record<string, number> = {};
    const brands: Record<string, number> = {};
    const pivotRaw: Record<string, Record<string, number>> = {};
    const storeData: Record<string, Record<string, number>> = {};
    let totalRows = 0;

    for (let i = 1; i < json.length; i++) {
      const row = json[i];
      const type = String(row[typeIdx] || "").trim();
      const inout = inoutIdx >= 0 ? String(row[inoutIdx] || "").trim() : "";
      const date = String(row[dateIdx] || "").trim();
      const pcs = Number(row[pcsIdx]) || 0;

      // Type + InOut Type 빈칸 제외
      if (!type || !inout || !date) continue;
      totalRows++;

      const dShort = date.length > 5 ? date.slice(5) : date;

      // 일별 IN/OUT
      if (!daily[dShort]) daily[dShort] = { IN: 0, OUT: 0 };
      if (type === "IN") daily[dShort].IN += pcs;
      else if (type === "OUT") daily[dShort].OUT += pcs;

      // InOut Type별
      byInout[inout] = (byInout[inout] || 0) + pcs;

      // 브랜드별 (OUT만 = 판매)
      if (brandIdx >= 0 && type === "OUT") {
        const brand = String(row[brandIdx] || "").trim();
        if (brand) brands[brand] = (brands[brand] || 0) + pcs;
      }

      // 피벗
      const pivotKey = `${type}|${inout}`;
      if (!pivotRaw[pivotKey]) pivotRaw[pivotKey] = {};
      pivotRaw[pivotKey][dShort] = (pivotRaw[pivotKey][dShort] || 0) + pcs;

      // B2B 매장별 (B2C 제외)
      if (type === "OUT" && inout !== "B2C Interface") {
        const store = venderIdx >= 0 ? String(row[venderIdx] || "").trim() : "";
        if (store) {
          if (!storeData[store]) storeData[store] = {};
          storeData[store][dShort] = (storeData[store][dShort] || 0) + pcs;
        }
      }
    }

    // 정렬된 일별 데이터
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

    // 매장별 일별 데이터
    const storeDaily: Record<string, { date: string; pcs: number }[]> = {};
    for (const [store, dateMap] of Object.entries(storeData)) {
      storeDaily[store] = Object.entries(dateMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, pcs]) => ({ date, pcs }));
    }

    const dates = dailyArr.map(d => d.date);
    const totalIN = dailyArr.reduce((s, d) => s + d.IN, 0);
    const totalOUT = dailyArr.reduce((s, d) => s + d.OUT, 0);

    return NextResponse.json({
      ok: true,
      totalRows,
      dates,
      daily: dailyArr,
      inoutType: inoutArr,
      brands: brandArr,
      pivot: pivotRaw,
      stores: storeData,
      summary: { totalIN, totalOUT, days: dates.length },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
