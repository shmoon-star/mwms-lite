import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FREIGHTOS_BASE = "https://sandbox.freightos.com/api/v1";

type Input = {
  origin: string;
  destination: string;
  unitType:
    | "container20"
    | "container40"
    | "container40HC"
    | "container45HC"
    | "pallets"
    | "boxes";
  quantity: number;
  weightKg?: number;
  volumeCBM?: number;
};

function buildLocation(code: string) {
  const c = (code || "").trim().toUpperCase();
  if (c.length === 3) return { airportCode: c };
  if (c.length === 5) return { unLocationCode: c };
  return { unLocationCode: c };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.FREIGHTOS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "FREIGHTOS_API_KEY 환경변수가 설정되지 않았습니다" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Partial<Input>;
    const { origin, destination, unitType, quantity } = body;
    if (!origin || !destination || !unitType || !quantity) {
      return NextResponse.json(
        { ok: false, error: "origin / destination / unitType / quantity 필수" },
        { status: 400 },
      );
    }

    const load: Record<string, any> = {
      quantity: Number(quantity) || 1,
      unitType,
    };
    if (typeof body.weightKg === "number" && body.weightKg > 0) load.unitWeightKg = body.weightKg;
    if (typeof body.volumeCBM === "number" && body.volumeCBM > 0) load.unitVolumeCBM = body.volumeCBM;

    const payload = {
      load: [load],
      legs: [
        {
          origin: buildLocation(origin),
          destination: buildLocation(destination),
        },
      ],
    };

    const res = await fetch(`${FREIGHTOS_BASE}/freightEstimates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-apikey": apiKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.message || data?.error || `Freightos API ${res.status}`,
          status: res.status,
          detail: data,
          requestPayload: payload,
        },
        { status: res.status },
      );
    }

    return NextResponse.json({ ok: true, data, requestPayload: payload });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed" },
      { status: 500 },
    );
  }
}
