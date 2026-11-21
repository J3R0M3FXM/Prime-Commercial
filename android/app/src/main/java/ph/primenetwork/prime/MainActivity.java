package ph.primenetwork.prime;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecureAdminAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
