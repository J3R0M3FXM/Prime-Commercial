package ph.primenetwork.smsbridge;
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
      if(reply.status==200&&reply.data.optBoolean("accepted")){store.accepted(row[0]);store.status("Last payment message delivered to PRIME.");}
      else if(reply.status==403){store.prefs().edit().putBoolean("enabled",false).commit();ListenerService.stop(this);store.status("Pairing revoked or expired. Pair again.");break;}
      else if(reply.status==422||reply.status==400||reply.status==410){store.blocked(row[0]);store.status("Message rejected by PRIME. Review bridge status.");}
      else{retry=true;store.status("PRIME unavailable. Messages remain queued.");break;}
    }
    if(!store.pending().isEmpty()&&store.enabled())retry=true;
  }catch(Exception error){retry=true;try(BridgeStore store=new BridgeStore(this)){store.status("Offline or sync interrupted. Messages remain queued.");}}
  jobFinished(params,retry);},"prime-sms-sync").start();return true;}
  public boolean onStopJob(JobParameters params){return true;}
}
