import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const body = await request.json();
    const { senderCustomerId, recipientMemberId, amount } = body;

    const transferAmount = Math.floor(Number(amount) || 0);
    const cleanRecipientCode = String(recipientMemberId || '').trim().toUpperCase();

    if (!senderCustomerId) {
      return NextResponse.json({ error: 'Sender identity is required.' }, { status: 400 });
    }
    if (!cleanRecipientCode) {
      return NextResponse.json({ error: 'Recipient PRIME Member ID is required.' }, { status: 400 });
    }
    if (transferAmount <= 0) {
      return NextResponse.json({ error: 'Please enter a valid transfer amount.' }, { status: 400 });
    }

    const { data: recipient, error: recErr } = await supabase
      .from('customers')
      .select('*')
      .eq('prime_member_id', cleanRecipientCode)
      .single();

    if (recErr || !recipient) {
      return NextResponse.json({ error: 'Recipient not found. Please verify the PRIME Member ID.' }, { status: 404 });
    }

    if (recipient.id === senderCustomerId) {
      return NextResponse.json({ error: 'You cannot transfer Store Credits to yourself.' }, { status: 400 });
    }

    const { data: sender, error: senderErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', senderCustomerId)
      .single();

    if (senderErr || !sender) {
      return NextResponse.json({ error: 'Sender profile not found.' }, { status: 404 });
    }

    const senderCredits = Number(sender.store_credits || 0);
    if (senderCredits < transferAmount) {
      return NextResponse.json({ error: `Insufficient Store Credits. Available balance: ₱${senderCredits.toLocaleString()}` }, { status: 400 });
    }

    const recipientCredits = Number(recipient.store_credits || 0);
    const newSenderBalance = senderCredits - transferAmount;
    const newRecipientBalance = recipientCredits + transferAmount;

    await supabase
      .from('customers')
      .update({ store_credits: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('id', senderCustomerId);

    await supabase
      .from('customers')
      .update({ store_credits: newRecipientBalance, updated_at: new Date().toISOString() })
      .eq('id', recipient.id);

    const nowIso = new Date().toISOString();

    await supabase.from('point_transactions').insert([{
      id: `tx-out-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      user_id: senderCustomerId,
      type: 'transfer_out',
      amount: -transferAmount,
      description: `Transferred ₱${transferAmount.toLocaleString()} to ${recipient.tg_name || 'Member'} (${cleanRecipientCode})`,
      created_at: nowIso
    }]);

    await supabase.from('point_transactions').insert([{
      id: `tx-in-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      user_id: recipient.id,
      type: 'transfer_in',
      amount: transferAmount,
      description: `Received ₱${transferAmount.toLocaleString()} from ${sender.tg_name || 'Member'}`,
      created_at: nowIso
    }]);

    return NextResponse.json({
      success: true,
      transferredAmount: transferAmount,
      newSenderBalance,
      recipientName: recipient.tg_name || 'Member',
      recipientMemberId: cleanRecipientCode
    });
  } catch (err: any) {
    console.error('Point transfer error:', err);
    return NextResponse.json({ error: err.message || 'Transfer failed.' }, { status: 400 });
  }
}
