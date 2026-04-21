"use client";

import { useMemo, useState } from "react";

type UnitType =
  | "container20"
  | "container40"
  | "container40HC"
  | "container45HC"
  | "pallets"
  | "boxes";

const UNIT_OPTIONS: { value: UnitType; label: string; group: "FCL" | "LCL" }[] = [
  { value: "container20", label: "Container 20ft (FCL)", group: "FCL" },
  { value: "container40", label: "Container 40ft (FCL)", group: "FCL" },
  { value: "container40HC", label: "Container 40ft HC (FCL)", group: "FCL" },
  { value: "container45HC", label: "Container 45ft HC (FCL)", group: "FCL" },
  { value: "pallets", label: "Pallets (LCL)", group: "LCL" },
  { value: "boxes", label: "Boxes (LCL / AIR)", group: "LCL" },
];

type ModeEstimate = {
  priceEstimates?: { min?: number; max?: number };
  transitTime?: { min?: number; max?: number };
};

type Result = {
  ok: boolean;
  data?: { OCEAN?: ModeEstimate; AIR?: ModeEstimate };
  error?: string;
  detail?: any;
  requestPayload?: any;
  status?: number;
};

function detectMode(code: string): "AIR" | "OCEAN" | "INVALID" {
  const c = (code || "").trim().toUpperCase();
  if (c.length === 3 && /^[A-Z]{3}$/.test(c)) return "AIR";
  if (c.length === 5 && /^[A-Z]{5}$/.test(c)) return "OCEAN";
  return "INVALID";
}

function fmtPrice(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return "-";
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;
}

function fmtDays(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return "-";
  return `${n}일`;
}

