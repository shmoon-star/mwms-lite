"use client";

export type PreviewRow = {
  id?: string;
  lineNo?: number;
  sku: string;
  expectedQty: number | null;
  currentQty?: number | null;
  uploadedQty: number | null;
  validationStatus: "VALID" | "INVALID" | "APPLIED" | "PENDING" | "SKIPPED";
  validationMessage: string | null;
  isSelected: boolean;
};

type Props = {
  rows: PreviewRow[];
  expectedQtyLabel: string;
  currentQtyLabel: string;
  uploadedQtyLabel: string;
  onToggleRow?: (rowIndex: number, checked: boolean) => void;
  onSelectAllValid?: () => void;
  onClearSelection?: () => void;
};

export default function UploadPreviewGrid({
  rows,
  expectedQtyLabel,
  currentQtyLabel,
  uploadedQtyLabel,
  onToggleRow,
  onSelectAllValid,
  onClearSelection,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={onSelectAllValid} className="rounded border px-3 py-1">
          Select All Uploaded
        </button>
        <button type="button" onClick={onClearSelection} className="rounded border px-3 py-1">
          Clear Selection
        </button>
      </div>

      <div className="overflow-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Select</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">{expectedQtyLabel}</th>
              <th className="px-3 py-2 text-left">{currentQtyLabel}</th>
              <th className="px-3 py-2 text-left">{uploadedQtyLabel}</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const disabled =
                row.validationStatus === "INVALID" || row.validationStatus === "APPLIED";

              return (
                <tr key={`${row.sku}-${idx}`} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.isSelected}
                      disabled={disabled}
                      onChange={(e) => onToggleRow?.(idx, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2">{row.sku}</td>
                  <td className="px-3 py-2">{row.expectedQty ?? "-"}</td>
                  <td className="px-3 py-2">{row.currentQty ?? "-"}</td>
                  <td className="px-3 py-2">{row.uploadedQty ?? "-"}</td>
                  <td className="px-3 py-2">{row.validationStatus}</td>
                  <td className="px-3 py-2">{row.validationMessage ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}