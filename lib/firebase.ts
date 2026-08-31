// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 既に初期化されている場合は既存のアプリを再利用する（二重初期化の防止）
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Firestore / Authentication のインスタンスをエクスポート
export const db = getFirestore(app);
export const auth = getAuth(app);

// 友達対戦では、メールアドレス等の登録を要求せず Firebase Authentication の
// 匿名認証でプレイヤーを一意に識別する。認証状態はFirebase SDKの既定動作により
// ブラウザ内で保持され、リロード後も同じuidを再利用できる。
let anonymousAuthPromise: Promise<User> | null = null;

export const ensureAnonymousAuth = async (): Promise<User> => {
  if (auth.currentUser) return auth.currentUser;
  if (typeof window === 'undefined') {
    throw new Error('Firebase Authentication はブラウザ上でのみ初期化できます。');
  }
  if (!anonymousAuthPromise) {
    anonymousAuthPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .catch((error) => {
        anonymousAuthPromise = null;
        throw error;
      });
  }
  return anonymousAuthPromise;
};