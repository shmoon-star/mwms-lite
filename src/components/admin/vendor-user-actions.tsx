"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  user: {
    id: string;
    email: string;
    user_name: string;
    role: "vendor_admin" | "vendor_user";
    status: "ACTIVE" | "INACTIVE" | "LOCKED";
  };
};

export default function VendorUserActions({ user }: Props) {
  const router = useRouter();

  const [userName, setUserName] = useState(user.user_name);
  const [role, setRole] = useState<"vendor_admin" | "vendor_user">(user.role);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "LOCKED">(user.status);
  const [tempPassword, setTempPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/admin/vendor-users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_name: userName,
          role,
          status,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to update vendor user");
      }

      setMessage("사용자 정보 저장 완료");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!tempPassword) {
      setMessage("임시 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/admin/vendor-users/${user.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          temporary_password: tempPassword,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to reset password");
      }

      setMessage(`임시 비밀번호 재설정 완료: ${json.login.temporary_password}`);
      setTempPassword("");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input
          className="border rounded px-3 py-2 text-sm"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="User Name"
        />

        <select
          className="border rounded px-3 py-2 text-sm"
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "vendor_admin" | "vendor_user")
          }
        >
          <option value="vendor_user">vendor_user</option>
          <option value="vendor_admin">vendor_admin</option>
        </select>

        <select
          className="border rounded px-3 py-2 text-sm"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "ACTIVE" | "INACTIVE" | "LOCKED")
          }
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="LOCKED">LOCKED</option>
        </select>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="border rounded px-4 py-2 text-sm"
        >
          Save
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          className="border rounded px-3 py-2 text-sm"
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          placeholder="New Temporary Password"
        />

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={loading}
          className="border rounded px-4 py-2 text-sm"
        >
          Reset Password
        </button>
      </div>

      {message && <div className="text-sm">{message}</div>}
    </div>
  );
}