"use client";

import { useEffect, useState } from "react";

export default function GRDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch(`/api/gr/${id}`);
    const json = await res.json();
    if (!json.ok) {
      setErr(json.error);
      return;
    }
    setData(json.data);
  }

  async function confirm() {
    await fetch(`/api/gr/${id}/confirm`, { method: "POST" });
    alert("Confirmed");
    load();
  }

  useEffect(() => {
    load();
  }, []);

  if (err) return <div>{err}</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h2>GR Detail</h2>
      <div>Status: {data.header.status}</div>

      <button onClick={confirm}>Confirm</button>

      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Expected</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l: any) => (
            <tr key={l.id}>
              <td>{l.sku}</td>
              <td>{l.qty_expected}</td>
              <td>{l.qty_received}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}