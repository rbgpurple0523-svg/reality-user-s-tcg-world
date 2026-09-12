import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin SDK (server-only)
 *
 * このファイルはNext.jsのサーバー側でのみ使用します。
 * ブラウザ側の src/lib/firebase.ts とは分離し、Admin権限の認証情報を
 * NEXT_PUBLIC_* ではなく FIREBASE_ADMIN_* 環境変数から読み込みます。
 */

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId) {
  throw new Error('FIREBASE_ADMIN_PROJECT_ID が設定されていません。');
}

if (!clientEmail) {
  throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL が設定されていません。');
}

if (!privateKey) {
  throw new Error('FIREBASE_ADMIN_PRIVATE_KEY が設定されていません。');
}

const adminApp: App =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

export const adminDb: Firestore = getFirestore(adminApp);