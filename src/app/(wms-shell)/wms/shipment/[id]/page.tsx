"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";

type ShipmentHeader = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string | null;
  closed_at: string | null;
};

type DnRow = {
  id: string;
  dn_no: string;
  status: string;
  created_at: string | null;
  ship_to?: string | null;
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

type ScanRow = {
  id: string;
  pallet_id: string;
  shipment_id: string;
  dn_id: string | null;
  box_barcode: string;
  carton_no: string | null;
  qty: number;
  weight: number;
  cbm: number;
  scanned_at: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function calcCbm(length: number, width: number, height: number) {
  if (length <= 0 || width <= 0 || height <= 0) return 0;
  return (length * width * height) / 1000000;
}

export default function WmsShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [shipmentId, setShipmentId] = useState("");
  const [header, setHeader] = useState<ShipmentHeader | null>(null);
  const [dns, setDns] = useState<DnRow[]>([]);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [recentScans, setRecentScans] = useState<ScanRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [creatingPallet, setCreatingPallet] = useState(false);
  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [scanning, setScanning] = useState(false);

  const [lengthInput, setLengthInput] = useState("");
  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [savingPallet, setSavingPallet] = useState(false);
  const [closingPallet, setClosingPallet] = useState(false);
  const [cancellingPallet, setCancellingPallet] = useState(false);

  const scanInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    params.then((v) => setShipmentId(v.id));
  }, [params]);

  async function load(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/shipment/${id}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!json?.ok) {
        throw new Error(json?.error || "failed to load shipment");
      }

      const nextHeader = json?.header || null;
      const nextDns = Array.isArray(json?.dns) ? json.dns : [];
      const nextPallets = Array.isArray(json?.pallets) ? json.pallets : [];
      const nextRecentScans = Array.isArray(json?.recent_scans)
        ? json.recent_scans
        : [];

      setHeader(nextHeader);
      setDns(nextDns);
      setPallets(nextPallets);
      setRecentScans(nextRecentScans);

      setSelectedPalletId((prev) => {
        if (prev && nextPallets.some((x: PalletRow) => x.id === prev)) {
          return prev;
        }
        const firstActive =
          nextPallets.find(
            (x: PalletRow) => String(x.status || "").toUpperCase() !== "CANCELLED"
          ) || nextPallets[0];
        return firstActive?.id || "";
      });
    } catch (e: any) {
      alert(e?.message || "failed to load shipment");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!shipmentId) return;
    load(shipmentId);
  }, [shipmentId]);

  const selectedPallet = useMemo(
    () => pallets.find((x) => x.id === selectedPalletId) || null,
    [pallets, selectedPalletId]
  );

  useEffect(() => {
    if (!selectedPallet) {
      setLengthInput("");
      setWidthInput("");
      setHeightInput("");
      return;
    }

    setLengthInput(String(safeNum(selectedPallet.length) || ""));
    setWidthInput(String(safeNum(selectedPallet.width) || ""));
    setHeightInput(String(safeNum(selectedPallet.height) || ""));
  }, [selectedPalletId, selectedPallet]);

  useEffect(() => {
    if (!loading && selectedPalletId) {
      scanInputRef.current?.focus();
    }
  }, [loading, selectedPalletId]);

  async function addPallet() {
    if (!shipmentId) return;

    setCreatingPallet(true);
    try {
      const res = await fetch(`/api/shipment/${shipmentId}/pallets`, {
        method: "POST",
      });
      const json = await res.json();

      if (!json?.ok) {
        alert(json?.error || "failed to create pallet");
        return;
      }

      await load(shipmentId);
    } catch (e: any) {
      alert(e?.message || "failed to create pallet");
    } finally {
      setCreatingPallet(false);
    }
  }

  async function scanBox() {
    if (!shipmentId) return;
    if (scanning) return;

    if (!selectedPalletId) {
      alert("Select pallet first");
      return;
    }

    const boxNo = scanInput.trim();
    if (!boxNo) return;

    if (String(selectedPallet?.status || "").toUpperCase() === "CANCELLED") {
      alert("Cancelled pallet cannot be scanned");
      return;
    }

    if (String(selectedPallet?.status || "").toUpperCase() === "CLOSED") {
      alert("Closed pallet cannot be scanned");
      return;
    }

    setScanning(true);
    try {
      const res = await fetch(`/api/shipment/${shipmentId}/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pallet_id: selectedPalletId,
          box_no: boxNo,
        }),
      });

      const json = await res.json();

      if (!json?.ok) {
        alert(json?.error || "scan failed");
        return;
      }

      setScanInput("");
      await load(shipmentId);
    } catch (e: any) {
      alert(e?.message || "scan failed");
    } finally {
      setScanning(false);
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 0);
    }
  }

  function handleScanSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (scanning) return;
    scanBox();
  }

  async function savePallet(close = false) {
    if (!shipmentId || !selectedPalletId) {
      alert("Select pallet first");
      return;
    }

    if (String(selectedPallet?.status || "").toUpperCase() === "CANCELLED") {
      alert("Cancelled pallet cannot be edited");
      return;
    }

    const payload = {
      length: safeNum(lengthInput),
      width: safeNum(widthInput),
      height: safeNum(heightInput),
      close,
    };

    if (close) {
      setClosingPallet(true);
    } else {
      setSavingPallet(true);
    }

    try {
      const res = await fetch(
        `/api/shipment/${shipmentId}/pallets/${selectedPalletId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();

      if (!json?.ok) {
        alert(json?.error || "failed to update pallet");
        return;
      }

      await load(shipmentId);
    } catch (e: any) {
      alert(e?.message || "failed to update pallet");
    } finally {
      setSavingPallet(false);
      setClosingPallet(false);
    }
  }

  async function cancelPallet() {
    if (!shipmentId || !selectedPalletId) {
      alert("Select pallet first");
      return;
    }

    if (String(selectedPallet?.status || "").toUpperCase() === "CANCELLED") {
      alert("Pallet already cancelled");
      return;
    }

    const ok = confirm("Cancel this pallet? Scanned boxes will be released.");
    if (!ok) return;

    setCancellingPallet(true);
    try {
      const res = await fetch(
        `/api/shipment/${shipmentId}/pallets/${selectedPalletId}/cancel`,
        {
          method: "POST",
        }
      );

      const json = await res.json();

      if (!json?.ok) {
        alert(json?.error || "failed to cancel pallet");
        return;
      }

      await load(shipmentId);
    } catch (e: any) {
      alert(e?.message || "failed to cancel pallet");
    } finally {
      setCancellingPallet(false);
    }
  }

  const [savingShipment, setSavingShipment] = useState(false);

  const allPalletsClosed = useMemo(() => {
    const active = pallets.filter(p => String(p.status || "").toUpperCase() !== "CANCELLED");
    return active.length > 0 && active.every(p => String(p.status || "").toUpperCase() === "CLOSED");
  }, [pallets]);

  async function handleShipmentSave() {
    if (!shipmentId) return;
    if (!allPalletsClosed) {
      alert("All pallets must be closed first");
      return;
    }

    const ok = confirm("모든 팔레트가 마감되었습니다. Shipment 상태를 업데이트하시겠습니까?");
    if (!ok) return;

    setSavingShipment(true);
    try {
      const res = await fetch(`/api/scm/shipment/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed");
      await load(shipmentId);
    } catch (e: any) {
      alert(e?.message || "Failed to save shipment");
    } finally {
      setSavingShipment(false);
    }
  }

  const selectedPalletScans = useMemo(
    () => recentScans.filter((x) => x.pallet_id === selectedPalletId),
    [recentScans, selectedPalletId]
  );

  const shipmentTotalBoxes = useMemo(
    () =>
      pallets
        .filter((row) => String(row.status || "").toUpperCase() !== "CANCELLED")
        .reduce((sum, row) => sum + safeNum(row.total_boxes), 0),
    [pallets]
  );

  const shipmentTotalQty = useMemo(
    () =>
      pallets
        .filter((row) => String(row.status || "").toUpperCase() !== "CANCELLED")
        .reduce((sum, row) => sum + safeNum(row.total_qty), 0),
    [pallets]
  );

  const shipmentTotalWeight = useMemo(
    () =>
      pallets
        .filter((row) => String(row.status || "").toUpperCase() !== "CANCELLED")
        .reduce((sum, row) => sum + safeNum(row.total_weight), 0),
    [pallets]
  );

  const shipmentTotalCbm = useMemo(
    () =>
      pallets
        .filter((row) => String(row.status || "").toUpperCase() !== "CANCELLED")
        .reduce((sum, row) => sum + safeNum(row.total_cbm), 0),
    [pallets]
  );

  const palletGrossWeightAuto = useMemo(
    () => safeNum(selectedPallet?.total_weight),
    [selectedPallet]
  );

  const palletDimensionCbm = useMemo(
    () =>
      calcCbm(
        safeNum(lengthInput),
        safeNum(widthInput),
        safeNum(heightInput)
      ),
    [lengthInput, widthInput, heightInput]
  );

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!header) {
    return <div className="p-6">Shipment not found</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{header.shipment_no}</h1>
          <div className="mt-1 text-sm text-gray-600">
            Status: {header.status}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleShipmentSave}
            disabled={savingShipment || !allPalletsClosed}
            className="rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {savingShipment ? "Saving..." : "Save Shipment"}
          </button>
          <button
            onClick={addPallet}
            disabled={creatingPallet}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {creatingPallet ? "Creating..." : "Add Pallet"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">Shipment Info</h2>
          <div className="space-y-2 text-sm">
            <div>BL No: {header.bl_no || "-"}</div>
            <div>ETA: {header.eta || "-"}</div>
            <div>ETD: {header.etd || "-"}</div>
            <div>Vessel: {header.vessel_name || "-"}</div>
            <div>Container: {header.container_no || "-"}</div>
            <div>Seal No: {header.seal_no || "-"}</div>
            <div>Remark: {header.remark || "-"}</div>
            <div>Created At: {fmtDateYmd(header.created_at) || "-"}</div>
            <div>Closed At: {fmtDateYmd(header.closed_at) || "-"}</div>
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
                  <div>Ship To: {row.ship_to || "-"}</div>
                  <div>Created: {fmtDateYmd(row.created_at) || "-"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">Scan</h2>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Pallet</label>
              <select
                value={selectedPalletId}
                onChange={(e) => setSelectedPalletId(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                <option value="">Select pallet</option>
                {pallets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.pallet_no} ({row.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Box No</label>

              <form onSubmit={handleScanSubmit} className="flex gap-2">
                <input
                  ref={scanInputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  className="flex-1 rounded border px-3 py-2 text-sm"
                  placeholder="Scan box label"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={
                    scanning ||
                    !selectedPalletId ||
                    !scanInput.trim() ||
                    String(selectedPallet?.status || "").toUpperCase() ===
                      "CANCELLED" ||
                    String(selectedPallet?.status || "").toUpperCase() ===
                      "CLOSED"
                  }
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {scanning ? "Scanning..." : "Scan"}
                </button>
              </form>
            </div>

            <div className="rounded border bg-gray-50 p-3 text-sm">
              <div>Pallet: {selectedPallet?.pallet_no || "-"}</div>
              <div>Status: {selectedPallet?.status || "-"}</div>
              <div>Boxes: {selectedPallet?.total_boxes ?? 0}</div>
              <div>Qty: {selectedPallet?.total_qty ?? 0}</div>
              <div>Gross Weight (Auto): {palletGrossWeightAuto}</div>
              <div>CBM (Box Sum): {selectedPallet?.total_cbm ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 font-medium">Pallet Dimension</h2>

          {selectedPallet ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Selected: {selectedPallet.pallet_no} / {selectedPallet.status}
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Length (cm)
                  </label>
                  <input
                    value={lengthInput}
                    onChange={(e) => setLengthInput(e.target.value)}
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="ex. 110"
                    disabled={
                      String(selectedPallet.status || "").toUpperCase() ===
                      "CANCELLED"
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Width (cm)
                  </label>
                  <input
                    value={widthInput}
                    onChange={(e) => setWidthInput(e.target.value)}
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="ex. 110"
                    disabled={
                      String(selectedPallet.status || "").toUpperCase() ===
                      "CANCELLED"
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Height (cm)
                  </label>
                  <input
                    value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="ex. 150"
                    disabled={
                      String(selectedPallet.status || "").toUpperCase() ===
                      "CANCELLED"
                    }
                  />
                </div>

                <div className="rounded border bg-gray-50 p-3 text-sm">
                  <div className="text-gray-500">Gross Weight (Auto)</div>
                  <div className="mt-1 text-lg font-semibold">
                    {palletGrossWeightAuto}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-3">
                  <div className="text-gray-500">Dimension CBM</div>
                  <div className="mt-1 text-lg font-semibold">
                    {palletDimensionCbm.toFixed(3)}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Boxes</div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedPallet.total_boxes}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Qty</div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedPallet.total_qty}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => savePallet(false)}
                  disabled={
                    savingPallet ||
                    closingPallet ||
                    cancellingPallet ||
                    String(selectedPallet.status || "").toUpperCase() ===
                      "CANCELLED"
                  }
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {savingPallet ? "Saving..." : "Save Dimension"}
                </button>

                <button
                  onClick={() => savePallet(true)}
                  disabled={
                    savingPallet ||
                    closingPallet ||
                    cancellingPallet ||
                    String(selectedPallet.status || "").toUpperCase() ===
                      "CANCELLED"
                  }
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {closingPallet ? "Closing..." : "Close Pallet"}
                </button>

                <button
                  onClick={cancelPallet}
                  disabled={
                    !selectedPalletId ||
                    cancellingPallet ||
                    String(selectedPallet.status || "").toUpperCase() ===
                      "CANCELLED"
                  }
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {cancellingPallet ? "Cancelling..." : "Cancel Pallet"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Select pallet first</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-medium">Shipment Summary</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div className="rounded border p-3">
            <div className="text-gray-500">Pallet</div>
            <div className="mt-1 text-lg font-semibold">{pallets.length}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-gray-500">Boxes</div>
            <div className="mt-1 text-lg font-semibold">
              {shipmentTotalBoxes}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-gray-500">Qty</div>
            <div className="mt-1 text-lg font-semibold">
              {shipmentTotalQty}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-gray-500">Weight / CBM</div>
            <div className="mt-1 text-lg font-semibold">
              {shipmentTotalWeight} / {shipmentTotalCbm}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-medium">Pallet</h2>

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
                    <td className="px-3 py-2">{row.length || 0}</td>
                    <td className="px-3 py-2">{row.width || 0}</td>
                    <td className="px-3 py-2">{row.height || 0}</td>
                    <td className="px-3 py-2">{fmtDateYmd(row.created_at) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-medium">Recent Scan</h2>

        {recentScans.length === 0 ? (
          <div className="text-sm text-gray-500">No scanned box</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-3">Scanned At</th>
                  <th className="px-3 py-3">Pallet</th>
                  <th className="px-3 py-3">Box Barcode</th>
                  <th className="px-3 py-3">Carton No</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Weight</th>
                  <th className="px-3 py-3">CBM</th>
                </tr>
              </thead>
              <tbody>
                {recentScans.map((row) => {
                  const pallet = pallets.find((x) => x.id === row.pallet_id);
                  return (
                    <tr
                      key={row.id}
                      className={`border-t ${
                        row.pallet_id === selectedPalletId ? "bg-yellow-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2">{fmtDateYmd(row.scanned_at) || "-"}</td>
                      <td className="px-3 py-2">{pallet?.pallet_no || "-"}</td>
                      <td className="px-3 py-2 font-medium">{row.box_barcode}</td>
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

      {selectedPalletId && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">Selected Pallet Recent Scan</h2>

          {selectedPalletScans.length === 0 ? (
            <div className="text-sm text-gray-500">
              No scan for selected pallet
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-3">Scanned At</th>
                    <th className="px-3 py-3">Box Barcode</th>
                    <th className="px-3 py-3">Carton No</th>
                    <th className="px-3 py-3">Qty</th>
                    <th className="px-3 py-3">Weight</th>
                    <th className="px-3 py-3">CBM</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPalletScans.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{fmtDateYmd(row.scanned_at) || "-"}</td>
                      <td className="px-3 py-2 font-medium">{row.box_barcode}</td>
                      <td className="px-3 py-2">{row.carton_no || "-"}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                      <td className="px-3 py-2">{row.weight}</td>
                      <td className="px-3 py-2">{row.cbm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}