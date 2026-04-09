"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  packingListId: string;
  disabled?: boolean;
};

export default function CsvImportButton({
  packingListId,
  disabled = false,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function handleOpenFileDialog() {
    if (disabled || loading) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `/api/vendor/packing-lists/${packingListId}/lines/import`,
        {
          method: "POST",
          body: formData,
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to import CSV");
      }

      setMessage(`CSV import 완료: ${json.lines?.length ?? 0} lines`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessage(message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <button
        type="button"
        onClick={handleOpenFileDialog}
        disabled={disabled || loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 16px",
          border: "1.5px solid #6b7280",
          borderRadius: 6,
          background: "#fff",
          color: "#111827",
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled || loading ? "not-allowed" : "pointer",
          opacity: disabled || loading ? 0.4 : 1,
          whiteSpace: "nowrap",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        {loading ? "⏳ 가져오는 중..." : "📎 CSV 가져오기"}
      </button>

      {message && (
        <div style={{
          fontSize: 12,
          padding: "6px 10px",
          borderRadius: 6,
          background: message.includes("완료") ? "#f0fdf4" : "#fef2f2",
          color: message.includes("완료") ? "#166534" : "#991b1b",
          border: `1px solid ${message.includes("완료") ? "#bbf7d0" : "#fecaca"}`,
        }}>
          {message}
        </div>
      )}
    </div>
  );
}