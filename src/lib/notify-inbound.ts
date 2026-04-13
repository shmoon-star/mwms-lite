import { sendMail } from "@/lib/notify";
import type { WmsParseResult } from "@/lib/wms-parser";

/**
 * WMS Excel에서 최근 IN(입고) 레코드를 감지하여 바이어에게 알림 메일 발송
 * targetDate: 확인할 날짜 (MM-DD 형식), 없으면 어제 날짜 자동 계산
 */
export async function notifyInboundFromWmsData(
  result: WmsParseResult,
  targetDate?: string
) {
  // 어제 날짜 (KST 기준)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const yesterday = new Date(kstNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const checkDate = targetDate || `${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  // 해당 날짜의 IN 데이터 찾기
  const dayData = result.daily.find(d => d.date === checkDate);

  if (!dayData || dayData.IN <= 0) {
    console.log(`[NOTIFY-INBOUND] No IN data for ${checkDate}`);
    return { sent: false, reason: `No IN data for ${checkDate}` };
  }

  // IN 유형별 상세
  const inDetails: { type: string; qty: number }[] = [];
  for (const [key, dateMap] of Object.entries(result.pivot)) {
    if (!key.startsWith("IN|")) continue;
    const qty = dateMap[checkDate] || 0;
    if (qty > 0) {
      inDetails.push({ type: key.replace("IN|", ""), qty });
    }
  }

  const detailRows = inDetails
    .map(d => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${d.type}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${d.qty.toLocaleString()} PCS</td></tr>`)
    .join("");

  const totalOut = dayData.OUT || 0;

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; max-width: 600px;">
      <h2 style="color: #111; margin-bottom: 4px;">WMS 입고 알림</h2>
      <p style="color: #6b7280; margin-top: 0;">날짜: <strong>${checkDate}</strong></p>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <div style="font-size: 12px; color: #1e40af; font-weight: 600;">입고 (IN)</div>
        <div style="font-size: 28px; font-weight: 800; color: #111;">${dayData.IN.toLocaleString()} PCS</div>
      </div>

      ${inDetails.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 8px 12px; text-align: left;">Type</th>
            <th style="padding: 8px 12px; text-align: right;">Qty</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
      ` : ""}

      ${totalOut > 0 ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin: 16px 0;">
        <div style="font-size: 12px; color: #991b1b; font-weight: 600;">출고 (OUT) 참고</div>
        <div style="font-size: 20px; font-weight: 700; color: #111;">${totalOut.toLocaleString()} PCS</div>
      </div>
      ` : ""}

      <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
        이 메일은 WMS 데이터 수신 시 자동으로 발송됩니다.<br />
        MWMS-Lite SCM System
      </p>
    </div>
  `;

  const mailResult = await sendMail({
    to: [], // TEST_MODE에서는 MAIL_TO_TEST로 자동 라우팅
    subject: `[WMS] 입고 알림: ${checkDate} — ${dayData.IN.toLocaleString()} PCS`,
    html,
  });

  console.log(`[NOTIFY-INBOUND] Sent for ${checkDate}: IN=${dayData.IN}, result=`, mailResult);

  return { sent: true, date: checkDate, inQty: dayData.IN, mailResult };
}
