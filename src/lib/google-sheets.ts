import { google } from "googleapis";
import "server-only";

/**
 * Service Account credentials (JSON) 를 환경변수에서 읽어
 * 인증된 Google Sheets 클라이언트 반환
 */
export function getSheetsClient() {
  const credJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credJson) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS 환경변수가 설정되지 않았습니다.");
  }

  let credentials;
  try {
    credentials = JSON.parse(credJson);
  } catch (e) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS JSON 파싱 실패");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * 특정 시트의 전체 데이터를 2D 배열로 반환
 */
export async function readSheet(spreadsheetId: string, sheetName: string): Promise<any[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'`, // 시트명만 주면 전체 범위
    valueRenderOption: "UNFORMATTED_VALUE", // 날짜는 serial, 숫자는 number
  });
  return (res.data.values || []) as any[][];
}

/**
 * Header + Row 배열을 객체 리스트로 변환
 */
export function rowsToObjects(rows: any[][]): Record<string, any>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h: any) => String(h || "").trim().replace(/\s+/g, " "));
  return rows.slice(1).map(row => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : "";
    });
    return obj;
  });
}

/**
 * Excel serial number → YYYY-MM-DD 변환
 */
export function excelDateToISO(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  if (isNaN(n) || n <= 0 || n > 100000) {
    // 문자열 날짜 시도
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  }
  const d = new Date(Math.round((n - 25569) * 86400000));
  return d.toISOString().slice(0, 10);
}

export function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

export function toInt(v: any): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

export function toStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
