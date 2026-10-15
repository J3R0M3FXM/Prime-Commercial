/**
 * PRIME Commercial - Bridge & Synchronization Helper
 *
 * Facilitates synchronizing edge SQLite data with PRIME's
 * primary Supabase backend and Next.js APIs.
 */

export async function syncOrderToEdge(db, order) {
  if (!order || !order.id) return;
  return db('orders_edge').upsert({
    id: String(order.id),
    order_number: order.order_number || String(order.id).slice(0, 8),
    tg_user_id: String(order.customer_tg_id || order.tg_user_id || ''),
    total_php: Number(order.total_amount || order.total) || 0,
    status: order.status || 'pending',
    items_count: Array.isArray(order.items) ? order.items.length : 1,
    delivery_address: order.delivery_address || '',
    created_at: order.created_at || new Date().toISOString()
  });
}

export async function forwardToPrimeApi(env, path, payload, method = 'POST') {
  const base = env?.PRIME_APP_URL || env?.NEXT_PUBLIC_APP_URL;
  if (!base) return null;

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Edge': 'serverless'
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    return await res.json().catch(() => null);
  } catch (err) {
    console.error('Failed to forward event to PRIME API:', err);
    return null;
  }
}
