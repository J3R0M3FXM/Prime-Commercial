/** Navigation only. AdminPage and every staff endpoint still verify authority. */
export function adminDestination(startParam: string, preferPos = false): string {
  if(startParam==='pos'||(!startParam&&preferPos))return '/admin?view=pos';
  const order=startParam.match(/^admin_order_(.+)$/i)?.[1];
  return order?`/admin?view=order-detail&order=${encodeURIComponent(order)}`:'/admin';
}
