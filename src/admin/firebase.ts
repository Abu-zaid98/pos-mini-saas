/**
 * firebase.ts — إعداد Firebase SDK للوحة تحكم الأدمن
 * يستخدم نفس مشروع my-system-admin المرتبط بنظام الترخيص
 */
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY || 'AIzaSyB4RMwer7fmPM4dzfBj0CHkkayc5ExcaJk',
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN || 'my-system-admin.firebaseapp.com',
  projectId: import.meta.env.VITE_FB_PROJECT_ID || 'my-system-admin',
  appId: import.meta.env.VITE_FB_APP_ID || '1:374790599531:web:0b22b9db833219122b122e',
}

// تجنب التهيئة المزدوجة
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
