import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const apiKey = process.env.GEOAPIFY_API_KEY;

  // Get client IP from headers
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "";

  if (apiKey) {
    try {
      const ipUrl = `https://api.geoapify.com/v1/ipinfo?apiKey=${apiKey}`;
      const res = await fetch(ipUrl, {
        headers: clientIp ? { "X-Forwarded-For": clientIp } : {},
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.location?.latitude && data?.location?.longitude) {
          return NextResponse.json({
            lat: Number(data.location.latitude),
            lon: Number(data.location.longitude),
            city: data.city?.name || data.subdivision?.name || "",
            source: "Network IP Geolocation"
          });
        }
      }
    } catch (e) {
      console.warn("Geoapify IP info failed:", e);
    }
  }

  // Fallback to free ipapi.co if Geoapify ipinfo fails or API key is missing
  try {
    const ipRes = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(3000)
    });
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      if (ipData?.latitude && ipData?.longitude) {
        return NextResponse.json({
          lat: Number(ipData.latitude),
          lon: Number(ipData.longitude),
          city: ipData.city || "",
          source: "Network IP Geolocation"
        });
      }
    }
  } catch (e) {
    console.warn("ipapi.co fallback failed:", e);
  }

  return NextResponse.json({ error: "Could not determine network IP location" }, { status: 404 });
}
