"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SkuRow = {
  sku: string;
  po_qty: number;
  pl_qty: number;
};

type Props = {
  packingListId: string;
  status: string;
};

export default function AdminPackingListActions({
  packingListId,
  status,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [skuRows, setSkuRows] = useState<SkuRow[] | null>(null);

  async function runAction(action: "review" | "confirm" | "cancel") {
    setLoading(true);
    setMessage("");
    setIsError(false);
    setSkuRows(null);

    try {
      const res = await fetch(`/api/admin/packing-lists/${packingListId}/${action}`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setIsError(true);

        // 수량 불일치(422) 시 SKU 비교 테이블 표시
        if (res.status === 422 && json.skuRows) {
          setSkuRows(json.skuRows);
        }

        throw new Error(json.error || `Failed to ${action}`);
      }

      if (action === "confirm" && json.asn?.asn_no) {
        setMessage(`CONFIRM 완료 / ASN 생성: ${json.asn.asn_no}`);
      } else {
        setMessage(`${action.toUpperCase()} 완료`);
      }

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 max-w-2xl">
      <div className="flex gap-2">
        {status === "SUBMITTED" && (
          <button
            type="button"
            onClick={() => runAction("review")}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            Review
          </button>
        )}

        {status === "REVIEWED" && (
          <button
            type="button"
            onClick={() => runAction("confirm")}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            Confirm + Create ASN
          </button>
        )}

        {(status === "SUBMITTED" || status === "REVIEWED") && (
          <button
            type="button"
            onClick={() => runAction("cancel")}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            Cancel
          </button>
        )}
      </div>

      {message && (
        <div
          className="text-sm"
          style={{ color: isError ? "#991b1b" : "#166534" }}
        >
          {isError ? "❌ " : "✅ "}{message}
        </div>
      )}

      {/* SKU 수량 비교 테이블 (불일치 시) */}
      {skuRows && skuRows.length > 0 && (
        <div
          style={{
            marginTop: 8,
            border: "1px solid #fecaca",
            borderRadius: 8,
            overflow: "hidden",
            fontSize: 13,
            width: "100%",
            maxWidth: 520,
          }}
        >
          <div
            style={{
              background: "#fef2f2",
              padding: "8px 14px",
              fontWeight: 600,
              color: "#991b1b",
              borderBottom: "1px solid #fecaca",
            }}
          >
            발주수량 vs 포장수량 비교
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fef2f2" }}>
                <th style={thStyle}>SKU</th>
                <th style={{ ...thStyle, textAlign: "right" }}>발주 수량 (PO)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>포장 수량 (PL)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>차이</th>
              </tr>
            </thead>
            <tbody>
              {skuRows.map((row) => {
                const diff = row.pl_qty - row.po_qty;
                const mismatch = diff !== 0;
                return (
                  <tr
                    key={row.sku}
                    style={{
                      borderTop: "1px solid #fecaca",
                      background: mismatch ? "#fff7f7" : "#fff",
                    }}
                  >
                    <td style={tdStyle}>{row.sku}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{row.po_qty}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        color: mismatch ? "#991b1b" : undefined,
                        fontWeight: mismatch ? 700 : undefined,
                      }}
                    >
                      {row.pl_qty}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        color: diff > 0 ? "#b45309" : diff < 0 ? "#991b1b" : "#166534",
                        fontWeight: mismatch ? 700 : undefined,
                      }}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "6px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#7f1d1d",
  fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
};
