import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requirePasswordChangeResolved() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/vendor-login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, vendor_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    redirect("/vendor-login");
  }

  if (profile.user_type !== "vendor") {
    return;
  }

 
}