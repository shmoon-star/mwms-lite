import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/monitor/musinsa-og?uid=2313388
 *
 * 무신사 상품 페이지에서 og:image 추출 → 이미지 리다이렉트
 * 24시간 캐시 (Vercel Edge Cache)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");

  if (!uid || !/^\d+$/.test(uid)) {
    return NextResponse.json({ ok: false, error: "Invalid uid" }, { status: 400 });
  }

  try {
    const productUrl = `https://www.musinsa.com/products/${uid}`;
    const res = await fetch(productUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      // 서버에서 한번만 fetch하도록 캐시
      next: { revalidate: 86400 }, // 24h
    });

    if (!res.ok) {
      return NextResponse.redirect("https://via.placeholder.com/300x300?text=No+Image", 302);
    }

    const html = await res.text();

    // og:image 추출
    const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);

    if (!match) {
      return NextResponse.redirect("https://via.placeholder.com/300x300?text=No+Image", 302);
    }

    const imageUrl = match[1];

    // 이미지 바이너리 직접 응답 (CORS 우회 + 캐싱)
    const imgRes = await fetch(imageUrl, {
      next: { revalidate: 86400 },
    });

    if (!imgRes.ok) {
      return NextResponse.redirect("https://via.placeholder.com/300x300?text=No+Image", 302);
    }

    const buffer = await imgRes.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": imgRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e: any) {
    return NextResponse.redirect("https://via.placeholder.com/300x300?text=Error", 302);
  }
}
