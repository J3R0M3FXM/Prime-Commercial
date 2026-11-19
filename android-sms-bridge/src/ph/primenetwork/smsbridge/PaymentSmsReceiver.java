package ph.primenetwork.smsbridge;
import android.content.*;
import android.provider.Telephony;
import android.telephony.SmsMessage;
public final class PaymentSmsReceiver extends BroadcastReceiver {
  public void onReceive(Context context,Intent intent){
    if(!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction()))return;
    SmsMessage[] parts=Telephony.Sms.Intents.getMessagesFromIntent(intent);if(parts==null||parts.length==0)return;
    String sender=parts[0].getOriginatingAddress();if(sender==null||!sender.trim().equalsIgnoreCase("MayaBiz"))return;
    StringBuilder text=new StringBuilder();for(SmsMessage part:parts){if(!sender.equals(part.getOriginatingAddress()))return;text.append(part.getMessageBody());}
    final String message=text.toString();if(!PaymentFilter.accepts(sender,message))return;
    PendingResult pending=goAsync();new Thread(()->{try(BridgeStore store=new BridgeStore(context)){if(store.enabled()&&store.enqueue(sender,message,parts[0].getTimestampMillis()))SyncJob.schedule(context);}catch(Exception error){try(BridgeStore store=new BridgeStore(context)){store.status("Could not queue a message. Open the app.");}}finally{pending.finish();}},"prime-sms-receive").start();
  }
}
