// ==============================================================================
// FIRESTORE HAS BEEN DISCONNECTED IN FAVOR OF SUPABASE
// ==============================================================================

export const db = new Proxy({}, {
  get(_target, prop) {
    throw new Error('Firestore has been disconnected from this project. Please use Supabase via lib/supabase.ts.');
  }
});

export const auth = new Proxy({}, {
  get(_target, prop) {
    throw new Error('Firebase Auth has been disconnected from this project. Please use Supabase Auth.');
  }
});
