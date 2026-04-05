import WmsSidebar from "@/components/WmsSidebar";

export default function WmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <WmsSidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}