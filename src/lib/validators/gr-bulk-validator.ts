import { GRUploadRowInput, UploadLineResult } from "@/lib/types/upload";
import { SupabaseClient } from "@supabase/supabase-js";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type AsnLineRow = {
  id: string;
  sku: string | null;
  qty: number | null;
};

export async function validateGRRows(params: {
  supabase: SupabaseClient;
  asnId: string;
  rows: GRUploadRowInput[];
}): Promise<UploadLineResult[]> {
  const { supabase, asnId, rows } = params;

  const { data: asnLinesRaw, error } = await supabase
    .from("asn_line")
    .select("id, sku, qty")
    .eq("asn_id", asnId);

  if (error) {
    throw new Error(`Failed to load ASN lines: ${error.message}`);
  }

  const asnLines = (asnLinesRaw ?? []) as AsnLineRow[];

  const lineMap = new Map<string, { id: string; expectedQty: number }>();
  for (const line of asnLines) {
    const sku = String(line.sku ?? "").trim();
    if (!sku) continue;

    lineMap.set(sku, {
      id: line.id,
      expectedQty: Number(line.qty ?? 0),
    });
  }

  const duplicateCheck = new Map<string, number>();
  for (const row of rows) {
    const sku = String(row.sku ?? "").trim();
    if (!sku) continue;
    duplicateCheck.set(sku, (duplicateCheck.get(sku) ?? 0) + 1);
  }

  return rows.map((row, index) => {
    const sku = String(row.sku ?? "").trim();
    const qtyReceived = toNumber(row.qty_received);

    if (!sku) {
      return {
        lineNo: index + 1,
        sku: "",
        refLineId: null,
        expectedQty: null,
        inputQty: qtyReceived,
        validationStatus: "INVALID",
        validationMessage: "sku is required",
        isSelected: false,
      };
    }

    if ((duplicateCheck.get(sku) ?? 0) > 1) {
      return {
        lineNo: index + 1,
        sku,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyReceived,
        validationStatus: "INVALID",
        validationMessage: "duplicate sku in upload file",
        isSelected: false,
      };
    }

    if (qtyReceived === null) {
      return {
        lineNo: index + 1,
        sku,
        refLineId: null,
        expectedQty: null,
        inputQty: null,
        validationStatus: "INVALID",
        validationMessage: "qty_received must be numeric",
        isSelected: false,
      };
    }

    if (qtyReceived < 0) {
      return {
        lineNo: index + 1,
        sku,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyReceived,
        validationStatus: "INVALID",
        validationMessage: "qty_received cannot be negative",
        isSelected: false,
      };
    }

    const matched = lineMap.get(sku);
    if (!matched) {
      return {
        lineNo: index + 1,
        sku,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyReceived,
        validationStatus: "INVALID",
        validationMessage: "SKU not found in ASN",
        isSelected: false,
      };
    }

    if (qtyReceived > matched.expectedQty) {
      return {
        lineNo: index + 1,
        sku,
        refLineId: matched.id,
        expectedQty: matched.expectedQty,
        inputQty: qtyReceived,
        validationStatus: "INVALID",
        validationMessage: "qty_received exceeds expected qty",
        isSelected: false,
      };
    }

    return {
      lineNo: index + 1,
      sku,
      refLineId: matched.id,
      expectedQty: matched.expectedQty,
      inputQty: qtyReceived,
      validationStatus: "VALID",
      validationMessage: null,
      isSelected: true,
    };
  });
}