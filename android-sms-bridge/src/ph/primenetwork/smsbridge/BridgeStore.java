package ph.primenetwork.smsbridge;
import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import android.security.keystore.*;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;
public final class BridgeStore extends SQLiteOpenHelper {
  private final Context context;
  public BridgeStore(Context c){super(c,"payment-events.db",null,2);context=c.getApplicationContext();}
  public void onCreate(SQLiteDatabase db){db.execSQL("CREATE TABLE queue(id TEXT PRIMARY KEY,payload TEXT,received_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',rejection_reason TEXT)");}
  public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){if(oldVersion<2)db.execSQL("ALTER TABLE queue ADD COLUMN rejection_reason TEXT");}
  public SharedPreferences prefs(){return context.getSharedPreferences("bridge",Context.MODE_PRIVATE);}
  public String deviceId(){String id=prefs().getString("deviceId","");if(id.isEmpty()){id=UUID.randomUUID().toString().replace("-","");prefs().edit().putString("deviceId",id).commit();}return id;}
  private SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);String alias="prime_sms_bridge_v1";if(store.containsAlias(alias))return (SecretKey)store.getKey(alias,null);KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return gen.generateKey();}
  public String encrypt(String plain)throws Exception{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);}
  public String decrypt(String value)throws Exception{String[] parts=value.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}
  public void saveToken(String value)throws Exception{prefs().edit().putString("token",encrypt(value)).putBoolean("enabled",false).commit();}
  public String token()throws Exception{String value=prefs().getString("token","");return value.isEmpty()?"":decrypt(value);}
  public boolean paired(){return !prefs().getString("token","").isEmpty();}
  public boolean enabled(){return prefs().getBoolean("enabled",false)&&paired();}
  public void status(String message){prefs().edit().putString("status",message).apply();}
  public boolean enqueue(String sender,String body,long time)throws Exception{
    SQLiteDatabase db=getWritableDatabase();db.delete("queue","received_at < ?",new String[]{String.valueOf(System.currentTimeMillis()-30L*86400000)});
    try(Cursor c=db.rawQuery("SELECT count(*) FROM queue WHERE state='pending'",null)){c.moveToFirst();if(c.getInt(0)>=1000){status("Queue full. Open PRIME SMS Bridge.");return false;}}
    byte[] bytes=MessageDigest.getInstance("SHA-256").digest((sender+"\n"+body+"\n"+time).getBytes(StandardCharsets.UTF_8));StringBuilder id=new StringBuilder();for(byte b:bytes)id.append(String.format(Locale.US,"%02x",b&255));
    JSONObject payload=new JSONObject().put("sender",sender).put("body",body).put("receivedAt",time);
    ContentValues values=new ContentValues();values.put("id",id.toString());values.put("payload",encrypt(payload.toString()));values.put("received_at",time);
    return db.insertWithOnConflict("queue",null,values,SQLiteDatabase.CONFLICT_IGNORE)>=0;
  }
  public List<String[]> pending(){List<String[]> list=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,payload FROM queue WHERE state='pending' ORDER BY received_at LIMIT 20",null)){while(c.moveToNext())list.add(new String[]{c.getString(0),c.getString(1)});}return list;}
  public void accepted(String id){ContentValues values=new ContentValues();values.put("state","sent");values.putNull("payload");getWritableDatabase().update("queue",values,"id=?",new String[]{id});prefs().edit().putLong("lastSent",System.currentTimeMillis()).apply();}
  public void blocked(String id,String reason){ContentValues values=new ContentValues();values.put("state","blocked");values.put("rejection_reason",reason);getWritableDatabase().update("queue",values,"id=?",new String[]{id});}
  public String blockedReason(){try(Cursor c=getReadableDatabase().rawQuery("SELECT rejection_reason FROM queue WHERE state='blocked' ORDER BY received_at DESC LIMIT 1",null)){if(!c.moveToFirst())return "";return c.isNull(0)?"Blocked by an older app version. Retry to obtain the server reason.":c.getString(0);}}
  public int retryBlocked(){try(SQLiteStatement statement=getWritableDatabase().compileStatement("UPDATE queue SET state='pending',rejection_reason=NULL WHERE id IN (SELECT id FROM queue WHERE state='blocked' AND payload IS NOT NULL ORDER BY received_at LIMIT 1000)")){return statement.executeUpdateDelete();}}
  public String counts(){try(Cursor c=getReadableDatabase().rawQuery("SELECT state,count(*) FROM queue GROUP BY state",null)){StringBuilder text=new StringBuilder();while(c.moveToNext())text.append(c.getString(0)).append(": ").append(c.getInt(1)).append("   ");return text.length()==0?"No payment messages received yet.":text.toString();}}
  public void disconnect(){prefs().edit().remove("token").putBoolean("enabled",false).remove("status").commit();getWritableDatabase().delete("queue",null,null);}
}
