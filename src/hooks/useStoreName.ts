import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

/**
 * Hook to reactively read the store name from settings.
 * Falls back to 'متجري' if not set yet.
 */
export function useStoreName(): string {
  const setting = useLiveQuery(() => db.settings.get('storeName'), [])
  return (setting?.value as string) || 'متجري'
}
