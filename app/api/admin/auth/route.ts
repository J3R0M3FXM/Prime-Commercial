import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const adminCode = process.env.ADMIN_ACCESS_CODE;

    if (!adminCode) {
       return NextResponse.json({ success: false, error: "Server missing ADMIN_ACCESS_CODE" }, { status: 500 });
    }

    if (code === adminCode) {
      return NextResponse.json({ success: true, token: "admin-session-granted" });
    } else {
      return NextResponse.json({ success: false, error: "Invalid access code" }, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
