import { Receipt, Truck } from "lucide-react";
import { formatPHP } from "@/lib/currency";

export function DeliveryFeeReminder({ amount }: { amount: number }) {
  const isFree = amount <= 0;
  return (
    <aside className="checkout-reminder checkout-reminder--delivery" aria-label="Delivery fee reminder">
      <div className="checkout-reminder__heading">
        <span className="checkout-reminder__icon"><Truck aria-hidden="true" /></span>
        <h3>{isFree ? "Your delivery fee is covered" : "Pay the courier on delivery"}</h3>
      </div>
      <div className="checkout-reminder__amount-row">
        <span>Delivery fee</span>
        <span className="checkout-reminder__amount">{isFree ? "FREE" : formatPHP(amount)}</span>
      </div>
      <p>{isFree ? "No delivery fee to pay when your order arrives." : "Keep this amount ready for your courier. It is separate from your payment now."}</p>
    </aside>
  );
}

export default function CheckoutPaymentReminder({ amount, deliveryAmount, payUponDelivery }: {
  amount: number;
  deliveryAmount: number;
  payUponDelivery: boolean;
}) {
  return (
    <div className="checkout-reminders">
      <aside className="checkout-reminder checkout-reminder--payment" aria-label="Payment reminder">
        <div className="checkout-reminder__heading">
          <span className="checkout-reminder__icon"><Receipt aria-hidden="true" /></span>
          <h3>Before you submit your order</h3>
        </div>
        <div className="checkout-reminder__amount-row">
          <span>Pay now</span>
          <span className="checkout-reminder__amount">{formatPHP(amount)}</span>
        </div>
        <p>Choose a payment method below, then save and upload a clear copy of your receipt to submit your order.</p>
      </aside>
      {payUponDelivery && <DeliveryFeeReminder amount={deliveryAmount} />}
    </div>
  );
}
