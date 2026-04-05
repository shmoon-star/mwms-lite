// src/lib/vendor-scope.ts
import type { CurrentUserProfile } from "@/lib/authz";

type ScopedQuery = {
  eq: (column: string, value: any) => any;
};

export function applyUuidVendorScope<T extends ScopedQuery>(
  query: T,
  profile: CurrentUserProfile,
  vendorColumn: string = "vendor_id"
): T {
  if (profile.role === "ADMIN") {
    return query;
  }

  if (!profile.vendor_id) {
    throw new Error("Forbidden");
  }

  return query.eq(vendorColumn, profile.vendor_id);
}

export function applyVendorCodeScope<T extends ScopedQuery>(
  query: T,
  profile: CurrentUserProfile,
  vendorCode: string | null | undefined,
  vendorColumn: string = "vendor_id"
): T {
  if (profile.role === "ADMIN") {
    return query;
  }

  if (!vendorCode) {
    throw new Error("Forbidden");
  }

  return query.eq(vendorColumn, vendorCode);
}