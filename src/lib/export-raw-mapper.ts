import { excelDateToISO, toNum, toInt, toStr } from "./google-sheets";
import crypto from "crypto";

/**
 * 헤더 키의 whitespace(공백/개행/탭 시퀀스)를 단일 공백으로 정규화.
 * 오프라인 xlsx export는 wrap된 셀 헤더에 "\r\n"이 섞여 들어오는 경우가 있어
 * Google Sheet API로 받는 깔끔한 헤더와 mismatch되는 문제를 방지.
 */
export function normalizeHeaderKeys(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/\s+/g, " ").trim()] = v;
  }
  return out;
}

/**
 * 수출내역_Raw 시트의 한 row를 DB 스키마로 매핑
 */
export function mapExportRow(rawR: Record<string, any>, rowNumber: number) {
  const r = normalizeHeaderKeys(rawR);
  const invoiceNo = toStr(r["인보이스 번호"]);
  const blNo = toStr(r["BL 번호"]);
  const skuCode = toStr(r["Style-Color-Size Code"]);

  // UPSERT key: invoice + bl + sku 조합 해시
  // (이전에는 rowNumber까지 포함했는데, Google Sheet에서 같은 SKU의 row 번호가
  //  바뀔 때마다 새 row로 누적 저장되어 중복이 쌓이는 문제가 있었음. 2026-04-21 수정)
  const keyInput = `${invoiceNo || ""}|${blNo || ""}|${skuCode || ""}`;
  const rowKey = crypto.createHash("sha1").update(keyInput).digest("hex").slice(0, 32);

  return {
    row_key: rowKey,
    order_season: toStr(r["오더시즌"]),
    shipment_status: toStr(r["Shipment Status"]),
    export_batch: toStr(r["수출 차수"]),
    customs_declaration_no: toStr(r["수출신고 필증 번호"]),
    invoice_no: invoiceNo,
    bl_no: blNo,

    brand_name: toStr(r["Brand Name"]),
    style_color_code: toStr(r["Style-Color Code"]),
    style_color_size_code: skuCode,
    description_en: toStr(r["Description (EN)"]),
    description_kr: toStr(r["Description (한글)"]),
    hs_code: toStr(r["HS CODE"]),
    knit_woven: toStr(r["Knit/Woven 구분"]),
    country_of_origin: toStr(r["Country of Origin"]),
    fabric_en: toStr(r["GB 혼용률 (영문)"]),
    fabric_cn: toStr(r["GB-혼용률, 소재 (중문)"]),

    unit_price: toNum(r["Unit Price"]),
    qty_ordered: toInt(r["Q'ty (pcs)"]),
    qty_shipped: toInt(r["실 선적 수량"]),
    invoice_amount: toNum(r["인보이스 금액"]),
    total_qty_fixed: toInt(r["총 발주 수량 (고정)"]),
    total_shipped_fixed: toInt(r["총 선적 수량 (고정)"]),

    cn_customs_benefit: toNum(r["중국 관세 혜택 (수식)"]),
    total_qty_calc: toInt(r["Total 수량 (수식용)"]),
    total_shipped_ratio: toNum(r["Total 선적완료 비율(수식용)"]),

    eta_warehouse: excelDateToISO(r["입고 예정일"]),
    shipment_date: excelDateToISO(r["선적 일자"]),
    out_month: toStr(r["출고월"]),
    container_type: toStr(r["컨테이너 타입"]),
    dc_inbound_date: excelDateToISO(r["DC 입고일"]),
    dc_outbound_date: excelDateToISO(r["DC 출고일"]),
    atd_port: excelDateToISO(r["ATD Port"]),
    ata_port: excelDateToISO(r["ATA Port"]),
    cn_customs_clearance_date: excelDateToISO(r["CN_Customs clearance completion date"]),
    ata_warehouse: excelDateToISO(r["ATA Warehouse"]),
    eta_date: excelDateToISO(r["ETA"]),

    lt_dc_out_to_cn_in: toInt(r["Total lead time (수식) DC 출고 ~ CN 입고"]),
    lt_dc_in_to_cn_in: toInt(r["Total lead time (수식) DC 입고 ~ CN 입고"]),
    lt_dc_in_to_dc_out: toInt(r["DC 입고 ~ DC 출고 일자"]),
    lt_dc_out_to_shipment: toInt(r["DC 출고 ~ 선적일자"]),
    lt_arrival_to_cn_warehouse: toInt(r["도착 ~ 중국 입고일자"]),
    avg_total_lt: toNum(r["평균 총 LT"]),

    raw_data: r,
    sheet_row_number: rowNumber,
    synced_at: new Date().toISOString(),
  };
}
