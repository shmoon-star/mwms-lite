import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/monitor/history/download?bu=CN
 *
 * 현재 DB에 저장된 History 데이터를 업로드 양식과 동일한 5시트 xlsx로 다운로드.
 * - bu 파라미터 없으면 전체 BU 통합 다운로드
 * - 다운받은 파일은 같은 route로 재업로드 가능 (포맷 대칭)
 */
export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const bu = (req.nextUrl.searchParams.get("bu") || "").trim().toUpperCase();

    // 1) history_document 전체 조회 (페이지네이션으로 1000+ 대응)
    const documents: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      let q = sb.from("history_document").select("*").range(from, from + PAGE - 1);
      if (bu) q = q.eq("business_unit", bu);
      q = q.order("doc_type", { ascending: true }).order("doc_date", { ascending: true }).order("doc_no", { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(`history_document 조회 실패: ${error.message}`);
      if (!data || data.length === 0) break;
      documents.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from > 100000) break; // safety
    }

    // 2) history_settlement 전체 조회
    let stQuery = sb.from("history_settlement").select("*");
    if (bu) stQuery = stQuery.eq("business_unit", bu);
    stQuery = stQuery.order("year_month", { ascending: true }).order("buyer_code", { ascending: true });
    const { data: stData, error: stErr } = await stQuery;
    if (stErr) throw new Error(`history_settlement 조회 실패: ${stErr.message}`);
    const settlements = stData || [];

    // 3) 5개 시트 생성
    const wb = XLSX.utils.book_new();

    // PO
    const poRows = documents
      .filter(d => d.doc_type === "PO")
      .map(d => ({
        po_no: d.doc_no ?? "",
        po_date: d.doc_date ?? "",
        vendor_code: d.vendor_code ?? "",
        sku: d.sku ?? "",
        description: d.description ?? "",
        qty: d.qty ?? 0,
        unit_price: d.unit_price ?? "",
        amount: d.amount ?? "",
        currency: d.currency ?? "",
        remarks: d.remarks ?? "",
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(poRows.length > 0 ? poRows : [{
        po_no: "", po_date: "", vendor_code: "", sku: "", description: "",
        qty: "", unit_price: "", amount: "", currency: "", remarks: "",
      }]),
      "PO",
    );

    // DN
    const dnRows = documents
      .filter(d => d.doc_type === "DN")
      .map(d => ({
        dn_no: d.doc_no ?? "",
        dn_date: d.doc_date ?? "",
        buyer_code: d.buyer_code ?? "",
        sku: d.sku ?? "",
        description: d.description ?? "",
        qty: d.qty ?? 0,
        remarks: d.remarks ?? "",
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dnRows.length > 0 ? dnRows : [{
        dn_no: "", dn_date: "", buyer_code: "", sku: "", description: "", qty: "", remarks: "",
      }]),
      "DN",
    );

    // Shipment
    // 파서는 Shipment의 remarks에 dn_no를 저장함 → 복원 시 dn_no 컬럼으로 뽑고 remarks는 비움
    // (원본 remarks 값은 업로드 시점에 사라졌으므로 복원 불가)
    const shipRows = documents
      .filter(d => d.doc_type === "SHIPMENT")
      .map(d => ({
        shipment_no: d.doc_no ?? "",
        ship_date: d.doc_date ?? "",
        dn_no: d.remarks ?? "",
        bl_no: d.bl_no ?? "",
        etd: d.etd ?? "",
        eta: d.eta ?? "",
        atd: d.atd ?? "",
        ata: d.ata ?? "",
        buyer_gr_date: d.buyer_gr_date ?? "",
        invoice_no: d.invoice_no ?? "",
        vessel: d.vessel ?? "",
        container: d.container ?? "",
        buyer_code: d.buyer_code ?? "",
        sku: d.sku ?? "",
        description: d.description ?? "",
        qty: d.qty ?? 0,
        remarks: "",
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(shipRows.length > 0 ? shipRows : [{
        shipment_no: "", ship_date: "", dn_no: "", bl_no: "", etd: "", eta: "",
        atd: "", ata: "", buyer_gr_date: "", invoice_no: "", vessel: "",
        container: "", buyer_code: "", sku: "", description: "", qty: "", remarks: "",
      }]),
      "Shipment",
    );

    // GR
    const grRows = documents
      .filter(d => d.doc_type === "GR")
      .map(d => ({
        gr_no: d.doc_no ?? "",
        gr_date: d.doc_date ?? "",
        vendor_code: d.vendor_code ?? "",
        sku: d.sku ?? "",
        description: d.description ?? "",
        qty: d.qty ?? 0,
        remarks: d.remarks ?? "",
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(grRows.length > 0 ? grRows : [{
        gr_no: "", gr_date: "", vendor_code: "", sku: "", description: "", qty: "", remarks: "",
      }]),
      "GR",
    );

    // Settlement — 그룹핑 복원 (첫 row에 비용, 이후 row에 DN_NO만)
    const stRows: any[] = [];
    for (const s of settlements) {
      const dnNos: string[] = Array.isArray(s.dn_nos) ? s.dn_nos : [];
      if (dnNos.length === 0) {
        // DN 매핑 없는 정산 (전체 기간 대상)
        stRows.push({
          year_month: s.year_month ?? "",
          buyer_code: s.buyer_code ?? "",
          forwarding_cost: s.forwarding_cost ?? 0,
          processing_cost: s.processing_cost ?? 0,
          other_cost: s.other_cost ?? 0,
          notes: s.notes ?? "",
          DN_NO: "",
        });
      } else {
        // 첫 row = 비용 포함, 나머지는 DN_NO만
        stRows.push({
          year_month: s.year_month ?? "",
          buyer_code: s.buyer_code ?? "",
          forwarding_cost: s.forwarding_cost ?? 0,
          processing_cost: s.processing_cost ?? 0,
          other_cost: s.other_cost ?? 0,
          notes: s.notes ?? "",
          DN_NO: dnNos[0],
        });
        for (let i = 1; i < dnNos.length; i++) {
          stRows.push({
            year_month: s.year_month ?? "",
            buyer_code: s.buyer_code ?? "",
            forwarding_cost: "",
            processing_cost: "",
            other_cost: "",
            notes: "",
            DN_NO: dnNos[i],
          });
        }
      }
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(stRows.length > 0 ? stRows : [{
        year_month: "", buyer_code: "", forwarding_cost: "",
        processing_cost: "", other_cost: "", notes: "", DN_NO: "",
      }]),
      "Settlement",
    );

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const today = new Date().toISOString().slice(0, 10);
    const filename = `history_${bu || "ALL"}_${today}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed" },
      { status: 500 },
    );
  }
}
