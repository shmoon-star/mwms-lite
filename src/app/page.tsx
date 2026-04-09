async function getProducts() {
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/api/products`, { cache: "no-store" });
  return res.json();
}

export default async function ProductsPage() {
  const result = await getProducts();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Overall Master</h1>

      {!result.ok && <p className="text-red-500">Error: {result.error}</p>}

      <table className="border w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">SKU</th>
            <th className="border px-2 py-1">Brand</th>
            <th className="border px-2 py-1">Name</th>
            <th className="border px-2 py-1">Barcode</th>
          </tr>
        </thead>
        <tbody>
          {(result.data ?? []).map((p: any) => (
            <tr key={p.id}>
              <td className="border px-2 py-1">{p.sku}</td>
              <td className="border px-2 py-1">{p.brand}</td>
              <td className="border px-2 py-1">{p.name}</td>
              <td className="border px-2 py-1">{p.barcode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
