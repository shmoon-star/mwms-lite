"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

      setNewBoxNo("");
      setNewBoxRemarks("");
      setNewBoxType("");
      setNewBoxWeightKg("");

      await load(id);

      if (json.box?.id) {
        setSelectedBoxId(json.box.id);
      }
    } catch (e: any) {
      alert(e?.message || "Failed to create box");
    } finally {
      setSavingBox(false);
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
      await load(id);
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
            <div>Created: {fmtDate(header.created_at)}</div>
            <div>Shipped At: {fmtDate(header.shipped_at)}</div>
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
                {savingBox ? "Creating..." : "Create Box"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Add Item to Box</h2>
              <p className="text-sm text-gray-500">
                선택한 OPEN 박스에 SKU / Qty를 적재합니다.
              </p>
            </div>

            <select
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">Select Box</option>
              {boxes.map((box) => (
                <option key={box.id} value={box.id}>
                  {box.box_no} / {box.status}
                </option>
              ))}
            </select>

            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">Select SKU</option>
              {lines.map((line) => (
                <option key={line.id} value={line.sku}>
                  {line.sku}
                  {line.product_name ? ` / ${line.product_name}` : ""}
                  {` / ordered ${line.qty_ordered} / packed ${line.qty_packed} / balance ${line.balance}`}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value || 0))}
              className="w-full rounded border px-3 py-2 text-sm"
            />

            <button
              onClick={handleAddItem}
              disabled={
                savingItem ||
                isShipped ||
                !selectedBox ||
                (selectedBox.status || "").toUpperCase() !== "OPEN"
              }
              className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
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
                          <td className="px-3 py-2">{fmtDate(box.packed_at)}</td>
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
                      Status: {selectedBox.status || "-"} / Packed At: {fmtDate(selectedBox.packed_at)}
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

                  {(selectedBox.status || "").toUpperCase() === "OPEN" && !isShipped && (
                    <button
                      onClick={() => handleCloseBox(selectedBox.id)}
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Close Box
                    </button>
                  )}
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
                            <td className="px-3 py-2">{fmtDate(item.created_at)}</td>
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