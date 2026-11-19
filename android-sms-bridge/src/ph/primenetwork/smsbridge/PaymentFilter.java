package ph.primenetwork.smsbridge;
import java.util.regex.Pattern;
public final class PaymentFilter {
  private static final Pattern PAYMENT=Pattern.compile("(?m)^Payment received:[ \\t]*PHP[ \\t]+[0-9,.]+[ \\t]+via[ \\t]+QRPH\\.[ \\t]*$",Pattern.CASE_INSENSITIVE);
  private static final Pattern DATE=Pattern.compile("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}(?:\\r?\\n)");
  private static final Pattern INVOICE=Pattern.compile("(?im)^QR[ \\t]*Ph[ \\t]+Invoice[ \\t]+No\\.?[ \\t]*:[ \\t]*[0-9]{6}[ \\t]*$");
  private static final Pattern TRN=Pattern.compile("(?im)^TRN[ \\t]*:[ \\t]*[A-Za-z0-9]{12}[ \\t]*$");
  private static final Pattern PRIVATE=Pattern.compile("\\b(?:OTP|one[- ]time|password|security code|verification code)\\b",Pattern.CASE_INSENSITIVE);
  public static boolean accepts(String sender,String body){return sender!=null&&sender.trim().equalsIgnoreCase("MayaBiz")&&body!=null&&body.length()<=2000&&DATE.matcher(body).find()&&PAYMENT.matcher(body).find()&&INVOICE.matcher(body).find()&&TRN.matcher(body).find()&&!PRIVATE.matcher(body).find();}
}
