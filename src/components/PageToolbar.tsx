"use client";

import React from "react";

type Props = {
  onRefresh?: () => void;
  onDownloadCsv?: () => void;
  uploadSlot?: React.ReactNode;
};

export default function PageToolbar({
  onRefresh,
  onDownloadCsv,
  uploadSlot,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        marginBottom: 12,
      }}
    >
      {onRefresh ? <button onClick={onRefresh}>Refresh</button> : null}
      {onDownloadCsv ? <button onClick={onDownloadCsv}>Download CSV</button> : null}
      {uploadSlot}
    </div>
  );
}