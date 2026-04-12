"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type ShipmentHeader = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  atd: string | null;
  ata: string | null;
  buyer_gr_date: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
};

type DnRow = {
  id: string;
  dn_no: string;
  status: string;
  ship_from: string | null;
  ship_to: string | null;
  created_at: string | null;
  confirmed_at: string | null;
};

type PalletRow = {
  id: string;
  pallet_no: string;
  status: string;
  total_boxes: number;
  total_qty: number;
  total_weight: number;
  total_cbm: number;
  length: number;
  width: number;
  height: number;
  created_at: string | null;
  closed_at: string | null;
};

type BoxRow = {
  id: string;
  pallet_id: string;
  dn_id: string | null;
  box_id: string | null;
  box_no: string | null;
  carton_no: string | null;
  qty: number;
  weight: number;
  cbm: number;
  scanned_at: string | null;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusBadgeClass(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "CANCELLED") return "bg-red-100 text-red-700 border-red-200";
  if (s === "CLOSED") return "bg-gray-100 text-gray-700 border-gray-200";
  if (s === "PALLETIZING") return "bg-amber-100 text-amber-700 border-amber-200";
  if (s === "OPEN") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export default function ScmShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState<ShipmentHeader | null>(null);
  const [dns, setDns] = useState<DnRow[]>([]);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [boxes, setBoxes] = useState<BoxRow[]>([]);

  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [boxKeyword, setBoxKeyword] = useState("");

  // Files
  type ShipmentFile = { id: string; file_name: string; file_size: number; mime_type: string | null; storage_path: string; uploaded_at: string | null };
  const [files, setFiles] = useState<ShipmentFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [blNo, setBlNo] = useState("");
  const [eta, setEta] = useState("");
  const [etd, setEtd] = useState("");
  const [atd, setAtd] = useState("");
  const [ata, setAta] = useState("");
  const [buyerGrDate, setBuyerGrDate] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [containerNo, setContainerNo] = useState("");
  const [sealNo, setSealNo] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    params.then((v) => setId(v.id));
  }, [params]);

  async function load(targetId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/scm/shipment/${targetId}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!json?.ok) {
        throw new Error(json?.error || "failed to load SCM shipment detail");
      }

      const nextHeader = json?.header || null;
      const nextDns = Array.isArray(json?.dns) ? json.dns : [];
      const nextPallets = Array.isArray(json?.pallets) ? json.pallets : [];
      const nextBoxes = Array.isArray(json?.boxes) ? json.boxes : [];

      setHeader(nextHeader);
      setDns(nextDns);
      setPallets(nextPallets);
      setBoxes(nextBoxes);

      setBlNo(nextHeader?.bl_no || "");
      setEta(nextHeader?.eta || "");
      setEtd(nextHeader?.etd || "");
      setAtd(nextHeader?.atd || "");
      setAta(nextHeader?.ata || "");
      setBuyerGrDate(nextHeader?.buyer_gr_date || "");
      setVesselName(nextHeader?.vessel_name || "");
      setContainerNo(nextHeader?.container_no || "");
      setSealNo(nextHeader?.seal_no || "");
      setRemark(nextHeader?.remark || "");

      setSelectedPalletId((prev) => {
        if (prev && nextPallets.some((x: PalletRow) => x.id === prev)) {
          return prev;
        }
        return nextPallets[0]?.id || "";
      });
    } catch (e: any) {
      alert(e?.message || "failed to load SCM shipment detail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load(id);
    loadFiles(id);
  }, [id]);

  async function loadFiles(targetId: string) {
    try {
      const res = await fetch(`/api/scm/shipment/${targetId}/files`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setFiles(json.files ?? []);
    } catch {}
  }

  async function uploadFile(file: File) {
    if (!id) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/scm/shipment/${id}/files`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json?.ok) { alert(json?.error || "Upload failed"); return; }
      await loadFiles(id);
    } catch (e: any) {
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteFile(fileId: string) {
    if (!id || !confirm("파일을 삭제하시겠습니까?")) return;
    await fetch(`/api/scm/shipment/${id}/files?fileId=${fileId}`, { method: "DELETE" });
    await loadFiles(id);
  }

  async function downloadFile(storagePath: string, fileName: string) {
    try {
      const res = await fetch("/api/scm/shipment-files/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath, file_name: fileName }),
      });
      const json = await res.json();
      if (json?.url) {
        const a = document.createElement("a");
        a.href = json.url;
        a.download = fileName;
        a.target = "_blank";
        a.click();
      }
    } catch {}
  }

  async function saveHeader() {
    if (!id) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/scm/shipment/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bl_no: blNo,
          eta,
          etd,
          atd,
          ata,
          buyer_gr_date: buyerGrDate,
          vessel_name: vesselName,
          container_no: containerNo,
          seal_no: sealNo,
          remark,
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        alert(json?.error || "failed to save shipment info");
        return;
      }

      await load(id);
    } catch (e: any) {
      alert(e?.message || "failed to save shipment info");
    } finally {
      setSaving(false);
    }
  }

  const filteredBoxes = useMemo(() => {
    const base = selectedPalletId
      ? boxes.filter((x) => x.pallet_id === selectedPalletId)
      : boxes;

    const q = boxKeyword.trim().toLowerCase();
    if (!q) return base;

    return base.filter((row) => {
      const joined = [
        row.box_no || "",
        row.carton_no || "",
        row.qty,
        row.weight,
        row.cbm,
      ]
        .join(" ")
        .toLowerCase();

      return joined.includes(q);
    });
  }, [boxes, selectedPalletId, boxKeyword]);

  const summary = useMemo(() => {
    const activePallets = pallets.filter(
      (row) => String(row.status || "").toUpperCase() !== "CANCELLED"
    );

    return {
      dn_count: dns.length,
      pallet_count: activePallets.length,
      total_boxes: activePallets.reduce((sum, row) => sum + safeNum(row.total_boxes), 0),
      total_qty: activePallets.reduce((sum, row) => sum + safeNum(row.total_qty), 0),
      total_weight: activePallets.reduce((sum, row) => sum + safeNum(row.total_weight), 0),
      total_cbm: activePallets.reduce((sum, row) => sum + safeNum(row.total_cbm), 0),
    };
  }, [dns, pallets]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!header) return <div className="p-6">Shipment not found</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/scm/shipment" className="hover:underline">
              SCM / Shipment
            </Link>
            {" / "}
            {header.shipment_no}
          </div>

          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{header.shipment_no}</h1>
            <span
              className={[
                "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                statusBadgeClass(header.status),
              ].join(" ")}
            >
              {header.status}
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            WMS shipment 결과를 SCM 관점에서 조회하고 선적 정보를 수정합니다.
          </p>
        </div>

<div className="flex gap-2">
  <button
    onClick={() => load(id)}
    className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
  >
    Refresh
  </button>

  <a
    href={`/api/scm/shipment/${header.id}/export/header`}
    className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
  >
    Header CSV
  </a>

  <a
    href={`/api/scm/shipment/${header.id}/export/detail`}
    className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
  >
    Detail CSV
  </a>

  <Link
    href={`/wms/shipment/${header.id}`}
    className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
  >
    Go WMS Shipment
  </Link>
</div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">DN</div>
          <div className="mt-1 text-2xl font-semibold">{summary.dn_count}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Pallet</div>
          <div className="mt-1 text-2xl font-semibold">{summary.pallet_count}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Boxes</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total_boxes}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Qty</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total_qty}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Weight</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total_weight}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">CBM</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total_cbm}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Shipment Info</h2>
            <button
              onClick={saveHeader}
              disabled={saving}
              className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block font-medium">BL No</label>
              <input
                value={blNo}
                onChange={(e) => setBlNo(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">ETD</label>
              <input
                value={etd}
                onChange={(e) => setEtd(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Estimated Time of Departure"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">ETA</label>
              <input
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Estimated Time of Arrival"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">ATD (At Port)</label>
              <input
                value={atd}
                onChange={(e) => setAtd(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Actual Time of Departure"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">ATA (At Port)</label>
              <input
                value={ata}
                onChange={(e) => setAta(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Actual Time of Arrival"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Buyer GR Date</label>
              <input
                type="date"
                value={buyerGrDate}
                onChange={(e) => setBuyerGrDate(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Vessel</label>
              <input
                value={vesselName}
                onChange={(e) => setVesselName(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Container</label>
              <input
                value={containerNo}
                onChange={(e) => setContainerNo(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Seal No</label>
              <input
                value={sealNo}
                onChange={(e) => setSealNo(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Remark</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="w-full rounded border px-3 py-2"
                rows={4}
              />
            </div>

            <div className="border-t pt-3 text-xs text-gray-500">
              <div>Created At: {fmtDate(header.created_at) || "-"}</div>
              <div>Updated At: {fmtDate(header.updated_at) || "-"}</div>
              <div>Closed At: {fmtDate(header.closed_at) || "-"}</div>
              <div>Cancelled At: {fmtDate(header.cancelled_at) || "-"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 font-medium">DN</h2>
          <div className="space-y-2 text-sm">
            {dns.length === 0 ? (
              <div className="text-gray-500">No DN</div>
            ) : (
              dns.map((row) => (
                <div key={row.id} className="rounded border p-3">
                  <div className="font-medium">{row.dn_no}</div>
                  <div>Status: {row.status || "-"}</div>
                  <div>Ship From: {row.ship_from || "-"}</div>
                  <div>Ship To: {row.ship_to || "-"}</div>
                  <div>Created: {fmtDate(row.created_at) || "-"}</div>
                  <div>Confirmed: {fmtDate(row.confirmed_at) || "-"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-medium">Pallet</h2>
            <p className="text-sm text-gray-500">팔레트별 적재 수량 / 중량 / 치수</p>
          </div>

          <div className="w-[280px]">
            <label className="mb-1 block text-sm font-medium">Select Pallet</label>
            <select
              value={selectedPalletId}
              onChange={(e) => setSelectedPalletId(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">All Pallets</option>
              {pallets.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.pallet_no} ({row.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {pallets.length === 0 ? (
          <div className="text-sm text-gray-500">No pallet</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-3">Pallet No</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Boxes</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Weight</th>
                  <th className="px-3 py-3">CBM</th>
                  <th className="px-3 py-3">L</th>
                  <th className="px-3 py-3">W</th>
                  <th className="px-3 py-3">H</th>
                  <th className="px-3 py-3">Created At</th>
                </tr>
              </thead>
              <tbody>
                {pallets.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t ${
                      row.id === selectedPalletId ? "bg-blue-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{row.pallet_no}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.total_boxes}</td>
                    <td className="px-3 py-2">{row.total_qty}</td>
                    <td className="px-3 py-2">{row.total_weight}</td>
                    <td className="px-3 py-2">{row.total_cbm}</td>
                    <td className="px-3 py-2">{row.length}</td>
                    <td className="px-3 py-2">{row.width}</td>
                    <td className="px-3 py-2">{row.height}</td>
                    <td className="px-3 py-2">{fmtDate(row.created_at) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-medium">Pallet Box</h2>
            <p className="text-sm text-gray-500">선택된 pallet 기준 box 적재 내역</p>
          </div>

          <div className="w-[280px]">
            <label className="mb-1 block text-sm font-medium">Keyword</label>
            <input
              value={boxKeyword}
              onChange={(e) => setBoxKeyword(e.target.value)}
              placeholder="Box No / Carton No"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>

        {filteredBoxes.length === 0 ? (
          <div className="text-sm text-gray-500">No box</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-3">Scanned At</th>
                  <th className="px-3 py-3">Pallet</th>
                  <th className="px-3 py-3">Box No</th>
                  <th className="px-3 py-3">Carton No</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Weight</th>
                  <th className="px-3 py-3">CBM</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoxes.map((row) => {
                  const pallet = pallets.find((x) => x.id === row.pallet_id);

                  return (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{fmtDate(row.scanned_at) || "-"}</td>
                      <td className="px-3 py-2">{pallet?.pallet_no || "-"}</td>
                      <td className="px-3 py-2 font-medium">{row.box_no || "-"}</td>
                      <td className="px-3 py-2">{row.carton_no || "-"}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                      <td className="px-3 py-2">{row.weight}</td>
                      <td className="px-3 py-2">{row.cbm}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Shipment Files ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">
            Shipment Files
            {files.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{files.length}</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "+ Upload File"}
            </button>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">파일이 없습니다. B/L, 패킹리스트 등 서류를 업로드하세요.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="py-2 pr-4">File Name</th>
                <th className="py-2 pr-4">Size</th>
                <th className="py-2 pr-4">Uploaded At</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-t hover:bg-gray-50/50">
                  <td className="py-2 pr-4 font-medium">
                    <button
                      onClick={() => downloadFile(f.storage_path, f.file_name)}
                      className="text-blue-600 hover:underline text-left"
                    >
                      📄 {f.file_name}
                    </button>
                  </td>
                  <td className="py-2 pr-4 text-gray-500 text-xs">
                    {f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : "-"}
                  </td>
                  <td className="py-2 pr-4 text-gray-500 text-xs">{fmtDate(f.uploaded_at) || "-"}</td>
                  <td className="py-2">
                    <button
                      onClick={() => deleteFile(f.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}