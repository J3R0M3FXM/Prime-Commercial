package ph.primenetwork.prime;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureAdminAuth")
public class SecureAdminAuthPlugin extends Plugin {
    private static final String KEY_ALIAS = "prime_admin_session_v1";
    private static final String PREFS = "prime_secure_admin";
    private static final String CIPHERTEXT = "ciphertext";
    private static final String IV = "iv";

    @PluginMethod
    public void store(PluginCall call) {
        String value = call.getString("value", "");
        if (value == null || value.isEmpty()) { call.reject("A session value is required."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            android.content.SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit().putString(CIPHERTEXT, android.util.Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), android.util.Base64.NO_WRAP))
                .putString(IV, android.util.Base64.encodeToString(cipher.getIV(), android.util.Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception error) { call.reject("Could not protect the Admin session.", error); }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            android.content.SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String ciphertext = prefs.getString(CIPHERTEXT, "");
            String iv = prefs.getString(IV, "");
            if (ciphertext.isEmpty() || iv.isEmpty()) { call.resolve(new JSObject()); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, android.util.Base64.decode(iv, android.util.Base64.NO_WRAP)));
            JSObject result = new JSObject();
            result.put("value", new String(cipher.doFinal(android.util.Base64.decode(ciphertext, android.util.Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read the protected Admin session.", error); }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        KeyguardManager manager = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (manager == null || !manager.isKeyguardSecure()) { call.reject("Set an Android screen lock before opening Admin."); return; }
        Intent intent = manager.createConfirmDeviceCredentialIntent("Unlock PRIME Admin", "Confirm your device screen lock to continue.");
        if (intent == null) { call.reject("Android device authentication is unavailable."); return; }
        startActivityForResult(call, intent, "unlockResult");
    }

    @ActivityCallback
    private void unlockResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) call.resolve();
        else call.reject("Device authentication was cancelled.");
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUserAuthenticationRequired(false).build());
        return generator.generateKey();
    }
}
