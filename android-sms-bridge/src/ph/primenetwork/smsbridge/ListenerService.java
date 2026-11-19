package ph.primenetwork.smsbridge;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
/** User-enabled, visible owner-phone listener. No indefinite CPU wake lock. */
public final class ListenerService extends Service {
  private static final String CHANNEL="payment-listener";
  public static void start(Context context){try{context.startForegroundService(new Intent(context,ListenerService.class));}catch(RuntimeException error){try(BridgeStore store=new BridgeStore(context)){store.status("Open PRIME SMS Bridge to restart the listening notification.");}}}
  public static void stop(Context context){context.stopService(new Intent(context,ListenerService.class));}
  public void onCreate(){super.onCreate();NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Payment SMS listener",NotificationManager.IMPORTANCE_LOW));}
  public int onStartCommand(Intent intent,int flags,int startId){
    try(BridgeStore store=new BridgeStore(this)){if(!store.enabled()||checkSelfPermission(android.Manifest.permission.RECEIVE_SMS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY;}}
    PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    PendingIntent pause=PendingIntent.getService(this,1,new Intent(this,ListenerService.class).setAction("pause"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    if(intent!=null&&"pause".equals(intent.getAction())){try(BridgeStore store=new BridgeStore(this)){store.prefs().edit().putBoolean("enabled",false).commit();store.status("Forwarding paused from notification.");}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
    Notification notification=new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("PRIME payment SMS listener active").setContentText("MayaBiz confirmations only · Tap to open").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE).setVisibility(Notification.VISIBILITY_PRIVATE).addAction(new Notification.Action.Builder(null,"Pause",pause).build()).build();
    if(Build.VERSION.SDK_INT>=34)startForeground(946002,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);else startForeground(946002,notification);
    return START_STICKY;
  }
  public IBinder onBind(Intent intent){return null;}
}
