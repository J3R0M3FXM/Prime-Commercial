package ph.primenetwork.prime.smsbridge;
import android.app.job.*;
import android.content.*;
public final class SyncJob extends JobService {
  public static void schedule(Context context){JobScheduler jobs=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);jobs.schedule(new JobInfo.Builder(946001,new ComponentName(context,SyncJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setMinimumLatency(1000).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());}
  public boolean onStartJob(JobParameters params){new Thread(()->{boolean retry=false;try(BridgeStore store=new BridgeStore(this)){
    if(!store.enabled()){jobFinished(params,false);return;}
    String bearer=store.deviceId()+"."+store.token();
    for(String[] row:store.pending()){
      if(!store.enabled())break;
      BridgeNetwork.Reply reply=BridgeNetwork.post("/sms/ingest",store.decrypt(row[1]),bearer);
      String code=reply.data.optString("errorCode","");String reason=reply.data.optString("error","");
      int decision=DeliveryDecision.classify(reply.status,reply.data.optBoolean("accepted"),!reason.isEmpty(),code);
      if(decision==DeliveryDecision.DELIVERED){store.accepted(row[0]);store.status("Last payment message delivered to PRIME.");}
      else if(decision==DeliveryDecision.PAIR_REQUIRED){store.prefs().edit().putBoolean("enabled",false).commit();ListenerService.stop(this);store.status("Pairing revoked or expired. Pair again.");break;}
      else if(decision==DeliveryDecision.BLOCKED){String detail="HTTP "+reply.status+" · "+code+" · "+reason.substring(0,Math.min(reason.length(),300));if(reply.data.has("smsTimestampMs")&&!reply.data.isNull("smsTimestampMs"))detail+="\nSMS timestamp (UTC): "+java.time.Instant.ofEpochMilli(reply.data.optLong("smsTimestampMs"));if(reply.data.has("paymentTime")&&!reply.data.isNull("paymentTime"))detail+="\nPayment time (UTC): "+reply.data.optString("paymentTime");store.blocked(row[0],detail);store.status("Message blocked. The saved reason is shown above.");}
      else{retry=true;store.status("PRIME did not confirm delivery (HTTP "+reply.status+"). Messages remain queued for retry.");break;}
    }
    if(!store.pending().isEmpty()&&store.enabled())retry=true;
  }catch(Exception error){retry=true;try(BridgeStore store=new BridgeStore(this)){store.status("Offline or sync interrupted. Messages remain queued.");}}
  jobFinished(params,retry);},"prime-sms-sync").start();return true;}
  public boolean onStopJob(JobParameters params){return true;}
}
