package ph.primenetwork.smsbridge;
import android.content.*;
public final class BootReceiver extends BroadcastReceiver {public void onReceive(Context context,Intent intent){if(!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()))return;try(BridgeStore store=new BridgeStore(context)){if(store.enabled()){ListenerService.start(context);if(!store.pending().isEmpty())SyncJob.schedule(context);}}}}
