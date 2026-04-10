import { Suspense } from "react";
import BuyerLoginClient from "./BuyerLoginClient";

export default function BuyerLoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <BuyerLoginClient />
    </Suspense>
  );
}
