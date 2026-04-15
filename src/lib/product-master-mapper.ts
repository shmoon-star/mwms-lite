import { toNum, toInt, toStr } from "./google-sheets";
import crypto from "crypto";

/**
 * 상품 Master 시트의 2D 배열을 객체 리스트로 변환
 * - Header: Row 6 (Excel 1-indexed) = rows[5] (0-indexed)
 * - Data: rows[6] 부터
 */
export function masterRowsToObjects(rows: any[][]): Record<string, any>[] {
  if (rows.length < 7) return [];

  const headers = (rows[5] || []).map((h: any) =>
    String(h || "").trim().replace(/\s+/g, " ")
  );

  return rows.slice(6).map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i] !== undefined ? row[i] : "";
    });
    return obj;
  });
}

/**
 * 상품 Master row → DB 스키마 매핑
 */
export function mapProductMasterRow(r: Record<string, any>, rowNumber: number) {
  // 여러 표기 가능성 대응 (공백, 줄바꿈 제거된 키)
  const brandName = toStr(r["브랜드명"]);
  const styleNumber = toStr(r["스타일넘버 * 컬러코드 제외"] || r["스타일넘버"]);
  const styleColorCode = toStr(
    r["스타일넘버 (컬러까지) * 컬러 단위까지 다르게 기입"] ||
    r["스타일넘버 (컬러까지)"] ||
    r["스타일넘버(컬러까지)"]
  );
  const size = toStr(r["사이즈 * 사이즈 별로 행 기입"] || r["사이즈"]);
  const logisticsStatus = toStr(r["물류 현황"]);
  const totalOrderQty = toInt(r["발주 수량"]);

  // UPSERT key: styleColorCode + size + rowNumber (유니크 보장)
  const keyInput = `${styleColorCode || ""}|${size || ""}|${brandName || ""}|${rowNumber}`;
  const rowKey = crypto.createHash("sha1").update(keyInput).digest("hex").slice(0, 32);

  return {
    row_key: rowKey,
    brand_name: brandName,
    style_number: styleNumber,
    style_color_code: styleColorCode,
    size,
    logistics_status: logisticsStatus,
    total_order_qty: totalOrderQty,
    raw_data: r,
    sheet_row_number: rowNumber,
    synced_at: new Date().toISOString(),
  };
}
