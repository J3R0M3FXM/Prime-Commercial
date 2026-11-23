package ph.primenetwork.prime.smsbridge;
import ph.primenetwork.prime.MainActivity;
import ph.primenetwork.prime.SecureAdminAuthPlugin;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import org.json.*;
/** User-enabled, visible owner-phone listener. No indefinite CPU wake lock. */
public final class ListenerService extends Service {
  private static final String CHANNEL="payment-listener";
  private static final String ALERT_CHANNEL="prime-admin-alerts";
  private static final long ALERT_POLL_MS=30000L;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final Runnable alertPoller=new Runnable(){public void run(){pollAdminAlerts();handler.postDelayed(this,ALERT_POLL_MS);}};
  public static void start(Context context){try{context.startForegroundService(new Intent(context,ListenerService.class));}catch(RuntimeException error){try(BridgeStore store=new BridgeStore(context)){store.status("Open PRIME SMS Bridge to restart the listening notification.");}}}
  public static void stop(Context context){context.stopService(new Intent(context,ListenerService.class));}
  public void onCreate(){super.onCreate();NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Payment SMS listener",NotificationManager.IMPORTANCE_LOW));manager.createNotificationChannel(new NotificationChannel(ALERT_CHANNEL,"PRIME Admin alerts",NotificationManager.IMPORTANCE_HIGH));}
  public int onStartCommand(Intent intent,int flags,int startId){
    try(BridgeStore store=new BridgeStore(this)){if(!store.enabled()||checkSelfPermission(android.Manifest.permission.RECEIVE_SMS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY;}}
    PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    PendingIntent pause=PendingIntent.getService(this,1,new Intent(this,ListenerService.class).setAction("pause"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    if(intent!=null&&"pause".equals(intent.getAction())){try(BridgeStore store=new BridgeStore(this)){store.prefs().edit().putBoolean("enabled",false).commit();store.status("Forwarding paused from notification.");}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
    Notification notification=new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("PRIME payment SMS listener active").setContentText("MayaBiz confirmations only · Tap to open").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE).setVisibility(Notification.VISIBILITY_PRIVATE).addAction(new Notification.Action.Builder(null,"Pause",pause).build()).build();
    if(Build.VERSION.SDK_INT>=34)startForeground(946002,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);else startForeground(946002,notification);
    handler.removeCallbacks(alertPoller);handler.post(alertPoller);
    return START_STICKY;
  }
  private void pollAdminAlerts(){new Thread(()->{try(BridgeStore store=new BridgeStore(this)){
    String session=SecureAdminAuthPlugin.readStoredSession(this);if(session.isEmpty())return;
    long since=store.prefs().getLong("lastAdminAlertAt",0L);BridgeNetwork.Reply reply=BridgeNetwork.notifications(since,session);if(reply.status==401){store.status("Admin session expired. Open Admin to sign in again.");return;}if(reply.status!=200)return;
    JSONArray events=reply.data.optJSONArray("data");if(events==null)return;long newest=since;
    for(int i=0;i<events.length();i++){JSONObject event=events.optJSONObject(i);if(event==null)continue;long created=event.optLong("createdAt",0L);if(created>newest)newest=created;String title=event.optString("title","PRIME Admin update");String body=event.optString("body","New activity requires review.");int id=Math.abs(event.optString("id",String.valueOf(created)).hashCode());if(id==0)id=946003;PendingIntent open=PendingIntent.getActivity(this,id,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);Notification alert=new Notification.Builder(this,ALERT_CHANNEL).setSmallIcon(android.R.drawable.stat_notify_more).setContentTitle(title).setContentText(body).setContentIntent(open).setAutoCancel(true).setCategory(Notification.CATEGORY_EVENT).setPriority(Notification.PRIORITY_HIGH).build();getSystemService(NotificationManager.class).notify(id,alert);}
    if(newest>since)store.prefs().edit().putLong("lastAdminAlertAt",newest).apply();
  }catch(Exception ignored){}}
  ,"prime-admin-alert-poll").start();}
  public void onDestroy(){handler.removeCallbacks(alertPoller);super.onDestroy();}
  public IBinder onBind(Intent intent){return null;}
}
