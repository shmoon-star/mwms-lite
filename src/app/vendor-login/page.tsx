import { Suspense } from "react";
import VendorLoginClient from "./VendorLoginClient";

export default function VendorLoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <VendorLoginClient />
    </Suspense>
  );
}