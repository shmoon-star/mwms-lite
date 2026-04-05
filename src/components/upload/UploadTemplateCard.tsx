"use client";

type UploadTemplateCardProps = {
  title: string;
  description?: string;
  headers: string[];
  sampleRows?: (string | number)[][];
  onDownloadTemplate?: () => void;
  uploadSlot?: React.ReactNode;
};

export default function UploadTemplateCard({
  title,
  description,
  headers,
  sampleRows = [],
  onDownloadTemplate,
  uploadSlot,
}: UploadTemplateCardProps) {
  const templatePreview = [
    headers.join(","),
    ...sampleRows.map((row) => row.join(",")),
  ].join("\n");

  return (
    <div className="upload-card">
      <div className="upload-card-title">{title}</div>
      {description && <div className="upload-card-desc">{description}</div>}

      <div className="upload-actions">
        {onDownloadTemplate && (
          <button type="button" className="upload-btn" onClick={onDownloadTemplate}>
            Download Template
          </button>
        )}
        {uploadSlot}
      </div>

      <div className="upload-template-box">
        <div className="upload-template-title">CSV Template Preview</div>
        <div className="upload-template-code">{templatePreview}</div>
      </div>
    </div>
  );
}