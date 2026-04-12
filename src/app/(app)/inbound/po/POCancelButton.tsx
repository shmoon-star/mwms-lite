"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  poId: string;
  poNo: string | null;
  status: string | null;
};

const NON_CANCELLABLE = ["RECEIVED", "CLOSED", "CANCELLED"];

export default function POCancelButton({ poId, poNo, status }: Props) {
  const [working, setWorking] = useState(false);
  const router = useRouter();

  const s = String(status ?? "").toUpperCase();
  if (NON_CANCELLABLE.includes(s)) return null;

  async function handleCancel() {
    setWorking(true);
    try {
      // ── 1. 취소 전 영향 범위 사전 조회 ──────────────────────
      const checkRes = await fetch(`/api/po/${poId}/cancel`, { method: "GET" });
      const check = await checkRes.json();

      if (!check.ok) {
        alert(check.error || "조회 실패");
        return;
      }

      if (!check.can_cancel) {
        let msg = `이 PO는 취소할 수 없습니다.\n\n`;

        if ((check.blocking_asns ?? []).length > 0) {
          msg += `⛔ 입고(GR) 이력이 있는 ASN:\n`;
          msg += (check.blocking_asns as any[])
            .map((a: any) => `  • ${a.asn_no ?? "-"} [${a.status}]`)
            .join("\n");
          msg += `\n\n재고 수정이 필요하면 WMS → Adjustment를 사용하세요.\n`;
          msg += `남은 수량 처리는 새 ASN을 생성하여 진행하세요.`;
        }
        if ((check.blocking_pls ?? []).length > 0) {
          msg += `\n⛔ 입고 완료된 패킹리스트:\n`;
          msg += (check.blocking_pls as any[])
            .map((p: any) => `  • ${p.pl_no ?? "-"} [${p.status}]`)
            .join("\n");
        }

        alert(msg);
        return;
      }

      // ── 2. 영향 범위 정리 ──────────────────────────────────
      const activePls = (check.pls ?? []).filter(
        (pl: any) => !["CANCELED", "INBOUND_COMPLETED"].includes(String(pl.status).toUpperCase())
      );
      const activeAsns = (check.asns ?? []).filter(
        (a: any) => !["CANCELLED", "CLOSED", "RECEIVED"].includes(String(a.status).toUpperCase())
      );

      // ── 3. Confirm 다이얼로그 ──────────────────────────────
      const label = poNo ?? poId;
      let msg = `PO [${label}] 을 취소하시겠습니까?\n\n`;
      msg += `모든 레코드는 삭제되지 않고 이력으로 보존됩니다.\n\n`;

      if (activePls.length > 0) {
        msg += `⚠️ 아래 패킹리스트가 함께 취소됩니다 (${activePls.length}건):\n`;
        msg += activePls.map((pl: any) => `  • ${pl.pl_no ?? "-"} [${pl.status}]`).join("\n");
        msg += "\n\n";
      } else {
        msg += `• 연결된 활성 패킹리스트 없음\n\n`;
      }

      if (activeAsns.length > 0) {
        msg += `⚠️ 아래 ASN이 함께 취소됩니다 (${activeAsns.length}건):\n`;
        msg += activeAsns.map((a: any) => `  • ${a.asn_no ?? "-"} [${a.status}]`).join("\n");
        msg += "\n\n";
      } else {
        msg += `• 연결된 활성 ASN 없음\n\n`;
      }

      msg += `벤더에게 취소 안내 이메일이 발송됩니다.\n계속하시겠습니까?`;

      if (!confirm(msg)) return;

      // ── 4. 취소 실행 ───────────────────────────────────────
      const res = await fetch(`/api/po/${poId}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "취소 실패");

      alert(
        `PO ${label} 취소 완료\n` +
          `• 패킹리스트 ${json.cancelled_pl_count ?? 0}건 취소\n` +
          `• ASN ${json.cancelled_asn_count ?? 0}건 취소`
      );
      router.refresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={working}
      style={{
        marginLeft: 6,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 500,
        border: "1px solid #fecaca",
        borderRadius: 5,
        background: "#fff5f5",
        color: "#991b1b",
        cursor: working ? "not-allowed" : "pointer",
        opacity: working ? 0.6 : 1,
      }}
    >
      {working ? "확인 중..." : "Cancel"}
    </button>
  );
}
