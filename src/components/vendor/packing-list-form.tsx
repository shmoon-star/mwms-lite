"use client";

import { useState } from "react";

type Line = {
  line_no: number;
  sku: string;
  style_code?: string;
  color?: string;
  size?: string;
  description?: string;
  carton_no?: string;
  qty_per_carton?: number;
  carton_qty?: number;
  qty?: number;
  unit_weight?: number;
  gross_weight?: number;
  net_weight?: number;
  cbm?: number;
  po_no?: string;
  po_line_no?: string;
  asn_no?: string;
};

export default function PackingListForm() {
  const [poNo, setPoNo] = useState("");
  const [asnNo, setAsnNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [shipmentNo, setShipmentNo] = useState("");
  const [shipFrom, setShipFrom] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const [remarks, setRemarks] = useState("");

  const [lines, setLines] = useState<Line[]>([
    {
      line_no: 1,
      sku: "",
      qty_per_carton: 0,
      carton_qty: 0,
      qty: 0,
      unit_weight: 0,
      gross_weight: 0,
      net_weight: 0,
      cbm: 0,
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [createdId, setCreatedId] = useState<string | null>(null);

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
      },
    ]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/vendor/packing-lists", {
        method: "POST",
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
          lines: lines.map((line) => ({
            ...line,
            po_no: line.po_no || poNo || null,
            asn_no: line.asn_no || asnNo || null,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to create packing list");
      }

      setCreatedId(json.header.id);
      setResult(`저장 완료: ${json.header.pl_no}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setResult(`에러: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitPackingList() {
    if (!createdId) {
      setResult("먼저 저장(Create)부터 해야 합니다.");
      return;
    }

    setSubmitLoading(true);

    try {
      const res = await fetch(`/api/vendor/packing-lists/${createdId}/submit`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to submit packing list");
      }

      setResult(`제출 완료: ${json.header.pl_no} / 상태: ${json.header.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setResult(`에러: ${message}`);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="space-y-6 border rounded p-4">
      <div className="grid grid-cols-2 gap-4">
        <input
          className="border rounded px-3 py-2"
          placeholder="PO No"
          value={poNo}
          onChange={(e) => setPoNo(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="ASN No"
          value={asnNo}
          onChange={(e) => setAsnNo(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Invoice No"
          value={invoiceNo}
          onChange={(e) => setInvoiceNo(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Shipment No"
          value={shipmentNo}
          onChange={(e) => setShipmentNo(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Ship From"
          value={shipFrom}
          onChange={(e) => setShipFrom(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Ship To"
          value={shipTo}
          onChange={(e) => setShipTo(e.target.value)}
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={etd}
          onChange={(e) => setEtd(e.target.value)}
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={eta}
          onChange={(e) => setEta(e.target.value)}
        />
      </div>

      <textarea
        className="border rounded px-3 py-2 w-full"
        placeholder="Remarks"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />

      <div className="space-y-4">
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-4 gap-2 border rounded p-3">
            <input
              className="border rounded px-2 py-1"
              placeholder="SKU"
              value={line.sku}
              onChange={(e) => updateLine(index, "sku", e.target.value)}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Style Code"
              value={line.style_code ?? ""}
              onChange={(e) => updateLine(index, "style_code", e.target.value)}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Color"
              value={line.color ?? ""}
              onChange={(e) => updateLine(index, "color", e.target.value)}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Size"
              value={line.size ?? ""}
              onChange={(e) => updateLine(index, "size", e.target.value)}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="Carton No"
              value={line.carton_no ?? ""}
              onChange={(e) => updateLine(index, "carton_no", e.target.value)}
            />
            <input
              type="number"
              className="border rounded px-2 py-1"
              placeholder="Qty per Carton"
              value={line.qty_per_carton ?? 0}
              onChange={(e) =>
                updateLine(index, "qty_per_carton", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="border rounded px-2 py-1"
              placeholder="Carton Qty"
              value={line.carton_qty ?? 0}
              onChange={(e) =>
                updateLine(index, "carton_qty", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="border rounded px-2 py-1"
              placeholder="Qty"
              value={line.qty ?? 0}
              onChange={(e) => updateLine(index, "qty", Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={addLine} className="border rounded px-4 py-2">
          Add Line
        </button>

        <button type="submit" disabled={loading} className="border rounded px-4 py-2">
          {loading ? "Saving..." : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={handleSubmitPackingList}
          disabled={submitLoading || !createdId}
          className="border rounded px-4 py-2"
        >
          {submitLoading ? "Submitting..." : "Submit"}
        </button>
      </div>

      {result && <div className="text-sm whitespace-pre-wrap">{result}</div>}
    </form>
  );
}