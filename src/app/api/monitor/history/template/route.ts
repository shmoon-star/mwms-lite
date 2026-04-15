import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/monitor/history/template
 *
 * 빈 양식 Excel 다운로드 (5개 시트 + 헤더 + 샘플 1행)
 */
export async function GET() {
  const wb = XLSX.utils.book_new();

  // === PO 시트 ===
  const poData = [
    {
      po_no: "PO-2025-06-001",
      po_date: "2025-06-01",
      vendor_code: "VND-001",
      sku: "SKU001",
      description: "Basic Tee",
      qty: 100,
      unit_price: 15000,
      amount: 1500000,
      currency: "KRW",
      remarks: "",
    },
  ];
  const wsPO = XLSX.utils.json_to_sheet(poData);
  XLSX.utils.book_append_sheet(wb, wsPO, "PO");

  // === DN 시트 ===
  const dnData = [
    {
      dn_no: "DN-2025-06-001",
      dn_date: "2025-06-15",
      buyer_code: "MUSINSA-JP",
      sku: "SKU001",
      description: "Basic Tee",
      qty: 50,
      remarks: "",
    },
  ];
  const wsDN = XLSX.utils.json_to_sheet(dnData);
  XLSX.utils.book_append_sheet(wb, wsDN, "DN");

  // === Shipment 시트 ===
  const shipData = [
    {
      shipment_no: "SH-2025-06-001",
      ship_date: "2025-06-20",
      dn_no: "DN-2025-06-001",
      bl_no: "BL-123456",
      etd: "2025-06-22",
      eta: "2025-06-28",
      atd: "2025-06-22",
      ata: "2025-06-30",
      buyer_gr_date: "2025-07-02",
      invoice_no: "INV-001",
      vessel: "EVER GIVEN",
      container: "TCLU1234567",
      buyer_code: "MUSINSA-JP",
      sku: "SKU001",
      description: "Basic Tee",
      qty: 50,
      remarks: "",
    },
    {
      shipment_no: "SH-2025-06-002",
      ship_date: "2025-06-21",
      dn_no: "DN-2025-06-002",
      bl_no: "BL-123457",
      etd: "2025-06-23",
      eta: "2025-06-29",
      atd: "2025-06-23",
      ata: "2025-07-01",
      buyer_gr_date: "2025-07-03",
      invoice_no: "INV-002",
      vessel: "EVER GIVEN",
      container: "TCLU1234568",
      buyer_code: "MUSINSA-JP",
      sku: "SKU002",
      description: "Denim Pants",
      qty: 30,
      remarks: "",
    },
  ];
  const wsShip = XLSX.utils.json_to_sheet(shipData);
  XLSX.utils.book_append_sheet(wb, wsShip, "Shipment");

  // === GR 시트 ===
  const grData = [
    {
      gr_no: "GR-2025-06-001",
      gr_date: "2025-06-10",
      vendor_code: "VND-001",
      sku: "SKU001",
      description: "Basic Tee",
      qty: 100,
      remarks: "",
    },
  ];
  const wsGR = XLSX.utils.json_to_sheet(grData);
  XLSX.utils.book_append_sheet(wb, wsGR, "GR");

  // === Settlement 시트 ===
  // 그룹핑 방식:
  // - 비용이 있는 row = 새 정산 그룹 시작
  // - 이후 비용 없는 row에 DN_NO만 입력하면 같은 그룹에 추가됨
  // - 안분 시 해당 그룹의 DN_NO에 매칭되는 Shipment만 대상
  const stData = [
    // 그룹 1: 6월 MUSINSA-JP (DN-001 ~ DN-003)
    {
      year_month: "2025-06",
      buyer_code: "MUSINSA-JP",
      forwarding_cost: 5000000,
      processing_cost: 2000000,
      other_cost: 1000000,
      notes: "6월 1차 정산",
      DN_NO: "DN-2025-06-001",
    },
    {
      year_month: "2025-06",
      buyer_code: "MUSINSA-JP",
      forwarding_cost: "",
      processing_cost: "",
      other_cost: "",
      notes: "",
      DN_NO: "DN-2025-06-002",
    },
    {
      year_month: "2025-06",
      buyer_code: "MUSINSA-JP",
      forwarding_cost: "",
      processing_cost: "",
      other_cost: "",
      notes: "",
      DN_NO: "DN-2025-06-003",
    },
    // 그룹 2: 6월 MUSINSA-JP 별건 정산 (DN-005)
    {
      year_month: "2025-06",
      buyer_code: "MUSINSA-JP",
      forwarding_cost: 2000000,
      processing_cost: 500000,
      other_cost: 0,
      notes: "6월 2차 정산 (단건)",
      DN_NO: "DN-2025-06-005",
    },
  ];
  const wsST = XLSX.utils.json_to_sheet(stData);
  XLSX.utils.book_append_sheet(wb, wsST, "Settlement");

  // Write to buffer
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="history_template.xlsx"`,
    },
  });
}
