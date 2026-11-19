package ph.primenetwork.smsbridge;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
public final class BridgeNetwork {
  public static final String ORIGIN="https://prime-media-gateway.pages.dev";
  public static final class Reply {public final int status;public final JSONObject data;Reply(int s,JSONObject d){status=s;data=d;}}
  public static Reply post(String path,String body,String bearer)throws Exception{
    if(!path.equals("/sms/pair")&&!path.equals("/sms/ingest"))throw new SecurityException("Unsupported route");
    HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+path).openConnection();
    connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("User-Agent","PRIME-SMS-Bridge/1.1 (Android)");
    if(bearer!=null&&!bearer.isEmpty())connection.setRequestProperty("Authorization","Bearer "+bearer);
    try{byte[] data=body.getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(data.length);try(OutputStream stream=connection.getOutputStream()){stream.write(data);}int status=connection.getResponseCode();InputStream stream=status<400?connection.getInputStream():connection.getErrorStream();ByteArrayOutputStream output=new ByteArrayOutputStream();if(stream!=null)try(InputStream input=stream){byte[] block=new byte[2048];int n;while((n=input.read(block))!=-1){output.write(block,0,n);if(output.size()>12000)throw new IOException("Response too large");}}JSONObject json;try{json=new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));}catch(Exception error){json=new JSONObject();}return new Reply(status,json);}finally{connection.disconnect();}
  }
}
