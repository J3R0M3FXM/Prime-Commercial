import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";

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
          message: `Telegram returned: ${data.description || "Authentication failure (code " + data.error_code + ")"}`,
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
          message: `IP Lookup operational (${data.country || "Global"}, ISP: ${data.company?.name || data.asn?.name || "Google"})`,
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

  // 4. Database (Firestore)
  const dbStart = performance.now();
  try {
    const testQuery = query(collection(db, "products"), limit(1));
    const snap = await getDocs(testQuery);
    const dbLatency = Math.round(performance.now() - dbStart);
    results.push({
      id: "database",
      name: "Database",
      category: "infrastructure",
      status: "operational",
      latencyMs: dbLatency,
      message: `Cloud Firestore connection active & healthy (${snap.size} sample docs read)`,
      details: {
        engine: "Google Cloud Firestore",
        databaseId: (db as any)._databaseId?.database || "default",
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
      message: `Firestore connection error: ${err.message}`,
      lastChecked: timestamp,
    });
  }

  // 5. Server (Next.js Application Engine)
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

  // 6. Storage (Firebase Storage & Cloud Object Asset Service)
  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    "perfect-buttress-4dzcr.firebasestorage.app";
  const storageStart = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const storageRes = await fetch(`https://firebasestorage.googleapis.com/v0/b/${storageBucket}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);
    const storageLatency = Math.round(performance.now() - storageStart);

    // Google Cloud Storage returns 200, 401, or 403 when reachable (which verifies bucket endpoint presence)
    if (storageRes.status < 500) {
      results.push({
        id: "storage",
        name: "Storage",
        category: "infrastructure",
        status: "operational",
        latencyMs: storageLatency,
        message: `Bucket endpoint reachable (${storageBucket})`,
        details: { bucket: storageBucket, httpStatus: storageRes.status },
        lastChecked: timestamp,
      });
    } else {
      results.push({
        id: "storage",
        name: "Storage",
        category: "infrastructure",
        status: "degraded",
        latencyMs: storageLatency,
        message: `Storage returned HTTP status ${storageRes.status}`,
        lastChecked: timestamp,
      });
    }
  } catch (err: any) {
    const storageLatency = Math.round(performance.now() - storageStart);
    results.push({
      id: "storage",
      name: "Storage",
      category: "infrastructure",
      status: "degraded",
      latencyMs: storageLatency,
      message: `Endpoint ping error: ${err.message}`,
      lastChecked: timestamp,
    });
  }

  // 7. Vercel (Edge Network & API Gateway)
  const vercelStart = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("https://api.vercel.com", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const vercelLatency = Math.round(performance.now() - vercelStart);
    if (res.ok || res.status < 500) {
      results.push({
        id: "vercel",
        name: "Vercel",
        category: "deployment",
        status: "operational",
        latencyMs: vercelLatency,
        message: "Vercel Global Edge & API Gateway operational",
        details: { httpStatus: res.status },
        lastChecked: timestamp,
      });
    } else {
      results.push({
        id: "vercel",
        name: "Vercel",
        category: "deployment",
        status: "degraded",
        latencyMs: vercelLatency,
        message: `Vercel Gateway responded with status ${res.status}`,
        lastChecked: timestamp,
      });
    }
  } catch (err: any) {
    const vercelLatency = Math.round(performance.now() - vercelStart);
    results.push({
      id: "vercel",
      name: "Vercel",
      category: "deployment",
      status: "error",
      latencyMs: vercelLatency,
      message: err.name === "AbortError" ? "Connection timed out (3.5s)" : err.message,
      lastChecked: timestamp,
    });
  }

  // 8. GitHub (API & Remote Repository Services)
  const ghStart = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("https://api.github.com", {
      signal: controller.signal,
      headers: {
        "User-Agent": "PRIME-System-Diagnostics",
        Accept: "application/vnd.github.v3+json",
      },
    });
    clearTimeout(timeout);
    const ghLatency = Math.round(performance.now() - ghStart);
    if (res.ok) {
      results.push({
        id: "github",
        name: "GitHub",
        category: "deployment",
        status: "operational",
        latencyMs: ghLatency,
        message: "GitHub API & Version Control Services operational",
        details: { httpStatus: res.status },
        lastChecked: timestamp,
      });
    } else {
      results.push({
        id: "github",
        name: "GitHub",
        category: "deployment",
        status: "degraded",
        latencyMs: ghLatency,
        message: `GitHub responded with status ${res.status}`,
        lastChecked: timestamp,
      });
    }
  } catch (err: any) {
    const ghLatency = Math.round(performance.now() - ghStart);
    results.push({
      id: "github",
      name: "GitHub",
      category: "deployment",
      status: "error",
      latencyMs: ghLatency,
      message: err.name === "AbortError" ? "Connection timed out (3.5s)" : err.message,
      lastChecked: timestamp,
    });
  }

  return NextResponse.json({
    timestamp,
    services: results,
  });
}
