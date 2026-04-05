"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Line = {
  id?: string;
  line_no: number;
  sku: string;
  style_code?: string | null;
  color?: string | null;
  size?: string | null;
  description?: string | null;
  carton_no?: string | null;
  qty_per_carton?: number;
  carton_qty?: number;
  qty?: number;
  unit_weight?: number;
  gross_weight?: number;
  net_weight?: number;
  cbm?: number;
  po_no?: string | null;
  po_line_no?: string | null;
  asn_no?: string | null;
};

type Props = {
  packingListId: string;
  initialHeader: {
    po_no: string | null;
    asn_no: string | null;
    invoice_no: string | null;
    shipment_no: string | null;
    ship_from: string | null;
    ship_to: string | null;
    etd: string | null;
    eta: string | null;
    remarks: string | null;
    source_type: "MANUAL" | "CSV";
    status: string;
  };
  initialLines: Line[];
};

export default function PackingListDetailForm({
  packingListId,
  initialHeader,
  initialLines,
}: Props) {
  const router = useRouter();

  const [poNo, setPoNo] = useState(initialHeader.po_no ?? "");
  const [asnNo, setAsnNo] = useState(initialHeader.asn_no ?? "");
  const [invoiceNo, setInvoiceNo] = useState(initialHeader.invoice_no ?? "");
  const [shipmentNo, setShipmentNo] = useState(initialHeader.shipment_no ?? "");
  const [shipFrom, setShipFrom] = useState(initialHeader.ship_from ?? "");
  const [shipTo, setShipTo] = useState(initialHeader.ship_to ?? "");
  const [etd, setEtd] = useState(initialHeader.etd ?? "");
  const [eta, setEta] = useState(initialHeader.eta ?? "");
  const [remarks, setRemarks] = useState(initialHeader.remarks ?? "");
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const editable = initialHeader.status === "DRAFT";

  function updateLine(index: number, key: keyof Line, value: string | number) {
    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              [key]: value,
            }
          : line
      )
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        line_no: prev.length + 1,
        sku: "",
        qty_per_carton: 0,
        carton_qty: 0,
        qty: 0,
        unit_weight: 0,
        gross_weight: 0,
        net_weight: 0,
        cbm: 0,
        po_no: poNo || null,
        asn_no: asnNo || null,
      },
    ]);
  }

  async function handleSave() {
    if (!editable) {
      setMessage("Only DRAFT can be edited.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/vendor/packing-lists/${packingListId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          po_no: poNo || null,
          asn_no: asnNo || null,
          invoice_no: invoiceNo || null,
          shipment_no: shipmentNo || null,
          ship_from: shipFrom || null,
          ship_to: shipTo || null,
          etd: etd || null,
          eta: eta || null,
          remarks: remarks || null,
          source_type: "MANUAL",
          lines: lines.map((line, idx) => ({
            line_no: line.line_no || idx + 1,
            sku: line.sku,
            style_code: line.style_code || null,
            color: line.color || null,
            size: line.size || null,
            description: line.description || null,
            carton_no: line.carton_no || null,
            qty_per_carton: Number(line.qty_per_carton || 0),
            carton_qty: Number(line.carton_qty || 0),
            qty: Number(line.qty || 0),
            unit_weight: Number(line.unit_weight || 0),
            gross_weight: Number(line.gross_weight || 0),
            net_weight: Number(line.net_weight || 0),
            cbm: Number(line.cbm || 0),
            po_no: line.po_no || poNo || null,
            po_line_no: line.po_line_no || null,
            asn_no: line.asn_no || asnNo || null,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to update packing list");
      }

      setMessage("Saved successfully");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {!editable && (
        <div className="text-sm border rounded p-3">
          This document is not editable because status is {initialHeader.status}.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <input
          className="border rounded px-3 py-2"
          placeholder="PO No"
          value={poNo}
          onChange={(e) => setPoNo(e.target.value)}
          disabled={!editable}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="ASN No"
          value={asnNo}
          onChange={(e) => setAsnNo(e.target.value)}
          disabled={!editable}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Invoice No"
          value={invoiceNo}
          onChange={(e) => setInvoiceNo(e.target.value)}
          disabled={!editable}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Shipment No"
          value={shipmentNo}
          onChange={(e) => setShipmentNo(e.target.value)}
          disabled={!editable}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Ship From"
          value={shipFrom}
          onChange={(e) => setShipFrom(e.target.value)}
          disabled={!editable}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Ship To"
          value={shipTo}
          onChange={(e) => setShipTo(e.target.value)}
          disabled={!editable}
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={etd}
          onChange={(e) => setEtd(e.target.value)}
          disabled={!editable}
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          disabled={!editable}
        />
      </div>

      <textarea
        className="border rounded px-3 py-2 w-full"
        placeholder="Remarks"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        disabled={!editable}
      />

      <div className="space-y-4">
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-4 gap-2 border rounded p-3">
            <input
              className="border rounded px-2 py-1"
              placeholder="SKU"
              value={line.sku}
              onChange={(e) => updateLine(index, "sku", e.target.value)}
              disabled={!editable}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Style Code"
              value={line.style_code ?? ""}
              onChange={(e) => updateLine(index, "style_code", e.target.value)}
              disabled={!editable}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Color"
              value={line.color ?? ""}
              onChange={(e) => updateLine(index, "color", e.target.value)}
              disabled={!editable}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Size"
              value={line.size ?? ""}
              onChange={(e) => updateLine(index, "size", e.target.value)}
              disabled={!editable}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Carton No"
              value={line.carton_no ?? ""}
              onChange={(e) => updateLine(index, "carton_no", e.target.value)}
              disabled={!editable}
            />
            <input
              type="number"
              className="border rounded px-2 py-1"
              placeholder="Qty per Carton"
              value={line.qty_per_carton ?? 0}
              onChange={(e) =>
                updateLine(index, "qty_per_carton", Number(e.target.value))
              }
              disabled={!editable}
            />
            <input
              type="number"
              className="border rounded px-2 py-1"
              placeholder="Carton Qty"
              value={line.carton_qty ?? 0}
              onChange={(e) =>
                updateLine(index, "carton_qty", Number(e.target.value))
              }
              disabled={!editable}
            />
            <input
              type="number"
              className="border rounded px-2 py-1"
              placeholder="Qty"
              value={line.qty ?? 0}
              onChange={(e) => updateLine(index, "qty", Number(e.target.value))}
              disabled={!editable}
            />
          </div>
        ))}
      </div>

      {editable && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addLine}
            className="border rounded px-4 py-2"
          >
            Add Line
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {message && <div className="text-sm">{message}</div>}
    </div>
  );
}