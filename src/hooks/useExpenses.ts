import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Expense, EXPENSE_CATEGORIES } from '../db/db'

export type ExpensePeriod = 'today' | 'week' | 'month' | 'all'

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
  return db.expenses.add({
    title: data.title.trim(),
    category: data.category,
    amount: Number(data.amount),
    date: data.date ?? new Date(),
    paymentMethod: data.paymentMethod ?? 'cash',
    notes: data.notes?.trim() ?? '',
    createdAt: new Date(),
  })
}

export async function deleteExpense(id: number) {
  return db.expenses.delete(id)
}

export function getCategoryIcon(categoryName: string): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.name === categoryName)
  return found?.icon ?? '💸'
}
