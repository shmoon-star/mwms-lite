export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const escapeCell = (value: string | number | null | undefined) => {
    const str = String(value ?? "");

    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  };

  const csvRows = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];

  return csvRows.join("\n");
}

export function buildCsvDownloadResponse(params: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  const csv = buildCsv(params.headers, params.rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${params.filename}"`,
    },
  });
}