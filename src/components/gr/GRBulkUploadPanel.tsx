"use client";

import { useMemo, useState } from "react";
import UploadSummaryCard from "@/components/upload/UploadSummaryCard";
import UploadPreviewGrid, { PreviewRow } from "@/components/upload/UploadPreviewGrid";

type Props = {
  asnId: string;
};

export default function GRBulkUploadPanel({ asnId }: Props) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    window.open(`/api/gr/bulk/template?asnId=${asnId}`, "_blank");
  };

  const handleMockUpload = async () => {
    setLoading(true);
    try {
      // 실제로는 CSV 파싱 결과를 rows에 넣어서 보낼 것
      const payload = {
        asnId,
        fileName: "gr_upload.csv",
        rows: [
          { sku: "SKU-001", qty_received: 100 },
          { sku: "SKU-002", qty_received: 50 },
        ],
      };

      const res = await fetch("/api/gr/bulk/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

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
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!uploadJobId) return;

    const selectedLineIds = rows
      .filter((r) => r.isSelected && r.validationStatus === "VALID" && r.id)
      .map((r) => r.id!) ;

    const res = await fetch("/api/gr/bulk/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadJobId, selectedLineIds }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Apply failed");
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
        <h3 className="text-lg font-semibold">GR Bulk Upload</h3>
        <div className="flex gap-2">
          <button onClick={handleTemplateDownload} className="rounded border px-3 py-2">
            Export Template
          </button>
          <button onClick={handleMockUpload} className="rounded border px-3 py-2" disabled={loading}>
            Upload CSV
          </button>
          <button onClick={handleApply} className="rounded border px-3 py-2" disabled={!uploadJobId}>
            Apply Uploaded Qty
          </button>
        </div>
      </div>

      <UploadSummaryCard {...summary} />

      <UploadPreviewGrid
        rows={rows}
        expectedQtyLabel="Expected Qty"
        currentQtyLabel="Current Received"
        uploadedQtyLabel="Uploaded Qty"
        onToggleRow={toggleRow}
        onSelectAllValid={selectAllValid}
        onClearSelection={clearSelection}
      />
    </div>
  );
}