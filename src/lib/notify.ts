import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

type SendMailParams = {
  to: string | string[];
  subject: string;
  html: string;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

type UserProfileRow = {
  email: string | null;
  user_type: string | null;
  role: string | null;
  status: string | null;
  vendor_id: string | null;
};

function normalizeRecipients(to: string | string[]) {
  if (Array.isArray(to)) {
    return [...new Set(to.map((v) => String(v).trim()).filter(Boolean))];
  }

  return [
    ...new Set(
      String(to)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    ),
  ];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function envList(name: string) {
  return String(process.env[name] || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
}

function buildVendorLoginRedirectUrl(targetPath: string) {
  const base = getAppBaseUrl();
  return `${base}/vendor-login?next=${encodeURIComponent(targetPath)}`;
}

function buildCreatePackingListUrl(poNo?: string | null) {
  const targetPath = poNo
    ? `/vendor/packing-lists/new?po_no=${encodeURIComponent(poNo)}`
    : `/vendor/packing-lists/new`;

  return buildVendorLoginRedirectUrl(targetPath);
}

function buildPackingListDetailUrl(id: string) {
  const targetPath = `/vendor/packing-lists/${encodeURIComponent(id)}`;
  return buildVendorLoginRedirectUrl(targetPath);
}

export async function sendMail({ to, subject, html }: SendMailParams) {
  const TEST_MODE = true;

  const recipients = TEST_MODE
    ? [process.env.MAIL_TO_TEST || "sh.moon@musinsa.com"]
    : normalizeRecipients(to);

  const from = process.env.MAIL_FROM || "MWMS Lite <onboarding@resend.dev>";

  if (recipients.length === 0) {
    console.log("[MAIL:SKIP] no recipients", { subject });
    return { ok: true, skipped: true };
  }

  const resend = getResendClient();

  if (!resend) {
    console.log("[MAIL:SKIP] RESEND_API_KEY missing", {
      to: recipients,
      subject,
    });
    return { ok: true, skipped: true };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: recipients,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Failed to send email");
  }

  console.log("[MAIL:SENT]", {
    id: data?.id,
    to: recipients,
    subject,
  });

  return { ok: true, skipped: false, id: data?.id };
}

export async function safeNotify(
  label: string,
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    console.log(`[NOTIFY:START] ${label}`);
    await fn();
    console.log(`[NOTIFY:DONE] ${label}`);
  } catch (error) {
    console.error(`[NOTIFY:ERROR] ${label}`, error);
  }
}

export async function getInternalRecipients() {
  const envRecipients = envList("MAIL_TO_INTERNAL");
  if (envRecipients.length > 0) {
    return envRecipients;
  }

  const sb = createAdminClient();

  const { data, error } = await sb
    .from("user_profiles")
    .select("email, user_type, role, status")
    .eq("user_type", "INTERNAL")
    .eq("role", "ADMIN")
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => row.email || "")
    .filter(Boolean);
}

export async function getVendorRecipients(vendorId: string) {
  const sb = createAdminClient();

  const { data: vendorRaw, error: vendorError } = await sb
    .from("vendor")
    .select("id, vendor_code, vendor_name")
    .eq("id", vendorId)
    .single();

  if (vendorError || !vendorRaw) {
    throw new Error(vendorError?.message || "Vendor not found");
  }

  const vendor = vendorRaw as VendorRow;
  const testVendorCode = process.env.TEST_VENDOR_CODE || "VND-001";

  if (vendor.vendor_code === testVendorCode) {
    const testRecipients = envList("MAIL_TO_TEST");
    if (testRecipients.length > 0) {
      return testRecipients;
    }
  }

  const { data: profilesRaw, error: profilesError } = await sb
    .from("user_profiles")
    .select("email, user_type, role, status, vendor_id")
    .eq("vendor_id", vendorId)
    .eq("user_type", "VENDOR")
    .eq("status", "ACTIVE");

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const recipients = (profilesRaw ?? [])
    .map((row: UserProfileRow) => row.email || "")
    .filter(Boolean);

  return [...new Set(recipients)];
}

export async function getVendorInfo(vendorId: string) {
  const sb = createAdminClient();

  const { data, error } = await sb
    .from("vendor")
    .select("id, vendor_code, vendor_name")
    .eq("id", vendorId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Vendor not found");
  }

  return data as VendorRow;
}

export async function notifyPoCreated(params: {
  poNo: string;
  vendorId: string;
  eta?: string | null;
}) {
  const vendor = await getVendorInfo(params.vendorId);
  const recipients = await getVendorRecipients(params.vendorId);
  const createPackingListUrl = buildCreatePackingListUrl(params.poNo);

  return sendMail({
    to: recipients,
    subject: `[mwms-lite] PO created: ${params.poNo}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        <p>A new PO has been created.</p>
        <p><b>PO No:</b> ${escapeHtml(params.poNo)}</p>
        <p><b>Vendor Code:</b> ${escapeHtml(vendor.vendor_code || "-")}</p>
        <p><b>Vendor Name:</b> ${escapeHtml(vendor.vendor_name || "-")}</p>
        <p><b>ETA:</b> ${escapeHtml(params.eta || "-")}</p>
        <p>Please review and register the packing list.</p>

        <p style="margin-top: 20px;">
          <a
            href="${escapeHtml(createPackingListUrl)}"
            style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;"
          >
            Create Packing List
          </a>
        </p>

        <p style="margin-top: 12px; font-size: 12px; color: #666;">
          If the button does not work, open this URL:<br />
          ${escapeHtml(createPackingListUrl)}
        </p>
      </div>
    `,
  });
}

export async function notifyPackingListSubmitted(params: {
  packingListId: string;
  packingListNo: string;
  vendorName?: string | null;
  poNo?: string | null;
}) {
  const recipients = await getInternalRecipients();
  const detailUrl = buildPackingListDetailUrl(params.packingListId);

  return sendMail({
    to: recipients,
    subject: `[mwms-lite] Packing List submitted: ${params.packingListNo}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        <p>Packing List submitted successfully.</p>
        <p><b>Packing List No:</b> ${escapeHtml(params.packingListNo)}</p>
        <p><b>PO No:</b> ${escapeHtml(params.poNo || "-")}</p>
        <p><b>Vendor:</b> ${escapeHtml(params.vendorName || "-")}</p>

        <p style="margin-top: 20px;">
          <a
            href="${escapeHtml(detailUrl)}"
            style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;"
          >
            Open Packing List
          </a>
        </p>

        <p style="margin-top: 12px; font-size: 12px; color: #666;">
          ${escapeHtml(detailUrl)}
        </p>
      </div>
    `,
  });
}

export async function notifyEtaChanged(params: {
  poNo: string;
  vendorId: string;
  oldEta: string | null;
  newEta: string;
}) {
  const vendor = await getVendorInfo(params.vendorId);
  const recipients = await getVendorRecipients(params.vendorId);
  const createPackingListUrl = buildCreatePackingListUrl(params.poNo);

  return sendMail({
    to: recipients,
    subject: `[mwms-lite] PO 납기예정일(ETA) 변경 안내: ${params.poNo}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        <p>안녕하세요, ${escapeHtml(vendor.vendor_name || vendor.vendor_code || "")} 담당자님.</p>
        <p>아래 PO의 납기예정일(ETA)이 변경되었습니다.</p>

        <table style="border-collapse:collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">PO No</td>
            <td style="padding: 8px 0; font-weight: bold;">${escapeHtml(params.poNo)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">Vendor</td>
            <td style="padding: 8px 0;">${escapeHtml(vendor.vendor_name || "-")}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">변경 전 ETA</td>
            <td style="padding: 8px 0; text-decoration: line-through; color: #999;">${escapeHtml(params.oldEta || "-")}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">변경 후 ETA</td>
            <td style="padding: 8px 0; font-weight: bold; color: #111;">${escapeHtml(params.newEta)}</td>
          </tr>
        </table>

        <p>변경된 납기일 기준으로 패킹리스트를 등록해 주세요.</p>

        <p style="margin-top: 20px;">
          <a
            href="${escapeHtml(createPackingListUrl)}"
            style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;"
          >
            패킹리스트 등록하기
          </a>
        </p>

        <p style="margin-top: 12px; font-size: 12px; color: #666;">
          버튼이 동작하지 않으면 아래 URL을 복사해 주세요:<br />
          ${escapeHtml(createPackingListUrl)}
        </p>
      </div>
    `,
  });
}

export async function notifyPoCancelled(params: {
  poNo: string;
  vendorId: string;
  eta: string | null;
  cancelledAsnCount?: number;
  cancelledPlCount?: number;
}) {
  const vendor = await getVendorInfo(params.vendorId);
  const recipients = await getVendorRecipients(params.vendorId);

  return sendMail({
    to: recipients,
    subject: `[mwms-lite] PO 취소 안내: ${params.poNo}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        <p>안녕하세요, ${escapeHtml(vendor.vendor_name || vendor.vendor_code || "")} 담당자님.</p>
        <p>아래 PO가 <strong style="color:#991b1b;">취소(CANCELLED)</strong> 처리되었습니다.</p>

        <table style="border-collapse:collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">PO No</td>
            <td style="padding: 8px 0; font-weight: bold;">${escapeHtml(params.poNo)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">Vendor</td>
            <td style="padding: 8px 0;">${escapeHtml(vendor.vendor_name || "-")}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">ETA</td>
            <td style="padding: 8px 0;">${escapeHtml(params.eta || "-")}</td>
          </tr>
          ${
            (params.cancelledAsnCount ?? 0) > 0
              ? `<tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">취소된 ASN</td>
            <td style="padding: 8px 0;">${params.cancelledAsnCount}건</td>
          </tr>`
              : ""
          }
          ${
            (params.cancelledPlCount ?? 0) > 0
              ? `<tr>
            <td style="padding: 8px 16px 8px 0; color: #666;">취소된 패킹리스트</td>
            <td style="padding: 8px 0;">${params.cancelledPlCount}건 (작성 중이던 내용은 조회 가능합니다)</td>
          </tr>`
              : ""
          }
        </table>

        <p style="color: #991b1b;">
          해당 PO에 연결된 패킹리스트 등록 및 ASN 처리는 더 이상 진행하지 않아도 됩니다.
        </p>
        <p>문의사항이 있으시면 담당자에게 연락해 주세요.</p>
      </div>
    `,
  });
}

export async function notifyAsnCreatedFromPackingList(params: {
  packingListId: string;
  packingListNo: string;
  asnNo: string;
  vendorName?: string | null;
  poNo?: string | null;
}) {
  const recipients = await getInternalRecipients();
  const detailUrl = buildPackingListDetailUrl(params.packingListId);

  return sendMail({
    to: recipients,
    subject: `[mwms-lite] ASN created from Packing List: ${params.asnNo}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        <p>ASN created from Packing List.</p>
        <p><b>Packing List No:</b> ${escapeHtml(params.packingListNo)}</p>
        <p><b>ASN No:</b> ${escapeHtml(params.asnNo)}</p>
        <p><b>PO No:</b> ${escapeHtml(params.poNo || "-")}</p>
        <p><b>Vendor:</b> ${escapeHtml(params.vendorName || "-")}</p>

        <p style="margin-top: 20px;">
          <a
            href="${escapeHtml(detailUrl)}"
            style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;"
          >
            Open Packing List
          </a>
        </p>

        <p style="margin-top: 12px; font-size: 12px; color: #666;">
          ${escapeHtml(detailUrl)}
        </p>
      </div>
    `,
  });
}