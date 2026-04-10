import PackingListNewClient from "./PackingListNewClient";

type Props = {
  searchParams: Promise<{ po_no?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const { po_no } = await searchParams;
  return <PackingListNewClient initialPoNo={po_no ?? ""} />;
}
