import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/authz";
import BuyerSidebar from "@/components/buyer/buyer-sidebar";

export default async function BuyerGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile;
  try {
    profile = await getCurrentUserProfile();
  } catch {
    redirect("/buyer-login");
  }

  // Only BUYER and ADMIN can access buyer portal
  if (profile.role !== "BUYER" && profile.role !== "ADMIN") {
    redirect("/buyer-login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <BuyerSidebar />
      <main style={{ flex: 1, minWidth: 0, padding: 32 }}>{children}</main>
    </div>
  );
}
