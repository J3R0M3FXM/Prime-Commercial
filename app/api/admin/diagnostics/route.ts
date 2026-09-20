import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export interface DiagnosticItem {
  id: string;
  name: string;
  category: "telegram" | "location" | "infrastructure" | "deployment";
  status: "operational" | "degraded" | "error" | "pending";
  latencyMs?: number;
  message: string;
  details?: Record<string, any>;
  lastChecked: string;
}

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  const results: DiagnosticItem[] = [];

  // 1. Telegram Bot API
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!tgToken) {
    results.push({
      id: "telegram-bot-api",
      name: "Telegram Bot API",
      category: "telegram",
      status: "error",
      message: "TELEGRAM_BOT_TOKEN is missing in environment",
      lastChecked: timestamp,
    });
  } else {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);
      const data = await res.json();

      if (data.ok) {
        results.push({
          id: "telegram-bot-api",
          name: "Telegram Bot API",
          category: "telegram",
          status: "operational",
          latencyMs: latency,
          message: `Connected to @${data.result?.username} (ID: ${data.result?.id})`,
          details: {
            username: data.result?.username,
            canJoinGroups: data.result?.can_join_groups,
            supportsInlineQueries: data.result?.supports_inline_queries,
          },
          lastChecked: timestamp,
        });
      } else {
        results.push({
          id: "telegram-bot-api",
          name: "Telegram Bot API",
          category: "telegram",
          status: "degraded",
          latencyMs: latency,
          message: `Telegram returned: ${data.description || "Authentication failure"}`,
          details: { errorCode: data.error_code, description: data.description },
          lastChecked: timestamp,
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      results.push({
        id: "telegram-bot-api",
        name: "Telegram Bot API",
        category: "telegram",
        status: "error",
        latencyMs: latency,
        message: err.name === "AbortError" ? "Connection timed out (4s)" : (err.message || "Network error"),
        lastChecked: timestamp,
      });
    }
  }

  // 2. Geoapify API
  const geoKey = process.env.GEOAPIFY_API_KEY;
  if (!geoKey) {
    results.push({
      id: "geoapify-api",
      name: "Geoapify API",
      category: "location",
      status: "error",
      message: "GEOAPIFY_API_KEY is not configured in environment",
      lastChecked: timestamp,
    });
  } else {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=14.5995&lon=120.9842&apiKey=${geoKey}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        const data = await res.json();
        const address = data.features?.[0]?.properties?.formatted || "Manila, Philippines";
        results.push({
          id: "geoapify-api",
          name: "Geoapify API",
          category: "location",
          status: "operational",
          latencyMs: latency,
          message: `Reverse Geocoding operational (${address.substring(0, 45)}...)`,
          details: { sampleResolved: address },
          lastChecked: timestamp,
        });
      } else {
        results.push({
          id: "geoapify-api",
          name: "Geoapify API",
          category: "location",
          status: "degraded",
          latencyMs: latency,
          message: `Geoapify responded with HTTP ${res.status}`,
          lastChecked: timestamp,
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      results.push({
        id: "geoapify-api",
        name: "Geoapify API",
        category: "location",
        status: "error",
        latencyMs: latency,
        message: err.name === "AbortError" ? "Connection timed out (4s)" : err.message,
        lastChecked: timestamp,
      });
    }
  }

  // 3. IPLocate API
  const ipKey = process.env.IPLOCATE_API_KEY;
  if (!ipKey) {
    results.push({
      id: "iplocate-api",
      name: "IPLocate API",
      category: "location",
      status: "error",
      message: "IPLOCATE_API_KEY is not configured in environment",
      lastChecked: timestamp,
    });
  } else {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://www.iplocate.io/api/lookup/8.8.8.8?apikey=${ipKey}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        const data = await res.json();
        results.push({
          id: "iplocate-api",
          name: "IPLocate API",
          category: "location",
          status: "operational",
          latencyMs: latency,
          message: `IP Lookup operational (${data.country || "Global"})`,
          details: {
            country: data.country,
            city: data.city,
            isp: data.company?.name || data.asn?.name,
          },
          lastChecked: timestamp,
        });
      } else {
        results.push({
          id: "iplocate-api",
          name: "IPLocate API",
          category: "location",
          status: "degraded",
          latencyMs: latency,
          message: `IPLocate responded with HTTP ${res.status}`,
          lastChecked: timestamp,
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      results.push({
        id: "iplocate-api",
        name: "IPLocate API",
        category: "location",
        status: "error",
        latencyMs: latency,
        message: err.name === "AbortError" ? "Connection timed out (4s)" : err.message,
        lastChecked: timestamp,
      });
    }
  }

  // 4. Database (Supabase PostgreSQL)
  const dbStart = performance.now();
  try {
    if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
    const supabase = getSupabaseAdmin()!;
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (error) throw error;
    const dbLatency = Math.round(performance.now() - dbStart);
    results.push({
      id: "database",
      name: "Database",
      category: "infrastructure",
      status: "operational",
      latencyMs: dbLatency,
      message: `Supabase PostgreSQL connection active & healthy (${count || 0} products)`,
      details: {
        engine: "Supabase PostgreSQL",
      },
      lastChecked: timestamp,
    });
  } catch (err: any) {
    const dbLatency = Math.round(performance.now() - dbStart);
    results.push({
      id: "database",
      name: "Database",
      category: "infrastructure",
      status: "error",
      latencyMs: dbLatency,
      message: `Supabase connection error: ${err.message}`,
      lastChecked: timestamp,
    });
  }

  // 5. Server
  const serverUptimeSeconds = Math.round(process.uptime());
  const memUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
  results.push({
    id: "server",
    name: "Server",
    category: "infrastructure",
    status: "operational",
    latencyMs: 1,
    message: `Node.js ${process.version} online (Heap: ${heapUsedMb}MB / ${heapTotalMb}MB, Uptime: ${serverUptimeSeconds}s)`,
    details: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      heapUsedMb,
      heapTotalMb,
      uptimeSeconds: serverUptimeSeconds,
    },
    lastChecked: timestamp,
  });

  return NextResponse.json({
    timestamp,
    services: results,
  });
}
