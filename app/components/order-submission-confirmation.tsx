"use client";

import { CheckCircle2 } from 'lucide-react';
import { formatPHP } from '@/lib/currency';

export default function OrderSubmissionConfirmation({ order, position, createdAt, wait, onViewOrder, onContinueShopping }: {
  order: any; position?: number | null; createdAt?: number | null; wait?: number | null;
  onViewOrder?: () => void; onContinueShopping: () => void;
}) {
  const paid = String(order.paymentStatus || '').toLowerCase() === 'paid';
  const noUpfront = Number(order.payableNow) === 0;
  const uponArrival = order.deliveryFeePaymentMethod === 'upon_delivery';
  const fee = Number(order.payableOnDelivery);
  const feeKnown = Number.isFinite(fee) && fee >= 0;
  const date = createdAt ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(createdAt * 1000)) : 'Unavailable';
  const rows = [['Order Number', order.orderNumber || order.id], ['Order Date & Time', date], ['Estimated Wait', wait == null ? 'Unavailable' : `${wait} minutes`], ['Queue Position', position ?? 'Unavailable']];
  return <section className="prime-submission" aria-label="Order Submission Confirmation">
    <div className="prime-submission__success" role="status">
      <CheckCircle2 aria-hidden="true" />
      <h3>Order Successfully Submitted</h3>
      <p>Your order has been received and added to the processing queue.</p>
    </div>
    <table className="prime-submission__table" aria-label="Order Details"><tbody>{rows.map(([label, value]) => <tr key={String(label)}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>
    <p className="prime-submission__estimate">Queue position and waiting time are estimates.</p>
    <div className="prime-submission__payment">
      <h4>Payment Status: {paid ? 'Verified' : noUpfront ? 'No Upfront Payment Due' : 'Pending Verification'}</h4>
      <p>{paid ? 'Payment has been verified.' : noUpfront ? 'No upfront payment is due. Any courier payment listed below remains payable upon arrival.' : 'Your uploaded payment receipt will be reviewed. Payment is not confirmed until verification is completed.'}</p>
    </div>
    {uponArrival && <section aria-label="Delivery Fee Details">
      <table className="prime-submission__table" aria-label="Courier Payment"><tbody><tr><th scope="row">Delivery Fee</th><td><strong>{feeKnown ? formatPHP(fee) : 'Unavailable'}</strong></td></tr><tr><th scope="row">Payment Method</th><td>Pay upon arrival</td></tr></tbody></table>
      {feeKnown && <p className="prime-submission__courier">Please prepare <strong>{formatPHP(fee)}</strong> for payment to the courier upon arrival.</p>}
    </section>}
    <div className="prime-submission__actions">{onViewOrder && <button type="button" onClick={onViewOrder}>View Order</button>}<button type="button" onClick={onContinueShopping}>Continue Shopping</button></div>
    {order.trackingUrl && /^https:\/\//i.test(order.trackingUrl) && <a className="prime-submission__tracking" href={order.trackingUrl} target="_blank" rel="noopener noreferrer">Track Shipment</a>}
  </section>;
}
