import DNDetailClient from "./DNDetailClient";

export default async function DNDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DNDetailClient id={id} />;
}