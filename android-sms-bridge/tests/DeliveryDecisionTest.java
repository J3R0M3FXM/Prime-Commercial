import ph.primenetwork.smsbridge.DeliveryDecision;
public class DeliveryDecisionTest {
  private static void check(int status,boolean accepted,boolean error,String code,int expected){if(DeliveryDecision.classify(status,accepted,error,code)!=expected)throw new AssertionError("Unexpected delivery decision for HTTP "+status+" "+code);}
  public static void main(String[] args){
    check(200,true,false,"",DeliveryDecision.DELIVERED);
    check(200,false,false,"",DeliveryDecision.RETRY);
    check(403,false,false,"",DeliveryDecision.RETRY);
    check(403,false,true,"EDGE_DENIED",DeliveryDecision.RETRY);
    check(403,false,true,"PAIRED_DEVICE_REQUIRED",DeliveryDecision.PAIR_REQUIRED);
    check(422,false,true,"PAYMENT_TIME_AFTER_SMS",DeliveryDecision.BLOCKED);
    check(400,false,true,"INVALID_SMS_PAYLOAD",DeliveryDecision.BLOCKED);
    check(410,false,true,"CONFIRMATION_EXPIRED",DeliveryDecision.BLOCKED);
    check(400,false,false,"",DeliveryDecision.RETRY);
    check(422,false,true,"",DeliveryDecision.RETRY);
    check(503,false,true,"UNAVAILABLE",DeliveryDecision.RETRY);
    System.out.println("PASS: confirmed delivery, structured rejection, genuine revoked pairing and transient/HTML errors remain distinct.");
  }
}
