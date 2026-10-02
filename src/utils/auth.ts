import bcrypt from 'bcryptjs'
import { db } from '../db/db'

const SALT_ROUNDS = 10
const LOCAL_STORAGE_PIN_KEY = 'pos_pin_hash'

/**
 * Hash a password and store it in Dexie settings and browser localStorage
 */
export async function setPassword(password: string): Promise<void> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  try {
    localStorage.setItem(LOCAL_STORAGE_PIN_KEY, hash)
  } catch {}
  await db.settings.put({ key: 'passwordHash', value: hash })
}

/**
 * Get the currently stored password hash from DB or localStorage
 */
async function getStoredHash(): Promise<string | null> {
  try {
    const setting = await db.settings.get('passwordHash')
    if (setting?.value && typeof setting.value === 'string') {
      return setting.value
    }
  } catch {}

  try {
    const localHash = localStorage.getItem(LOCAL_STORAGE_PIN_KEY)
    if (localHash) {
      return localHash
    }
  } catch {}

  return null
}

/**
 * Verify a password against the stored hash.
 * If no password was ever set, returns false (triggers first-time setup).
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const storedHash = await getStoredHash()

  if (!storedHash) {
    return false
  }

  try {
    return await bcrypt.compare(password, storedHash)
  } catch (err) {
    console.error('Password verify error:', err)
    return false
  }
}

/**
 * Reset password (clears only the saved PIN/hash so the app returns to first-time setup)
 * This does not delete customer data, inventory, invoices, or any other app records.
 */
export async function resetToDefaultPassword(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_PIN_KEY)
  } catch {}
  await db.settings.put({ key: 'passwordHash', value: null })
}

/**
 * Check if a custom password has been set
 */
export async function hasPassword(): Promise<boolean> {
  const storedHash = await getStoredHash()
  return !!storedHash
}

/**
 * Change password: verify old one first, then store new password in browser
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<boolean> {
  const valid = await verifyPassword(oldPassword)
  if (!valid) return false
  await setPassword(newPassword)
  return true
}
