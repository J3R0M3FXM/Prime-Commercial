import ph.primenetwork.smsbridge.PaymentFilter;
public class PaymentFilterTest {
 public static void main(String[] args){String sms="2026-11-19 23:40:44\nPayment received: PHP 946.00 via QRPH.\nTotal QR sales since 12:00 am is PHP 946.00.\nQR Ph Invoice No: 435346\nTRN: oTxbv7Zvyd18";if(!PaymentFilter.accepts("MayaBiz",sms))throw new AssertionError("genuine sample");if(PaymentFilter.accepts("Maya",sms)||PaymentFilter.accepts("MayaBiz",sms+"\nOTP 123456")||PaymentFilter.accepts("MayaBiz",sms.replace("435346","4353467")))throw new AssertionError("sender/OTP/reference guard");System.out.println("PASS: native MayaBiz sample, sender, OTP and reference filtering");}
}
