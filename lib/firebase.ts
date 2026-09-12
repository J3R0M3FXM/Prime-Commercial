import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

let localConfig: any = null;
try {
  localConfig = require('../firebase-applet-config.json');
} catch (e) {
  // Expected in Vercel environment
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || localConfig?.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || localConfig?.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || localConfig?.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || localConfig?.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || localConfig?.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || localConfig?.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const dbId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || localConfig?.firestoreDatabaseId || '(default)';
export const db = getFirestore(app, dbId);
export const auth = getAuth(app);
