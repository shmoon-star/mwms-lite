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
    <div className="flex flex-col items-start gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        onClick={handleOpenFileDialog}
        disabled={disabled || loading}
        className="border rounded px-4 py-2"
      >
        {loading ? "Importing..." : "Import CSV"}
      </button>

      {message && <div className="text-sm">{message}</div>}
    </div>
  );
}