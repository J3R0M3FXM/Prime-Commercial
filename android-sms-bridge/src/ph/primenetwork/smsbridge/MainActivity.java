package ph.primenetwork.smsbridge;
import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
public final class MainActivity extends Activity {
  private BridgeStore store;private LinearLayout body;private EditText code;private TextView status;private boolean busy=false;private Typeface lato;
  private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
  public void onCreate(Bundle state){super.onCreate(state);store=new BridgeStore(this);try{lato=Typeface.createFromAsset(getAssets(),"Lato-Regular.ttf");}catch(Exception ignored){lato=Typeface.create("sans-serif-condensed",Typeface.NORMAL);}render();readLink(getIntent());}
  protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);readLink(intent);}
  private void readLink(Intent intent){Uri uri=intent.getData();if(uri!=null&&"prime-sms".equals(uri.getScheme())&&"pair".equals(uri.getHost()))code.setText(uri.getQueryParameter("code"));}
  private TextView text(String value,int size){TextView view=new TextView(this);view.setText(value);view.setTextColor(Color.rgb(30,41,59));view.setTextSize(size);view.setTypeface(lato);view.setPadding(0,dp(6),0,dp(6));return view;}
  private Button button(String label,Runnable action){Button button=new Button(this);button.setText(label);button.setAllCaps(false);button.setTypeface(lato);button.setOnClickListener(view->{if(!busy)action.run();});return button;}
  private void render(){
    FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(2,6,23));ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Color.rgb(243,244,246));int width=Math.min(getResources().getDisplayMetrics().widthPixels,dp(430));FrameLayout.LayoutParams dimensions=new FrameLayout.LayoutParams(width,-1,Gravity.CENTER);frame.addView(scroll,dimensions);
    body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(18),dp(28),dp(18),dp(24));scroll.addView(body);setContentView(frame);
    scroll.setOnApplyWindowInsetsListener((view,insets)->{body.setPadding(dp(18),insets.getSystemWindowInsetTop()+dp(16),dp(18),insets.getSystemWindowInsetBottom()+dp(24));return insets;});
    TextView heading=text("PRIME SMS Bridge",27);heading.setTypeface(Typeface.createFromAsset(getAssets(),"RobotoCondensed.ttf"));body.addView(heading);
    body.addView(text("Owner payment phone · MayaBiz · v1.1",14));
    TextView disclosure=text("When enabled, this app sends only incoming MayaBiz payment-confirmation SMS to PRIME. The message body, sender and SMS timestamp are encrypted in a local retry queue and delivered over HTTPS. OTPs and other senders are ignored. It cannot read your SMS history, send SMS, or approve an order.",15);
    GradientDrawable card=new GradientDrawable();card.setColor(Color.WHITE);card.setCornerRadius(dp(16));disclosure.setBackground(card);disclosure.setPadding(dp(14),dp(14),dp(14),dp(14));body.addView(disclosure);
    body.addView(text("Pair this phone",20));body.addView(text("In PRIME Admin → Payments → SMS Bridge, create a pairing code, then paste it here. The code expires after ten minutes.",14));
    code=new EditText(this);code.setSingleLine(true);code.setHint("Pairing code");code.setTypeface(lato);code.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);body.addView(code);
    body.addView(button("Pair phone",()->pair()));
    body.addView(button("Enable payment SMS forwarding",()->enable()));
    body.addView(button("Pause forwarding",()->{store.prefs().edit().putBoolean("enabled",false).commit();ListenerService.stop(this);store.status("Paused. New messages are not captured.");refresh();}));
    body.addView(button("Sync queued payments now",()->{if(!store.enabled()){store.status("Enable forwarding before syncing.");refresh();return;}if(store.pending().isEmpty()){store.status("No pending messages. Use Retry blocked messages for blocked confirmations.");refresh();return;}SyncJob.schedule(this);store.status("Sync scheduled. Delivery is not yet confirmed.");refresh();}));
    body.addView(button("Retry blocked messages",()->{if(!store.enabled()){store.status("Enable forwarding before retrying.");refresh();return;}new android.app.AlertDialog.Builder(this).setMessage("Retry blocked confirmations with their original content and timestamps? PRIME will run the same validation checks.").setNegativeButton("Cancel",null).setPositiveButton("Retry",(dialog,which)->{int count=store.retryBlocked();store.status(count==0?"No blocked messages to retry.":"Queued "+count+" blocked message(s) for retry. Delivery is not yet confirmed.");if(count>0)SyncJob.schedule(this);refresh();}).show();}));
    body.addView(button("Refresh status",()->refresh()));
    status=text("",14);status.setTextIsSelectable(true);body.addView(status);
    body.addView(button("Android app / battery settings",()->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())))));
    body.addView(button("Disconnect and clear this phone",()->new android.app.AlertDialog.Builder(this).setMessage("Clear pairing and all locally queued payment messages? Revoke this phone in PRIME Admin too.").setNegativeButton("Cancel",null).setPositiveButton("Disconnect",(dialog,which)->{ListenerService.stop(this);store.disconnect();refresh();}).show()));
    body.addView(text("Keep this phone on and connected. Reopen the app after force-stop. Android and manufacturer battery restrictions can delay delivery. PRIME staff still review payment evidence.",13));refresh();
  }
  private void refresh(){if(status==null)return;boolean permission=checkSelfPermission(Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED;String last=store.prefs().getString("status","");String reason=store.blockedReason();status.setText("Paired: "+(store.paired()?"Yes":"No")+"\nSMS permission: "+(permission?"Granted":"Not granted")+"\nForwarding: "+(store.enabled()?"Enabled":"Paused")+"\n"+store.counts()+(reason.isEmpty()?"":"\nBlocked reason: "+reason)+"\n"+last);}
  private void pair(){String value=code.getText().toString().trim();if(value.startsWith("prime-sms://")){try{value=Uri.parse(value).getQueryParameter("code");}catch(Exception ignored){}}if(value==null||!value.matches("[a-fA-F0-9]{32}")){store.status("Paste the 32-character code from PRIME Admin.");refresh();return;}final String pairCode=value.toLowerCase(java.util.Locale.US);busy=true;store.status("Pairing…");refresh();new Thread(()->{String result;try{JSONObject request=new JSONObject().put("code",pairCode).put("deviceId",store.deviceId());BridgeNetwork.Reply reply=BridgeNetwork.post("/sms/pair",request.toString(),null);String key=reply.data.optString("token","");if(reply.status!=200||!key.matches("[a-f0-9]{64}")||!store.deviceId().equals(reply.data.optString("deviceId")))throw new Exception("Pairing failed. Create a fresh code in PRIME.");store.saveToken(key);result="Paired. Enable forwarding to grant SMS access.";}catch(Exception error){result="Pairing could not complete. Check connectivity and the code.";}final String message=result;runOnUiThread(()->{busy=false;store.status(message);code.setText("");refresh();});},"prime-sms-pair").start();}
  private void enable(){if(!store.paired()){store.status("Pair this phone first.");refresh();return;}if(checkSelfPermission(Manifest.permission.RECEIVE_SMS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECEIVE_SMS},946);return;}if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},947);return;}store.prefs().edit().putBoolean("enabled",true).commit();ListenerService.start(this);store.status("Enabled. Only new matching MayaBiz confirmations are forwarded.");SyncJob.schedule(this);refresh();}
  public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==947){if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)enable();else{store.status("Allow notifications to enable the visible payment listener.");refresh();}}if(request==946){if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)enable();else{store.status("SMS permission was not granted. Check Android app permissions.");refresh();}}}
  protected void onResume(){super.onResume();if(store!=null){if(store.enabled())ListenerService.start(this);refresh();}}
  protected void onDestroy(){if(store!=null)store.close();super.onDestroy();}
}
