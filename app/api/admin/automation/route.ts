import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-session';
import { createAutomationFlow, deleteAutomationFlow, getAutomationFlows, getAutomationSettings, updateAutomationFlow, updateAutomationSettings } from '@/lib/telegram-automation';

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
}

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) return unauthorized();
  try {
    const [settings, flows] = await Promise.all([getAutomationSettings(), getAutomationFlows()]);
    return NextResponse.json({ settings, flows });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load automation settings.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) return unauthorized();
  try {
    const body = await request.json();
    if (body.type === 'settings') return NextResponse.json(await updateAutomationSettings(body));
    return NextResponse.json(await createAutomationFlow(body));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create automation.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!verifyAdminRequest(request)) return unauthorized();
  try {
    const body = await request.json();
    if (body.type === 'settings') return NextResponse.json(await updateAutomationSettings(body));
    if (!body.id) return NextResponse.json({ error: 'Automation ID is required.' }, { status: 400 });
    const { id, type, ...updates } = body;
    return NextResponse.json(await updateAutomationFlow(id, updates));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update automation.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!verifyAdminRequest(request)) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Automation ID is required.' }, { status: 400 });
    await deleteAutomationFlow(id);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete automation.' }, { status: 500 });
  }
}
