import WmsSidebar from "@/components/WmsSidebar";

export default function WmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <WmsSidebar />
      <main style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>{children}</main>
    </div>
  );
}