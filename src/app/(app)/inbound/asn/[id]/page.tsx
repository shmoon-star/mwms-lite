import ASNDetailClient from "./ASNDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <ASNDetailClient id={id} />;
}