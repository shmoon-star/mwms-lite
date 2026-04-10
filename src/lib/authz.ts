// src/lib/authz.ts
import { createClient } from "@/lib/supabase/server";

export type AppRole = "ADMIN" | "VENDOR" | "BUYER";

export type CurrentUserProfile = {
  id: string;
  auth_user_id: string;
  email: string | null;
  user_type: string | null;
  role: AppRole;
  vendor_id: string | null; // uuid
  buyer_id: string | null;  // uuid
  status: string | null;
};

export type CurrentVendorInfo = {
  id: string; // uuid
  vendor_code: string;
  vendor_name: string | null;
};

export type CurrentBuyerInfo = {
  id: string;
  buyer_code: string;
  buyer_name: string | null;
};

export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  const sb = await createClient();

  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await sb
    .from("user_profiles")
    .select("id, auth_user_id, email, user_type, role, vendor_id, buyer_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("User profile not found");
  }

  const role = (profile.role || profile.user_type || "VENDOR").toUpperCase() as AppRole;

  if (!["ADMIN", "VENDOR", "BUYER"].includes(role)) {
    throw new Error("Invalid user role");
  }

  if (role === "VENDOR" && !profile.vendor_id) {
    throw new Error("Vendor user has no vendor_id");
  }

  if (role === "BUYER" && !profile.buyer_id) {
    throw new Error("Buyer user has no buyer_id");
  }

  if (profile.status && profile.status !== "ACTIVE") {
    throw new Error("User is inactive");
  }

  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    email: profile.email ?? user.email ?? null,
    user_type: profile.user_type ?? null,
    role,
    vendor_id: profile.vendor_id ?? null,
    buyer_id: profile.buyer_id ?? null,
    status: profile.status ?? null,
  };
}

export async function getCurrentVendorInfo(
  profile: CurrentUserProfile
): Promise<CurrentVendorInfo | null> {
  if (!profile.vendor_id) return null;

  const sb = await createClient();

  const { data, error } = await sb
    .from("vendor")
    .select("id, vendor_code, vendor_name")
    .eq("id", profile.vendor_id)
    .single();

  if (error || !data) {
    throw new Error("Vendor master not found");
  }

  return {
    id: data.id,
    vendor_code: data.vendor_code,
    vendor_name: data.vendor_name ?? null,
  };
}

export async function getCurrentBuyerInfo(
  profile: CurrentUserProfile
): Promise<CurrentBuyerInfo | null> {
  if (!profile.buyer_id) return null;

  const sb = await createClient();

  const { data, error } = await sb
    .from("buyer")
    .select("id, buyer_code, buyer_name")
    .eq("id", profile.buyer_id)
    .single();

  if (error || !data) {
    throw new Error("Buyer master not found");
  }

  return {
    id: data.id,
    buyer_code: data.buyer_code,
    buyer_name: data.buyer_name ?? null,
  };
}

export function isAdmin(profile: CurrentUserProfile) {
  return profile.role === "ADMIN";
}

export function assertUuidVendorAccess(
  profile: CurrentUserProfile,
  targetVendorId: string | null | undefined
) {
  if (profile.role === "ADMIN") return;

  if (!profile.vendor_id) {
    throw new Error("Forbidden");
  }

  if (!targetVendorId || profile.vendor_id !== targetVendorId) {
    throw new Error("Forbidden");
  }
}

export function assertVendorCodeAccess(
  profile: CurrentUserProfile,
  myVendorCode: string | null | undefined,
  targetVendorCode: string | null | undefined
) {
  if (profile.role === "ADMIN") return;

  if (!myVendorCode || !targetVendorCode) {
    throw new Error("Forbidden");
  }

  if (myVendorCode !== targetVendorCode) {
    throw new Error("Forbidden");
  }
}

/** BUYER or ADMIN can access buyer pages */
export function assertBuyerAccess(
  profile: CurrentUserProfile,
  targetBuyerId?: string | null
) {
  if (profile.role === "ADMIN") return;

  if (profile.role !== "BUYER") {
    throw new Error("Forbidden");
  }

  if (!profile.buyer_id) {
    throw new Error("Forbidden");
  }

  if (targetBuyerId && profile.buyer_id !== targetBuyerId) {
    throw new Error("Forbidden");
  }
}
