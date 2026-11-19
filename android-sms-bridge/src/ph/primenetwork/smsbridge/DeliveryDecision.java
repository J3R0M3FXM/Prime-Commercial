package ph.primenetwork.smsbridge;
/** Preserve queued evidence when the gateway has not returned a structured decision. */
public final class DeliveryDecision {
  public static final int DELIVERED=0,PAIR_REQUIRED=1,BLOCKED=2,RETRY=3;
  public static int classify(int status,boolean accepted,boolean hasError,String code){
    if(status==200&&accepted)return DELIVERED;
    if(status==403&&"PAIRED_DEVICE_REQUIRED".equals(code))return PAIR_REQUIRED;
    if((status==400||status==422||status==410)&&hasError&&code!=null&&!code.isEmpty())return BLOCKED;
    return RETRY;
  }
}
