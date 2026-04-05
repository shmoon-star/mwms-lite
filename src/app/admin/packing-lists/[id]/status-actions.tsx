"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  packingListId: string;
  status: string;
};

export default function AdminPackingListActions({
  packingListId,
  status,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runAction(action: "review" | "confirm" | "cancel") {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/admin/packing-lists/${packingListId}/${action}`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Failed to ${action}`);
      }

      if (action === "confirm" && json.asn?.asn_no) {
        setMessage(`CONFIRM 완료 / ASN 생성: ${json.asn.asn_no}`);
      } else {
        setMessage(`${action.toUpperCase()} 완료`);
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "SUBMITTED" && (
          <button
            type="button"
            onClick={() => runAction("review")}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            Review
          </button>
        )}

        {status === "REVIEWED" && (
          <button
            type="button"
            onClick={() => runAction("confirm")}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            Confirm + Create ASN
          </button>
        )}

        {(status === "SUBMITTED" || status === "REVIEWED") && (
          <button
            type="button"
            onClick={() => runAction("cancel")}
            disabled={loading}
            className="border rounded px-4 py-2"
          >
            Cancel
          </button>
        )}
      </div>

      {message && <div className="text-sm">{message}</div>}
    </div>
  );
}