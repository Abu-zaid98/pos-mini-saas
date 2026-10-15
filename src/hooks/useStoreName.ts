import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

/**
 * Hook to reactively read the store name from settings.
 * Returns '' when the name is cleared — the UI then shows the logo alone
 * instead of a placeholder/default name.
 */
export function useStoreName(): string {
  const setting = useLiveQuery(() => db.settings.get('storeName'), [])
  const value = setting?.value
  return typeof value === 'string' ? value.trim() : ''
}