export default function FreightEstimatorPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("container40");
  const [quantity, setQuantity] = useState<string>("1");
  const [weightKg, setWeightKg] = useState<string>("");
  const [volumeCBM, setVolumeCBM] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const originMode = useMemo(() => detectMode(origin), [origin]);
  const destMode = useMemo(() => detectMode(destination), [destination]);
  const selectedUnit = UNIT_OPTIONS.find(u => u.value === unitType)!;
  const isContainer = selectedUnit.group === "FCL";

  const canSubmit =
    origin.trim().length >= 3 &&
    destination.trim().length >= 3 &&
    originMode !== "INVALID" &&
    destMode !== "INVALID" &&
    Number(quantity) >= 1 &&
    !loading;

  async function onSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const body: any = {
        origin: origin.trim().toUpperCase(),
        destination: destination.trim().toUpperCase(),
        unitType,
        quantity: Number(quantity) || 1,
      };
      if (!isContainer) {
        if (weightKg) body.weightKg = Number(weightKg);
        if (volumeCBM) body.volumeCBM = Number(volumeCBM);
      }

      const res = await fetch("/api/freight/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "요청 실패" });
    } finally {
      setLoading(false);
    }
  }

  function modeIcon(m: "AIR" | "OCEAN" | "INVALID") {
    if (m === "AIR") return "✈️";
    if (m === "OCEAN") return "🚢";
    return "";
  }
  function modeLabel(m: "AIR" | "OCEAN" | "INVALID") {
    if (m === "AIR") return "항공 (IATA 3자리)";
    if (m === "OCEAN") return "해상 (UN/LOCODE 5자리)";
    return "";
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>
          Freight Rate Estimator
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          Freightos API 기반 운임 견적 조회 · Sandbox 환경 · 참고용 추정치
        </p>
      </div>

      {/* Input Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Origin */}
          <div>
            <label style={labelStyle}>출발지 코드</label>
            <input
              type="text"
              value={origin}
              onChange={e => setOrigin(e.target.value.toUpperCase())}
              placeholder="KRPUS / ICN"
              style={inputStyle}
              maxLength={5}
            />
            <div style={hintStyle(originMode === "INVALID" && origin.length > 0)}>
              {origin.length === 0
                ? "3자리(IATA) 또는 5자리(UN/LOCODE)"
                : originMode === "INVALID"
                ? "⚠️ 3자리(항공) 또는 5자리(해상) 코드 입력"
                : `${modeIcon(originMode)} ${modeLabel(originMode)}`}
            </div>
          </div>

          {/* Destination */}
          <div>
            <label style={labelStyle}>도착지 코드</label>
            <input
              type="text"
              value={destination}
              onChange={e => setDestination(e.target.value.toUpperCase())}
              placeholder="CNSHA / PVG"
              style={inputStyle}
              maxLength={5}
            />
            <div style={hintStyle(destMode === "INVALID" && destination.length > 0)}>
              {destination.length === 0
                ? "3자리(IATA) 또는 5자리(UN/LOCODE)"
                : destMode === "INVALID"
                ? "⚠️ 3자리(항공) 또는 5자리(해상) 코드 입력"
                : `${modeIcon(destMode)} ${modeLabel(destMode)}`}
            </div>
          </div>

          {/* Unit Type */}
          <div>
            <label style={labelStyle}>화물 종류</label>
            <select
              value={unitType}
              onChange={e => setUnitType(e.target.value as UnitType)}
              style={inputStyle}
            >
              {UNIT_OPTIONS.map(u => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label style={labelStyle}>수량</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Weight / Volume — LCL only */}
          {!isContainer && (
            <>
              <div>
                <label style={labelStyle}>단위 무게 (kg)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  placeholder="선택"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>단위 부피 (CBM)</label>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={volumeCBM}
                  onChange={e => setVolumeCBM(e.target.value)}
                  placeholder="선택"
                  style={inputStyle}
                />
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "#111827" : "#9ca3af",
              color: "#fff",
              border: 0,
              padding: "10px 18px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "조회 중..." : "운임 조회"}
          </button>
          {origin && destination && originMode !== "INVALID" && destMode !== "INVALID" && originMode !== destMode && (
            <span style={{ fontSize: 12, color: "#b45309" }}>
              ⚠ 출발지({originMode})와 도착지({destMode}) 모드가 다릅니다 — API가 결과를 반환하지 않을 수 있습니다
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div>
          {!result.ok ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: 16,
                color: "#991b1b",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                조회 실패 {result.status ? `(${result.status})` : ""}
              </div>
              <div>{result.error}</div>
              {result.detail && (
                <pre
                  style={{
                    marginTop: 10,
                    background: "#fff",
                    padding: 10,
                    borderRadius: 6,
                    fontSize: 11,
                    overflow: "auto",
                    color: "#374151",
                  }}
                >
                  {JSON.stringify(result.detail, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <ResultView data={result.data} />
          )}
        </div>
      )}
    </div>
  );
}

function ResultView({ data }: { data?: { OCEAN?: ModeEstimate; AIR?: ModeEstimate } }) {
  const ocean = data?.OCEAN;
  const air = data?.AIR;
  const hasAny =
    (ocean?.priceEstimates || ocean?.transitTime) ||
    (air?.priceEstimates || air?.transitTime);

  if (!hasAny) {
    return (
      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 10,
          padding: 16,
          fontSize: 13,
          color: "#92400e",
        }}
      >
        해당 구간에 대한 견적 데이터가 없습니다 (Sandbox 한정).
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {ocean && <ModeCard icon="🚢" title="해상 (OCEAN)" estimate={ocean} />}
      {air && <ModeCard icon="✈️" title="항공 (AIR)" estimate={air} />}
    </div>
  );
}

function ModeCard({
  icon,
  title,
  estimate,
}: {
  icon: string;
  title: string;
  estimate: ModeEstimate;
}) {
  const p = estimate.priceEstimates;
  const t = estimate.transitTime;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#111827" }}>
        {icon} {title}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={rowLabel}>운임</div>
        <div style={rowValue}>
          {fmtPrice(p?.min)} <span style={{ color: "#9ca3af" }}>~</span> {fmtPrice(p?.max)}
        </div>
      </div>
      <div>
        <div style={rowLabel}>운송 기간</div>
        <div style={rowValue}>
          {fmtDays(t?.min)} <span style={{ color: "#9ca3af" }}>~</span> {fmtDays(t?.max)}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  background: "#fff",
  color: "#111827",
};

const hintStyle = (isError: boolean): React.CSSProperties => ({
  fontSize: 11,
  color: isError ? "#b91c1c" : "#6b7280",
  marginTop: 4,
});

const rowLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 3,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const rowValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
};
