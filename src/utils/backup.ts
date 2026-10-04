import { db } from '../db/db'

/**
 * Export all database data as a JSON file download
 */
export async function exportBackup(): Promise<void> {
  const [products, customers, invoices, payments, settings, expenses, purchases, productions] = await Promise.all([
    db.products.toArray(),
    db.customers.toArray(),
    db.invoices.toArray(),
    db.payments.toArray(),
    db.settings.toArray(),
    db.expenses.toArray(),
    db.purchases.toArray(),
    db.productions.toArray(),
  ])

  const backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    storeName: 'ميزان',
    data: { products, customers, invoices, payments, settings, expenses, purchases, productions },
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().split('T')[0]
  a.download = `pos-system-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)

  // Update last backup timestamp
  await db.settings.put({ key: 'lastBackupAt', value: new Date().toISOString() })
}

/**
 * Import data from a backup JSON file
 */
export async function importBackup(file: File): Promise<{ success: boolean; error?: string }> {
  try {
    const text = await file.text()
    const backup = JSON.parse(text)

    if (!backup.data) throw new Error('ملف النسخة الاحتياطية غير صالح')

    const { products, customers, invoices, payments, settings, expenses, purchases, productions } = backup.data

    await db.transaction('rw', [db.products, db.customers, db.invoices, db.payments, db.settings, db.expenses, db.purchases, db.productions], async () => {
      if (products?.length) { await db.products.clear(); await db.products.bulkAdd(products) }
      if (customers?.length) { await db.customers.clear(); await db.customers.bulkAdd(customers) }
      if (invoices?.length) { await db.invoices.clear(); await db.invoices.bulkAdd(invoices) }
      if (payments?.length) { await db.payments.clear(); await db.payments.bulkAdd(payments) }
      if (settings?.length) { await db.settings.clear(); await db.settings.bulkPut(settings) }
      if (expenses?.length) { await db.expenses.clear(); await db.expenses.bulkAdd(expenses) }
      if (purchases?.length) { await db.purchases.clear(); await db.purchases.bulkAdd(purchases) }
      if (productions?.length) { await db.productions.clear(); await db.productions.bulkAdd(productions) }
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

/**
 * Check if backup is overdue (more than 3 days)
 */
export async function isBackupOverdue(): Promise<boolean> {
  const setting = await db.settings.get('lastBackupAt')
  if (!setting?.value) return true
  const last = new Date(setting.value as string)
  const diffDays = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays > 3
}

/**
 * Days since last backup
 */
export async function daysSinceBackup(): Promise<number | null> {
  const setting = await db.settings.get('lastBackupAt')
  if (!setting?.value) return null
  const last = new Date(setting.value as string)
  return Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24))
}
