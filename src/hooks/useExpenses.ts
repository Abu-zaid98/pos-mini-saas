import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Expense, EXPENSE_CATEGORIES } from '../db/db'

export type ExpensePeriod = 'today' | 'week' | 'month' | 'all'

export interface ExpenseCategoryItem {
  id: string
  name: string
  icon?: string
  description?: string
  active?: boolean
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryItem[] = [
  { id: 'electricity', name: 'كهرباء', icon: '⚡', active: true },
  { id: 'water', name: 'ماء', icon: '💧', active: true },
  { id: 'rent', name: 'إيجار المحل', icon: '🏪', active: true },
  { id: 'salaries', name: 'رواتب', icon: '👥', active: true },
  { id: 'maintenance', name: 'صيانة', icon: '🔧', active: true },
  { id: 'transport', name: 'مواصلات', icon: '🚚', active: true },
  { id: 'internet', name: 'إنترنت', icon: '📶', active: true },
  { id: 'marketing', name: 'تسويق', icon: '📢', active: true },
  { id: 'operations', name: 'مشتريات تشغيلية', icon: '📦', active: true },
  { id: 'other', name: 'أخرى', icon: '💼', active: true },
]

export function countExpenseUsageByCategory<T extends { category?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const category = item.category?.trim()
    if (!category) return acc
    acc[category] = (acc[category] ?? 0) + 1
    return acc
  }, {})
}

export async function getExpenseCategories(): Promise<ExpenseCategoryItem[]> {
  const saved = await db.settings.get('expenseCategories')
  const parsed = saved?.value as ExpenseCategoryItem[] | undefined
  if (Array.isArray(parsed) && parsed.length) {
    return parsed.map((item, index) => ({
      id: item.id || `cat-${index + 1}`,
      name: item.name?.trim() || `بند ${index + 1}`,
      icon: item.icon || '🧾',
      description: item.description || '',
      active: item.active !== false,
    }))
  }
  return DEFAULT_EXPENSE_CATEGORIES
}

export async function saveExpenseCategories(categories: ExpenseCategoryItem[]) {
  const normalized = categories.map((item, index) => ({
    id: item.id || `cat-${index + 1}`,
    name: item.name?.trim() || `بند ${index + 1}`,
    icon: item.icon || '🧾',
    description: item.description || '',
    active: item.active !== false,
  }))

  await db.settings.put({ key: 'expenseCategories', value: normalized })
  return normalized
}

export function useExpenses(period: ExpensePeriod = 'all') {
  const expenses = useLiveQuery(async () => {
    const all = await db.expenses.orderBy('date').reverse().toArray()
    if (period === 'all') return all

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    return all.filter((exp) => {
      const expTime = new Date(exp.date).getTime()
      if (period === 'today') return expTime >= startOfDay
      if (period === 'week') return expTime >= startOfWeek
      if (period === 'month') return expTime >= startOfMonth
      return true
    })
  }, [period])

  return expenses ?? []
}

export async function addExpense(data: {
  title: string
  category: string
  amount: number
  date?: Date
  paymentMethod?: Expense['paymentMethod']
  notes?: string
}) {
  const amount = Math.abs(Number(data.amount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('يرجى إدخال مبلغ صحيح أكبر من الصفر')
  return db.expenses.add({
    title: data.title.trim(),
    category: data.category,
    amount,
    date: data.date ?? new Date(),
    paymentMethod: data.paymentMethod ?? 'cash',
    notes: data.notes?.trim() ?? '',
    createdAt: new Date(),
  })
}

export async function deleteExpense(id: number) {
  return db.expenses.delete(id)
}

export async function updateExpense(id: number, data: {
  title: string
  category: string
  amount: number
  date?: Date
  paymentMethod?: Expense['paymentMethod']
  notes?: string
}) {
  const amount = Math.abs(Number(data.amount))
  if (!data.title.trim()) throw new Error('يرجى كتابة بيان المصروف')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('يرجى إدخال مبلغ صحيح أكبر من الصفر')
  return db.expenses.update(id, {
    title: data.title.trim(),
    category: data.category,
    amount,
    date: data.date ?? new Date(),
    paymentMethod: data.paymentMethod ?? 'cash',
    notes: data.notes?.trim() ?? '',
  })
}

export function getCategoryIcon(categoryName: string): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.name === categoryName)
  return found?.icon ?? '💸'
}
