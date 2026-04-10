"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function BuyerLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const nextRaw = searchParams.get("next") || "/buyer/po";
  const next = nextRaw.startsWith("/") ? nextRaw : "/buyer/po";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.refresh();
    router.push(next);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f9fafb",
    }}>
      <div style={{
        width: 380,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 36,
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Buyer Portal</div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Sign in to view your orders</div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              placeholder="buyer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {errorMsg && (
            <div style={{
              marginBottom: 16,
              padding: "10px 12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              fontSize: 13,
              color: "#991b1b",
            }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px 0",
              background: loading ? "#9ca3af" : "#111827",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
