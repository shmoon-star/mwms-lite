import { DNUploadRowInput, UploadLineResult } from "@/lib/types/upload";
import { SupabaseClient } from "@supabase/supabase-js";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableText(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

export async function validateDNRows(params: {
  supabase: SupabaseClient;
  dnId: string;
  rows: DNUploadRowInput[];
}): Promise<UploadLineResult[]> {
  const { supabase, dnId, rows } = params;

  const { data: dnLines, error } = await supabase
    .from("dn_lines")
    .select("id, sku, qty_reserved, qty_shipped")
    .eq("dn_id", dnId);

  if (error) {
    throw new Error(`Failed to load DN lines: ${error.message}`);
  }

  const lineMap = new Map<
    string,
    { id: string; qty_reserved: number; qty_shipped: number }
  >();

  for (const line of dnLines ?? []) {
    lineMap.set(line.sku, {
      id: line.id,
      qty_reserved: Number(line.qty_reserved ?? 0),
      qty_shipped: Number(line.qty_shipped ?? 0),
    });
  }

  const duplicateCheck = new Map<string, number>();
  for (const row of rows) {
    const sku = String(row.sku ?? "").trim();
    if (!sku) continue;
    duplicateCheck.set(sku, (duplicateCheck.get(sku) ?? 0) + 1);
  }

  return rows.map((row, index) => {
    const lineNo = index + 1;
    const sku = String(row.sku ?? "").trim();
    const description = toNullableText(row.description);
    const qtyToShip = toNumber(row.qty_to_ship);

    if (!sku) {
      return {
        lineNo,
        sku: "",
        description,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyToShip,
        validationStatus: "INVALID",
        validationMessage: "sku is required",
        isSelected: false,
      };
    }

    if ((duplicateCheck.get(sku) ?? 0) > 1) {
      return {
        lineNo,
        sku,
        description,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyToShip,
        validationStatus: "INVALID",
        validationMessage: "duplicate sku in upload file",
        isSelected: false,
      };
    }

    if (qtyToShip === null) {
      return {
        lineNo,
        sku,
        description,
        refLineId: null,
        expectedQty: null,
        inputQty: null,
        validationStatus: "INVALID",
        validationMessage: "qty_to_ship must be numeric",
        isSelected: false,
      };
    }

    if (qtyToShip < 0) {
      return {
        lineNo,
        sku,
        description,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyToShip,
        validationStatus: "INVALID",
        validationMessage: "qty_to_ship cannot be negative",
        isSelected: false,
      };
    }

    const matched = lineMap.get(sku);
    if (!matched) {
      return {
        lineNo,
        sku,
        description,
        refLineId: null,
        expectedQty: null,
        inputQty: qtyToShip,
        validationStatus: "INVALID",
        validationMessage: "SKU not found in DN",
        isSelected: false,
      };
    }

    if (qtyToShip > matched.qty_reserved) {
      return {
        lineNo,
        sku,
        description,
        refLineId: matched.id,
        expectedQty: matched.qty_reserved,
        inputQty: qtyToShip,
        validationStatus: "INVALID",
        validationMessage: "qty_to_ship exceeds reserved qty",
        isSelected: false,
      };
    }

    return {
      lineNo,
      sku,
      description,
      refLineId: matched.id,
      expectedQty: matched.qty_reserved,
      inputQty: qtyToShip,
      validationStatus: "VALID",
      validationMessage: null,
      isSelected: true,
    };
  });
}