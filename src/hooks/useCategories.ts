import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export interface CategoryItem {
  id: string
  name: string
  icon: string
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'beverages', name: 'مشروبات', icon: '🥤' },
  { id: 'snacks', name: 'وجبات خفيفة', icon: '🍿' },
  { id: 'cleaning', name: 'مواد تنظيف', icon: '🧹' },
  { id: 'dairy', name: 'ألبان وأجبان', icon: '🧀' },
  { id: 'bakery', name: 'خبز ومعجنات', icon: '🍞' },
  { id: 'other', name: 'أخرى', icon: '📦' },
]

export function useCategories(): CategoryItem[] {
  const categories = useLiveQuery(async () => {
    try {
      const setting = await db.settings.get('categories_list')
      if (setting && Array.isArray(setting.value)) {
        return setting.value as CategoryItem[]
      }

      // Fallback: check legacy string array setting 'categories'
      const legacy = await db.settings.get('categories')
      if (legacy && Array.isArray(legacy.value)) {
        const converted: CategoryItem[] = (legacy.value as string[]).map((name) => {
          const found = DEFAULT_CATEGORIES.find((d) => d.name === name)
          return {
            id: found?.id || `cat-${Math.random().toString(36).slice(2, 8)}`,
            name,
            icon: found?.icon || '📦',
          }
        })
        await db.settings.put({ key: 'categories_list', value: converted })
        return converted
      }

      // Initialize with default categories
      await db.settings.put({ key: 'categories_list', value: DEFAULT_CATEGORIES })
      return DEFAULT_CATEGORIES
    } catch (err) {
      console.error('[useCategories] Dexie error:', err)
      return DEFAULT_CATEGORIES
    }
  }, [])

  return categories ?? DEFAULT_CATEGORIES
}

export async function saveCategories(list: CategoryItem[]): Promise<void> {
  await db.settings.put({ key: 'categories_list', value: list })
}

export async function addCategory(name: string, icon = '📦'): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return

  const setting = await db.settings.get('categories_list')
  const current: CategoryItem[] = Array.isArray(setting?.value)
    ? (setting.value as CategoryItem[])
    : DEFAULT_CATEGORIES

  if (current.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('القسم موجود بالفعل')
  }

  const newItem: CategoryItem = {
    id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    icon: icon.trim() || '📦',
  }

  await saveCategories([...current, newItem])
}

export async function updateCategory(
  id: string,
  newName: string,
  newIcon: string
): Promise<void> {
  const trimmed = newName.trim()
  if (!trimmed) return

  const setting = await db.settings.get('categories_list')
  const current: CategoryItem[] = Array.isArray(setting?.value)
    ? (setting.value as CategoryItem[])
    : DEFAULT_CATEGORIES

  const target = current.find((c) => c.id === id)
  if (!target) return
  const oldName = target.name

  const updatedList = current.map((c) =>
    c.id === id ? { ...c, name: trimmed, icon: newIcon.trim() || '📦' } : c
  )

  await db.transaction('rw', [db.settings, db.products], async () => {
    await db.settings.put({ key: 'categories_list', value: updatedList })

    // If category name changed, update all products associated with oldName
    if (oldName !== trimmed) {
      const products = await db.products.where('category').equals(oldName).toArray()
      for (const p of products) {
        if (p.id) {
          await db.products.update(p.id, { category: trimmed, updatedAt: new Date() })
        }
      }
    }
  })
}

export async function deleteCategory(id: string): Promise<void> {
  const setting = await db.settings.get('categories_list')
  const current: CategoryItem[] = Array.isArray(setting?.value)
    ? (setting.value as CategoryItem[])
    : DEFAULT_CATEGORIES

  const target = current.find((c) => c.id === id)
  if (!target) return
  const oldName = target.name

  const filtered = current.filter((c) => c.id !== id)

  await db.transaction('rw', [db.settings, db.products], async () => {
    await db.settings.put({ key: 'categories_list', value: filtered })

    // Move products in deleted category to 'أخرى'
    const products = await db.products.where('category').equals(oldName).toArray()
    for (const p of products) {
      if (p.id) {
        await db.products.update(p.id, { category: 'أخرى', updatedAt: new Date() })
      }
    }
  })
}

export async function reorderCategories(list: CategoryItem[]): Promise<void> {
  await saveCategories(list)
}

export async function moveCategory(id: string, direction: 'up' | 'down'): Promise<void> {
  const setting = await db.settings.get('categories_list')
  const current: CategoryItem[] = Array.isArray(setting?.value)
    ? [...(setting.value as CategoryItem[])]
    : [...DEFAULT_CATEGORIES]

  const index = current.findIndex((c) => c.id === id)
  if (index === -1) return

  if (direction === 'up' && index > 0) {
    const temp = current[index]
    current[index] = current[index - 1]
    current[index - 1] = temp
  } else if (direction === 'down' && index < current.length - 1) {
    const temp = current[index]
    current[index] = current[index + 1]
    current[index + 1] = temp
  }

  await saveCategories(current)
}
