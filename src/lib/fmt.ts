/** ISO timestamp → KST 기준 YYYY-MM-DD (invalid/empty → "") */
export function fmtDate(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    // fallback: 이미 YYYY-MM-DD 형태면 그대로 반환
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }
  // UTC → KST (+9h) 변환 후 YYYY-MM-DD 추출
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
