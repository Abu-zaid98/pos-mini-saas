/**
 * types.ts — تعريفات TypeScript للوحة تحكم الاشتراكات
 */

/** حالة الاشتراك */
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'expired' | 'suspended'

/** التطبيق المرتبط بالاشتراك */
export interface AppInfo {
  id: string
  name: string
  description?: string
}

/** بيانات المشترك في Firebase Auth */
export interface SubscriberUser {
  uid: string
  email: string
  displayName?: string
  createdAt: Date
  lastSignIn?: Date
  disabled: boolean
}

/** بيانات الاشتراك في Firestore — collection: subs/{uid}_{appId} */
export interface Subscription {
  id: string             // uid_appId
  uid: string            // Firebase Auth UID
  appId: string          // معرّف التطبيق
  username: string       // اسم المستخدم
  email: string          // البريد الإلكتروني
  displayName?: string   // الاسم الكامل (اختياري)
  phone?: string         // رقم الواتساب (اختياري)
  token: string          // JWT token موقّع بـ ECDSA
  status: SubscriptionStatus
  startDate: Date        // تاريخ بدء الاشتراك
  expiryDate: Date       // تاريخ انتهاء الاشتراك
  graceDays: number      // أيام السماح بعد الانتهاء
  notes?: string         // ملاحظات
  createdAt: Date
  updatedAt: Date
}

/** نموذج إنشاء مشترك جديد */
export interface CreateSubscriberForm {
  username: string
  password: string
  displayName?: string
  phone?: string
  appId: string
  durationDays: number   // مدة الاشتراك بالأيام
  durationHours?: number // ساعات إضافية (0-23+)
  graceDays: number      // أيام السماح
  graceHours?: number    // ساعات سماح إضافية
  customExpiryMs?: number // تاريخ انتهاء مخصص (يتجاوز المدة)
  isTrial: boolean       // فترة تجريبية
  notes?: string
}

/** نموذج تجديد الاشتراك */
export interface RenewSubscriptionForm {
  mode: 'extend' | 'set'      // تمديد من التاريخ الحالي أم تعيين تاريخ محدد
  durationDays: number
  durationHours?: number
  customExpiryMs?: number     // يُستخدم عند mode === 'set'
  extendFrom?: 'expiry' | 'now' // التمديد من تاريخ الانتهاء أم من الآن
  graceDays: number
  graceHours?: number
  notes?: string
}

/** نموذج تعديل سريع (زيادة/إنقاص) */
export interface AdjustSubscriptionForm {
  deltaDays: number   // قد يكون سالباً
  deltaHours?: number // قد يكون سالباً
  notes?: string
}

/** إحصائيات لوحة التحكم */
export interface DashboardStats {
  total: number
  active: number
  trial: number
  grace: number
  expired: number
  suspended: number
  expiringSoon: number   // تنتهي خلال 7 أيام
}

/** بيانات المدير في Firestore — collection: admins/{uid} — بدون كلمة مرور أبداً */
export interface AdminUser {
  uid: string
  email: string
  displayName?: string
  active: boolean
  createdAt: Date
  createdBy?: string
}

/** مفتاح ECDSA */
export interface EcdsaKeyPair {
  id: string
  appId: string
  publicKey: JsonWebKey
  privateKey: JsonWebKey   // محفوظ في localStorage فقط — لا يُرفع لـ Firestore
  createdAt: Date
  description?: string
}

/** خطة سعر: مدة + سعر ثابت للاختيار السريع عند الإنشاء/التجديد */
export interface Plan {
  id?: string
  name: string
  durationDays: number
  durationHours?: number
  price: number
  currency: string
  trial?: boolean
  active: boolean
  createdAt: Date
}

/** سجل دفعة/إيصال تجديد — برقم متسلسل ولقطة للطباعة */
export interface PaymentRecord {
  id?: string
  subscriptionId: string
  subscriberEmail: string
  subscriberName?: string
  phone?: string
  amount: number
  currency: string
  method: 'cash' | 'transfer' | 'other'
  methodLabel?: string
  periodLabel: string
  fromDate: Date
  toDate: Date
  receiptNo: string
  notes?: string
  adminEmail?: string
  createdAt: Date
}

/** قوالب رسائل الواتساب القابلة للتخصيص من الإعدادات */
export interface WhatsTemplates {
  renewal: string
  expiring: string
  expired: string
  receipt: string
}

/** سجل النشاط */
export interface ActivityLog {
  id?: string
  action: 'created' | 'renewed' | 'suspended' | 'reactivated' | 'deleted' | 'token_issued' | 'adjusted' | 'expiry_set' | 'admin_created' | 'admin_updated' | 'admin_deleted' | 'devices_reset' | 'payment_recorded'
  subscriberId: string
  subscriberEmail: string
  adminEmail: string
  details?: string
  timestamp: Date
}
