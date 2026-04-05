"use client";

import React, { useRef, useState } from "react";

type Props = {
  uploadUrl: string;
  onUploaded?: () => void | Promise<void>;
  accept?: string;
  buttonLabel?: string;
};

export default function CsvUploadButton({
  uploadUrl,
  onUploaded,
  accept = ".csv",
  buttonLabel = "Upload CSV",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [working, setWorking] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setWorking(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Upload failed");
      }

      alert("CSV 업로드 완료");
      await onUploaded?.();
    } catch (e: any) {
      alert(e?.message ?? "Upload failed");
    } finally {
      setWorking(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={working}
      >
        {working ? "Uploading..." : buttonLabel}
      </button>
    </>
  );
}