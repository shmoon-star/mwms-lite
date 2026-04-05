"use client";

import { useMemo, useState } from "react";
import UploadSummaryCard from "@/components/upload/UploadSummaryCard";
import UploadPreviewGrid, { PreviewRow } from "@/components/upload/UploadPreviewGrid";

type Props = {
  dnId: string;
};

export default function DNBulkUploadPanel({ dnId }: Props) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);

  const summary = useMemo(() => {
    return {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.validationStatus === "VALID").length,
      errorRows: rows.filter((r) => r.validationStatus === "INVALID").length,
      selectedRows: rows.filter((r) => r.isSelected).length,
      appliedRows: rows.filter((r) => r.validationStatus === "APPLIED").length,
    };
  }, [rows]);

  const handleTemplateDownload = () => {
    window.open(`/api/dn/bulk/template?dnId=${dnId}`, "_blank");
  };

  const handleMockUpload = async () => {
    const payload = {
      dnId,
      fileName: "dn_upload.csv",
      rows: [
        { sku: "SKU-001", qty_to_ship: 100 },
        { sku: "SKU-002", qty_to_ship: 50 },
      ],
    };

    const res = await fetch("/api/dn/bulk/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Upload failed");
      return;
    }

    setUploadJobId(data.uploadJobId);
    setRows(
      (data.lines ?? []).map((line: any) => ({
        id: line.id,
        sku: line.sku,
        expectedQty: line.expectedQty,
        currentQty: null,
        uploadedQty: line.inputQty,
        validationStatus: line.validationStatus,
        validationMessage: line.validationMessage,
        isSelected: line.isSelected,
      }))
    );
  };

  const handleShip = async () => {
    if (!uploadJobId) return;

    const selectedLineIds = rows
      .filter((r) => r.isSelected && r.validationStatus === "VALID" && r.id)
      .map((r) => r.id!);

    const res = await fetch("/api/dn/bulk/ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadJobId, selectedLineIds }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Ship failed");
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        selectedLineIds.includes(row.id ?? "")
          ? { ...row, validationStatus: "APPLIED", isSelected: false }
          : row
      )
    );
  };

  const toggleRow = (index: number, checked: boolean) => {
    setRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, isSelected: checked } : row))
    );
  };

  const selectAllValid = () => {
    setRows((prev) =>
      prev.map((row) =>
        row.validationStatus === "VALID" ? { ...row, isSelected: true } : row
      )
    );
  };

  const clearSelection = () => {
    setRows((prev) => prev.map((row) => ({ ...row, isSelected: false })));
  };

  return (
    <div className="space-y-4 rounded border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">DN Bulk Upload</h3>
        <div className="flex gap-2">
          <button onClick={handleTemplateDownload} className="rounded border px-3 py-2">
            Export Template
          </button>
          <button onClick={handleMockUpload} className="rounded border px-3 py-2">
            Upload CSV
          </button>
          <button onClick={handleShip} className="rounded border px-3 py-2" disabled={!uploadJobId}>
            Ship Selected
          </button>
        </div>
      </div>

      <UploadSummaryCard {...summary} />

      <UploadPreviewGrid
        rows={rows}
        expectedQtyLabel="Reserved Qty"
        currentQtyLabel="Current Shipped"
        uploadedQtyLabel="Uploaded Ship Qty"
        onToggleRow={toggleRow}
        onSelectAllValid={selectAllValid}
        onClearSelection={clearSelection}
      />
    </div>
  );
}