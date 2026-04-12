/**
 * product-master.ts
 *
 * Central utility for SKU ↔ Barcode bidirectional lookup.
 *
 * Usage in any API route:
 *   const master = await loadProductMaster(sb);
 *   const product = master.resolve("BARCODE-123"); // works with SKU too
 *   const barcode = master.barcodeOf("SKU-001");
 *   const sku     = master.skuOf("BARCODE-123");
 */

export type ProductMaster = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  brand: string | null;
  uom: string | null;
  category: string | null;
  status: string | null;
};

export type ProductLookup = {
  /** All products indexed by SKU */
  bySku: Map<string, ProductMaster>;
  /** All products indexed by barcode (non-null barcodes only) */
  byBarcode: Map<string, ProductMaster>;
  /**
   * Resolve any identifier — tries SKU first, then barcode.
   * Returns null if not found.
   */
  resolve: (identifier: string | null | undefined) => ProductMaster | null;
  /** Return barcode for a given SKU (null if not set) */
  barcodeOf: (sku: string | null | undefined) => string | null;
  /** Return SKU for a given barcode (null if not found) */
  skuOf: (barcode: string | null | undefined) => string | null;
  /** Return product name for a given SKU or barcode */
  nameOf: (identifier: string | null | undefined) => string | null;
};

/**
 * Load the full product master from the DB and return bidirectional lookup maps.
 * Call once per request, then use the returned object for all lookups.
 */
export async function loadProductMaster(sb: any): Promise<ProductLookup> {
  const { data, error } = await sb
    .from("products")
    .select("id, sku, barcode, name, brand, uom, category, status");

  if (error) throw error;

  const products: ProductMaster[] = (data ?? []).map((row: any) => ({
    id: String(row.id ?? ""),
    sku: String(row.sku ?? "").trim(),
    barcode: row.barcode ? String(row.barcode).trim() : null,
    name: row.name ? String(row.name).trim() : null,
    brand: row.brand ? String(row.brand).trim() : null,
    uom: row.uom ? String(row.uom).trim() : null,
    category: row.category ? String(row.category).trim() : null,
    status: row.status ? String(row.status).trim() : null,
  }));

  const bySku = new Map<string, ProductMaster>();
  const byBarcode = new Map<string, ProductMaster>();

  for (const p of products) {
    if (p.sku) bySku.set(p.sku, p);
    if (p.barcode) byBarcode.set(p.barcode, p);
  }

  function resolve(identifier: string | null | undefined): ProductMaster | null {
    if (!identifier) return null;
    const id = String(identifier).trim();
    return bySku.get(id) ?? byBarcode.get(id) ?? null;
  }

  function barcodeOf(sku: string | null | undefined): string | null {
    if (!sku) return null;
    return bySku.get(String(sku).trim())?.barcode ?? null;
  }

  function skuOf(barcode: string | null | undefined): string | null {
    if (!barcode) return null;
    return byBarcode.get(String(barcode).trim())?.sku ?? null;
  }

  function nameOf(identifier: string | null | undefined): string | null {
    return resolve(identifier)?.name ?? null;
  }

  return { bySku, byBarcode, resolve, barcodeOf, skuOf, nameOf };
}

/**
 * Lightweight variant: load only a subset by SKU list.
 * Useful when you already know which SKUs you need.
 */
export async function loadProductsBySkus(
  skus: string[],
  sb: any
): Promise<ProductLookup> {
  const uniqueSkus = Array.from(new Set(skus.map((s) => String(s).trim()).filter(Boolean)));

  if (uniqueSkus.length === 0) {
    const empty = new Map<string, ProductMaster>();
    const noop = () => null;
    return { bySku: empty, byBarcode: empty, resolve: noop, barcodeOf: noop, skuOf: noop, nameOf: noop };
  }

  const { data, error } = await sb
    .from("products")
    .select("id, sku, barcode, name, brand, uom, category, status")
    .in("sku", uniqueSkus);

  if (error) throw error;

  // Re-use the same map-building logic
  const products: ProductMaster[] = (data ?? []).map((row: any) => ({
    id: String(row.id ?? ""),
    sku: String(row.sku ?? "").trim(),
    barcode: row.barcode ? String(row.barcode).trim() : null,
    name: row.name ? String(row.name).trim() : null,
    brand: row.brand ? String(row.brand).trim() : null,
    uom: row.uom ? String(row.uom).trim() : null,
    category: row.category ? String(row.category).trim() : null,
    status: row.status ? String(row.status).trim() : null,
  }));

  const bySku = new Map<string, ProductMaster>();
  const byBarcode = new Map<string, ProductMaster>();
  for (const p of products) {
    if (p.sku) bySku.set(p.sku, p);
    if (p.barcode) byBarcode.set(p.barcode, p);
  }

  function resolve(identifier: string | null | undefined): ProductMaster | null {
    if (!identifier) return null;
    const id = String(identifier).trim();
    return bySku.get(id) ?? byBarcode.get(id) ?? null;
  }

  return {
    bySku,
    byBarcode,
    resolve,
    barcodeOf: (sku) => (sku ? bySku.get(String(sku).trim())?.barcode ?? null : null),
    skuOf: (barcode) => (barcode ? byBarcode.get(String(barcode).trim())?.sku ?? null : null),
    nameOf: (identifier) => resolve(identifier)?.name ?? null,
  };
}
