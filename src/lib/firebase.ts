/**
 * Firebase Client Setup with Offline Persistence for «محلي»
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAR6eg1wH52JGL7L_cLkRD8QxylmtsHIgU",
  authDomain: "torkwaz-pos.firebaseapp.com",
  projectId: "torkwaz-pos",
  storageBucket: "torkwaz-pos.firebasestorage.app",
  messagingSenderId: "383070753031",
  appId: "1:383070753031:web:33964ba0b0913dd681f5a2",
  measurementId: "G-W4P50JYNK4"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const auth = getAuth(app);
export const isFirebaseConfigured = true;
export { app };
