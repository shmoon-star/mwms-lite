"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";
import { barcodeSvg } from "@/lib/barcode";

type Header = {
  id: string;
  dn_no: string;
  customer_label: string;
  status: string | null;
  created_at: string | null;
  shipped_at: string | null;
};

type Summary = {
  qty_ordered: number;
  qty_packed: number;
  balance: number;
  box_count: number;
};

type Line = {
  id: string;
  sku: string;
  product_name: string | null;
  qty_ordered: number;
  qty_packed: number;
  balance: number;
  qty_onhand: number;
};

type BoxItem = {
  id: string;
  dn_box_id: string;
  sku: string;
  qty: number;
  source_type: string | null;
  created_at: string | null;
};

type Box = {
  id: string;
  dn_id: string;
  box_no: string;
  status: string | null;
  remarks: string | null;
  packed_at: string | null;
  created_at: string | null;
  box_type?: string | null;
  box_weight_kg?: number | null;
  items: BoxItem[];
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function sumBoxQty(items: BoxItem[]) {
  return items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function boxItemCount(items: BoxItem[]) {
  return items.length;
}

export default function WmsDnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState("");
  const [header, setHeader] = useState<Header | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);

  const [newBoxNo, setNewBoxNo] = useState("");
  const [newBoxRemarks, setNewBoxRemarks] = useState("");
  const [newBoxType, setNewBoxType] = useState("");
  const [newBoxWeightKg, setNewBoxWeightKg] = useState("");

  const [selectedBoxId, setSelectedBoxId] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scannedLine, setScannedLine] = useState<Line | null>(null);
  const [scanError, setScanError] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [savingBox, setSavingBox] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [boxKeyword, setBoxKeyword] = useState("");

  useEffect(() => {
    params.then((v) => setId(v.id));
  }, [params]);

  async function load(targetId: string) {
    if (!targetId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/wms/dn/${targetId}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load DN detail");
      }

      const nextBoxes: Box[] = json.boxes || [];

      setHeader(json.header);
      setSummary(json.summary);
      setLines(json.lines || []);
      setBoxes(nextBoxes);

      const selectedStillExists = nextBoxes.some((b) => b.id === selectedBoxId);

      if (!selectedStillExists) {
        const openBox = nextBoxes.find((b) => (b.status || "").toUpperCase() === "OPEN");
        setSelectedBoxId(openBox?.id || nextBoxes[0]?.id || "");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to load DN detail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  const selectedBox = useMemo(() => {
    return boxes.find((b) => b.id === selectedBoxId) || null;
  }, [boxes, selectedBoxId]);

  const filteredBoxes = useMemo(() => {
    const q = boxKeyword.trim().toLowerCase();
    if (!q) return boxes;

    return boxes.filter((box) => {
      const joined = [
        box.box_no,
        box.status || "",
        box.box_type || "",
        box.remarks || "",
      ]
        .join(" ")
        .toLowerCase();

      return joined.includes(q);
    });
  }, [boxes, boxKeyword]);

  async function handleCreateBox() {
    if (!id) return;

    if (!newBoxNo.trim()) {
      alert("box_no를 입력하세요.");
      return;
    }

    setSavingBox(true);
    try {
      const res = await fetch(`/api/wms/dn/${id}/box`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_box",
          box_no: newBoxNo,
          remarks: newBoxRemarks,
          box_type: newBoxType,
          box_weight_kg: newBoxWeightKg,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to create box");
      }

      const createdBoxId = json.box?.id;

      setNewBoxNo("");
      setNewBoxRemarks("");
      setNewBoxType("");
      setNewBoxWeightKg("");

      await load(id);

      if (createdBoxId) {
        setSelectedBoxId(createdBoxId);
        // 생성 후 자동 Print Label
        setTimeout(() => {
          const createdBox = document.querySelector('[data-print-label]') as HTMLButtonElement;
          if (createdBox) createdBox.click();
        }, 300);
      }
    } catch (e: any) {
      alert(e?.message || "Failed to create box");
    } finally {
      setSavingBox(false);
    }
  }

  function handleBarcodeSearch() {
    const q = barcodeInput.trim().toUpperCase();
    if (!q) return;
    const found = lines.find(
      (l) => l.sku.toUpperCase() === q || l.sku.toUpperCase().includes(q)
    );
    if (found) {
      setScannedLine(found);
      setSku(found.sku);
      setScanError("");
    } else {
      setScannedLine(null);
      setSku("");
      setScanError(`"${barcodeInput}" — 해당 SKU를 찾을 수 없습니다.`);
    }
  }

  async function handleAddItem() {
    if (!id || !selectedBoxId) {
      alert("박스를 먼저 선택하세요.");
      return;
    }

    if (!sku.trim() || qty <= 0) {
      alert("SKU와 Qty를 확인하세요.");
      return;
    }

    setSavingItem(true);
    try {
      const res = await fetch(`/api/wms/dn/${id}/box`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          box_id: selectedBoxId,
          sku,
          qty,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add item");
      }

      setSku("");
      setQty(1);
      setBarcodeInput("");
      setScannedLine(null);
      setScanError("");
      await load(id);
      // Re-focus barcode for next scan
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } catch (e: any) {
      alert(e?.message || "Failed to add item");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleCloseBox(boxId: string) {
    if (!id) return;

    const ok = confirm("이 박스를 마감할까요?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/wms/dn/${id}/box`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close_box",
          box_id: boxId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to close box");
      }

      await load(id);
    } catch (e: any) {
      alert(e?.message || "Failed to close box");
    }
  }

  const [savingDn, setSavingDn] = useState(false);

  async function handleSavePacking() {
    if (!id) return;
    setSavingDn(true);
    try {
      const res = await fetch(`/api/wms/dn/${id}/save-packing`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
      await load(id);
    } catch (e: any) {
      alert(e?.message || "Failed to save");
    } finally {
      setSavingDn(false);
    }
  }

  async function handleConfirm() {
    if (!id) return;

    const ok = confirm("Ship Confirm 시 inventory가 차감됩니다. 진행할까요?");
    if (!ok) return;

    setConfirming(true);
    try {
      const res = await fetch(`/api/wms/dn/${id}/confirm`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to confirm");
      }

      await load(id);
      alert("Shipped");
    } catch (e: any) {
      alert(e?.message || "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  async function handlePrintLabel() {
    if (!selectedBox || !header) return;

    // Fetch barcode info for SKUs in this box
    const skus = Array.from(new Set(selectedBox.items.map((i) => i.sku).filter(Boolean)));
    let barcodeMap: Record<string, string> = {};
    let descMap: Record<string, string> = {};

    if (skus.length > 0) {
      try {
        const res = await fetch("/api/products");
        const json = await res.json();
        if (json.ok && json.data) {
          for (const p of json.data) {
            if (skus.includes(p.sku)) {
              barcodeMap[p.sku] = p.barcode || "";
              descMap[p.sku] = p.name || p.product_name || "";
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Also get description from DN lines
    for (const line of lines) {
      if (!descMap[line.sku] && line.product_name) {
        descMap[line.sku] = line.product_name;
      }
    }

    const totalItems = selectedBox.items.length;
    const totalQty = sumBoxQty(selectedBox.items);
    const boxBarcode = barcodeSvg(selectedBox.box_no, 48, 1.5);

    // Aggregate items by SKU
    const skuQtyMap = new Map<string, number>();
    for (const item of selectedBox.items) {
      skuQtyMap.set(item.sku, (skuQtyMap.get(item.sku) || 0) + Number(item.qty || 0));
    }

    let itemRows = "";
    for (const [itemSku, itemQty] of skuQtyMap) {
      const bc = barcodeMap[itemSku];
      const desc = descMap[itemSku] || "";
      const skuBarcodeSvg = bc ? barcodeSvg(bc, 28, 1) : "";
      itemRows += `
        <tr>
          <td style="padding:4px 6px;font-family:monospace;font-size:11px;font-weight:600">${itemSku}</td>
          <td style="padding:4px 6px">${skuBarcodeSvg ? skuBarcodeSvg + '<div style="font-size:9px;text-align:center;margin-top:1px">' + (bc || "") + '</div>' : '-'}</td>
          <td style="padding:4px 6px;font-size:11px">${desc}</td>
          <td style="padding:4px 6px;font-size:12px;font-weight:700;text-align:right">${itemQty}</td>
        </tr>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<title>Box Label - ${selectedBox.box_no}</title>
<style>
  @page { size: 200mm 100mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 200mm; height: 100mm; font-family: Arial, sans-serif; padding: 6mm; display: flex; flex-direction: column; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1.5px solid #000; padding-bottom: 5px; margin-bottom: 4px; }
  .box-label { font-size: 18px; font-weight: 800; }
  .barcode-area { text-align: center; }
  .barcode-text { font-size: 10px; font-family: monospace; margin-top: 1px; }
  .meta { font-size: 11px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 4px; display: flex; gap: 16px; }
  .meta span { color: #333; }
  .meta b { color: #000; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f3f4f6; text-align: left; padding: 3px 6px; font-size: 10px; font-weight: 700; border-bottom: 1.5px solid #000; }
  td { border-bottom: 0.5px solid #ddd; }
  .footer { margin-top: auto; border-top: 1.5px solid #000; padding-top: 3px; font-size: 11px; font-weight: 700; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="box-label">Box: ${selectedBox.box_no}</div>
      <div style="font-size:11px;color:#666">DN: ${header.dn_no}</div>
    </div>
    <div class="barcode-area">
      ${boxBarcode}
      <div class="barcode-text">${selectedBox.box_no}</div>
    </div>
  </div>

  <div class="meta">
    <span>Weight: <b>${selectedBox.box_weight_kg != null ? selectedBox.box_weight_kg + " kg" : "-"}</b></span>
    <span>Type: <b>${selectedBox.box_type || "-"}</b></span>
    <span>Packed: <b>${fmtDateYmd(selectedBox.packed_at) || "-"}</b></span>
  </div>

  <table>
    <thead><tr><th>SKU</th><th>Barcode</th><th>Description</th><th style="text-align:right">Qty</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="footer">
    <span>Items: ${totalItems}</span>
    <span>Total Qty: ${totalQty}</span>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank", "width=800,height=500");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!header || !summary) {
    return <div className="p-6">DN not found</div>;
  }

  const isShipped = (header.status || "").toUpperCase() === "SHIPPED";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/wms/dn" className="hover:underline">
              WMS / DN
            </Link>
            {" / "}
            {header.dn_no}
          </div>

          <h1 className="mt-1 text-2xl font-semibold">{header.dn_no}</h1>

          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <div>Customer: {header.customer_label || "-"}</div>
            <div>Status: {header.status || "-"}</div>
            <div>Created: {fmtDateYmd(header.created_at) || "-"}</div>
            <div>Shipped At: {fmtDateYmd(header.shipped_at) || "-"}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <a
            href={`/api/wms/dn/${id}/export/summary`}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Box Summary CSV
          </a>

          <a
            href={`/api/wms/dn/${id}/export/detail`}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Box Detail CSV
          </a>

          <button
            onClick={() => load(id)}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>

          <button
            onClick={handleSavePacking}
            disabled={savingDn || isShipped}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {savingDn ? "Saving..." : "Save (PACKING)"}
          </button>

          <button
            onClick={handleConfirm}
            disabled={confirming || isShipped}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {confirming ? "Confirming..." : "Ship Confirm"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Ordered</div>
          <div className="mt-1 text-2xl font-semibold">{summary.qty_ordered}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Packed</div>
          <div className="mt-1 text-2xl font-semibold">{summary.qty_packed}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Balance</div>
          <div className="mt-1 text-2xl font-semibold">{summary.balance}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Boxes</div>
          <div className="mt-1 text-2xl font-semibold">{summary.box_count}</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6 space-y-4">
          <div className="rounded-xl border p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Create Box</h2>
              <p className="text-sm text-gray-500">
                박스번호를 생성한 뒤 SKU / Qty를 적재합니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <input
                value={newBoxNo}
                onChange={(e) => setNewBoxNo(e.target.value)}
                placeholder="Box No"
                className="rounded border px-3 py-2 text-sm"
              />

              <select
                value={newBoxType}
                onChange={(e) => setNewBoxType(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              >
                <option value="">Select Box Type</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>

              <input
                value={newBoxWeightKg}
                onChange={(e) => setNewBoxWeightKg(e.target.value)}
                placeholder="Weight (kg)"
                className="rounded border px-3 py-2 text-sm"
              />

              <input
                value={newBoxRemarks}
                onChange={(e) => setNewBoxRemarks(e.target.value)}
                placeholder="Remarks"
                className="rounded border px-3 py-2 text-sm"
              />

              <button
                onClick={handleCreateBox}
                disabled={savingBox || isShipped}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {savingBox ? "Creating..." : "Create Box + Print"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Add Item to Box</h2>
              <p className="text-sm text-gray-500">
                선택한 OPEN 박스에 바코드 스캔 후 Qty를 입력합니다.
              </p>
            </div>

            {/* Box 선택: 바코드 입력 또는 Box Summary 클릭 */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">Box No 입력 / 스캔</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Box No 스캔 또는 입력 후 Enter"
                  className="flex-1 rounded border px-3 py-2 text-sm font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (!val) return;
                      const found = boxes.find(b => b.box_no === val);
                      if (found) {
                        setSelectedBoxId(found.id);
                        (e.target as HTMLInputElement).value = "";
                      } else {
                        alert(`Box "${val}" not found`);
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
              selectedBox
                ? (selectedBox.status || "").toUpperCase() === "OPEN"
                  ? "border-green-300 bg-green-50"
                  : "border-gray-200 bg-gray-50"
                : "border-dashed border-gray-300 bg-gray-50"
            }`}>
              {selectedBox ? (
                <>
                  <div>
                    <span className="font-semibold">{selectedBox.box_no}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded border font-medium ${
                      (selectedBox.status || "").toUpperCase() === "OPEN"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}>
                      {selectedBox.status}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {boxItemCount(selectedBox.items)} items / {sumBoxQty(selectedBox.items)} qty
                  </span>
                </>
              ) : (
                <span className="text-gray-400">오른쪽 박스 목록에서 박스를 선택하세요</span>
              )}
            </div>

            {/* Barcode scan input */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">
                SKU / Barcode 스캔
              </label>
              <div className="flex gap-2">
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => {
                    setBarcodeInput(e.target.value);
                    setScanError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBarcodeSearch();
                    }
                  }}
                  placeholder="바코드 스캔 또는 SKU 입력 후 Enter"
                  className="flex-1 rounded border px-3 py-2 text-sm font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleBarcodeSearch}
                  className="rounded border px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100"
                >
                  조회
                </button>
              </div>

              {/* Scan error */}
              {scanError && (
                <div className="text-xs text-red-600 px-1">{scanError}</div>
              )}
            </div>

            {/* Scanned SKU info card */}
            {scannedLine ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-sm font-mono">{scannedLine.sku}</div>
                    {scannedLine.product_name && (
                      <div className="text-xs text-gray-600 mt-0.5">{scannedLine.product_name}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setScannedLine(null); setSku(""); setBarcodeInput(""); setScanError(""); barcodeRef.current?.focus(); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-white border px-2 py-1.5">
                    <div className="text-xs text-gray-400">Ordered</div>
                    <div className="font-semibold text-sm">{scannedLine.qty_ordered}</div>
                  </div>
                  <div className="rounded bg-white border px-2 py-1.5">
                    <div className="text-xs text-gray-400">Packed</div>
                    <div className="font-semibold text-sm">{scannedLine.qty_packed}</div>
                  </div>
                  <div className={`rounded border px-2 py-1.5 ${
                    scannedLine.balance > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"
                  }`}>
                    <div className="text-xs text-gray-400">Balance</div>
                    <div className={`font-semibold text-sm ${
                      scannedLine.balance > 0 ? "text-amber-700" : "text-green-700"
                    }`}>{scannedLine.balance}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-400">
                바코드를 스캔하면 SKU 정보가 표시됩니다
              </div>
            )}

            {/* Qty input */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">Qty</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value || 0))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && scannedLine && selectedBox) {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={handleAddItem}
              disabled={
                savingItem ||
                isShipped ||
                !selectedBox ||
                (selectedBox.status || "").toUpperCase() !== "OPEN" ||
                !scannedLine
              }
              className="w-full rounded border px-3 py-2 text-sm bg-black text-white hover:bg-gray-800 disabled:opacity-40 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {savingItem ? "Saving..." : "Add Item"}
            </button>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">DN Lines</h2>
              <p className="text-sm text-gray-500">Ordered / Packed / Balance / On-hand</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Ordered</th>
                    <th className="px-3 py-2">Packed</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="px-3 py-2">On-hand</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        No lines
                      </td>
                    </tr>
                  ) : (
                    lines.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.sku}</td>
                        <td className="px-3 py-2">{row.product_name || "-"}</td>
                        <td className="px-3 py-2">{row.qty_ordered}</td>
                        <td className="px-3 py-2">{row.qty_packed}</td>
                        <td className="px-3 py-2">{row.balance}</td>
                        <td className="px-3 py-2">{row.qty_onhand}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-span-6 space-y-4">
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Box Summary</h2>
                <p className="text-sm text-gray-500">
                  박스 목록을 확인하고 선택한 박스만 상세 표시합니다.
                </p>
              </div>

              <input
                value={boxKeyword}
                onChange={(e) => setBoxKeyword(e.target.value)}
                placeholder="Box No / Type / Status"
                className="w-[240px] rounded border px-3 py-2 text-sm"
              />
            </div>

            <div className="max-h-[320px] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Box No</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Weight</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Packed At</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBoxes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                        No boxes
                      </td>
                    </tr>
                  ) : (
                    filteredBoxes.map((box) => {
                      const selected = box.id === selectedBoxId;
                      return (
                        <tr
                          key={box.id}
                          onClick={() => setSelectedBoxId(box.id)}
                          className={[
                            "cursor-pointer border-t",
                            selected ? "bg-gray-100" : "hover:bg-gray-50",
                          ].join(" ")}
                        >
                          <td className="px-3 py-2 font-medium">{box.box_no}</td>
                          <td className="px-3 py-2">{box.box_type || "-"}</td>
                          <td className="px-3 py-2">
                            {box.box_weight_kg != null ? `${box.box_weight_kg}` : "-"}
                          </td>
                          <td className="px-3 py-2">{box.status || "-"}</td>
                          <td className="px-3 py-2">{boxItemCount(box.items)}</td>
                          <td className="px-3 py-2">{sumBoxQty(box.items)}</td>
                          <td className="px-3 py-2">{fmtDateYmd(box.packed_at) || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3 min-h-[320px]">
            <div>
              <h2 className="text-lg font-semibold">Selected Box Detail</h2>
              <p className="text-sm text-gray-500">
                선택한 박스 1개의 상세만 표시합니다.
              </p>
            </div>

            {!selectedBox ? (
              <div className="text-sm text-gray-500">박스를 선택하세요.</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{selectedBox.box_no}</div>
                    <div className="text-sm text-gray-500">
                      Status: {selectedBox.status || "-"} / Packed At: {fmtDateYmd(selectedBox.packed_at) || "-"}
                    </div>
                    <div className="text-sm text-gray-500">
                      Type: {selectedBox.box_type || "-"} / Weight:{" "}
                      {selectedBox.box_weight_kg != null ? `${selectedBox.box_weight_kg} kg` : "-"}
                    </div>
                    <div className="text-sm text-gray-500">
                      Remarks: {selectedBox.remarks || "-"}
                    </div>
                    <div className="text-sm text-gray-500">
                      Item Count: {boxItemCount(selectedBox.items)} / Packed Qty: {sumBoxQty(selectedBox.items)}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      data-print-label="true"
                      onClick={handlePrintLabel}
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      🏷️ Print Label
                    </button>
                    {(selectedBox.status || "").toUpperCase() === "OPEN" && !isShipped && (
                      <button
                        onClick={() => handleCloseBox(selectedBox.id)}
                        className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Close Box
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBox.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                            No items
                          </td>
                        </tr>
                      ) : (
                        selectedBox.items.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-3 py-2">{item.sku}</td>
                            <td className="px-3 py-2">{item.qty}</td>
                            <td className="px-3 py-2">{item.source_type || "-"}</td>
                            <td className="px-3 py-2">{fmtDateYmd(item.created_at) || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}