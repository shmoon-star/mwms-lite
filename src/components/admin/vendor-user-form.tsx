"use client";

import { useState } from "react";

type Props = {
  vendorId: string;
};

export default function VendorUserForm({ vendorId }: Props) {
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState<"vendor_admin" | "vendor_user">("vendor_user");
  const [initialPassword, setInitialPassword] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "LOCKED">("ACTIVE");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult("");

    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          user_name: userName,
          role,
          initial_password: initialPassword,
          status,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to create vendor user");
      }

      setResult(
        `생성 완료: ${json.user.email} / 임시비밀번호: ${json.login.temporary_password}`
      );

      setEmail("");
      setUserName("");
      setRole("vendor_user");
      setInitialPassword("");
      setStatus("ACTIVE");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setResult(`에러: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded p-4">
      <div>
        <label className="block text-sm mb-1">Email</label>
        <input
          className="border rounded px-3 py-2 w-full"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vendor.user@abc.com"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">User Name</label>
        <input
          className="border rounded px-3 py-2 w-full"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Vendor User"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Role</label>
        <select
          className="border rounded px-3 py-2 w-full"
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "vendor_admin" | "vendor_user")
          }
        >
          <option value="vendor_user">vendor_user</option>
          <option value="vendor_admin">vendor_admin</option>
        </select>
      </div>

      <div>
        <label className="block text-sm mb-1">Initial Password</label>
        <input
          type="text"
          className="border rounded px-3 py-2 w-full"
          value={initialPassword}
          onChange={(e) => setInitialPassword(e.target.value)}
          placeholder="Temp1234!"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Status</label>
        <select
          className="border rounded px-3 py-2 w-full"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "ACTIVE" | "INACTIVE" | "LOCKED")
          }
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="LOCKED">LOCKED</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="border rounded px-4 py-2"
      >
        {loading ? "Creating..." : "Create Vendor User"}
      </button>

      {result && <div className="text-sm whitespace-pre-wrap">{result}</div>}
    </form>
  );
}