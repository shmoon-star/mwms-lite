import PackingListDetailClient from "./PackingListDetailClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PackingListDetailClient id={id} />;
}