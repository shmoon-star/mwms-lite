import PickingLabelsClient from "./PickingLabelsClient";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sku?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawSku = sp?.sku;
  const sku = Array.isArray(rawSku) ? rawSku[0] : rawSku ?? "";

  return <PickingLabelsClient asnId={id} sku={sku} />;
}
