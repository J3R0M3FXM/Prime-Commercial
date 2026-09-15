import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const waypoints = searchParams.get('waypoints'); // e.g., "14.5995,120.9842|14.6000,120.9900"
    
    if (!waypoints) {
      return NextResponse.json({ error: "Missing waypoints" }, { status: 400 });
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing Geoapify API Key" }, { status: 500 });
    }

    const res = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&apiKey=${apiKey}`);
    
    if (!res.ok) {
      throw new Error("Failed to fetch route");
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
