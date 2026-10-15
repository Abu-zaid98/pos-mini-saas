/**
 * dataReset.ts — تهيئة البيانات: تصدير كل الحركات إلى إكسل ثم تصفيرها.
 *
 * يحافظ على: الأصناف والمخزون، العملاء والموردين (كقوائم)، الإعدادات.
 * يُصفّر: المبيعات، المشتريات، الدفعات، المصاريف، التحويلات، الإنتاج،
 *         وديون/أرصدة العملاء (totalDebt / creditBalance).
 * أرصدة الموردين تُحسب من فواتير التوريد، لذا تصبح صفراً بعد حذف المشتريات.
 */
import { db, EXPENSE_CATEGORIES, type Purchase, type PaymentType } from '../db/db'
import { formatDate, formatDateTime } from './datetime'
import { getPaymentMethodName } from './wallets'
import { downloadXlsx, type XlsxCell, type XlsxSheet } from './xlsx'

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  cash: 'نقدي',
  debt: 'دين',
  partial: 'جزئي',
}

function categoryName(id: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.name || id
}

/** يجمع كل الحركات وأرصدة العملاء والموردين في أوراق إكسل. */
export async function buildTransactionsWorkbook(): Promise<XlsxSheet[]> {
  const [invoices, purchases, payments, expenses, transfers, productions, customers, suppliers] =
    await Promise.all([
      db.invoices.toArray(),
      db.purchases.toArray(),
      db.payments.toArray(),
      db.expenses.toArray(),
      db.transfers.toArray(),
      db.productions.toArray(),
      db.customers.toArray(),
      db.suppliers.toArray(),
    ])

  const customerName = new Map(customers.map((c) => [c.id, c.name]))

  const invoiceRows: XlsxCell[][] = [
    ['#', 'التاريخ', 'العميل', 'نوع الدفع', 'الإجمالي', 'المدفوع', 'الدين', 'عدد الأصناف', 'الأصناف'],
    ...[...invoices]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((inv, i) => [
        i + 1,
        formatDateTime(inv.createdAt),
        inv.customerName || 'بيع مباشر',
        PAYMENT_TYPE_LABEL[inv.paymentType] || inv.paymentType,
        inv.total || 0,
        inv.paidAmount || 0,
        inv.debtAmount || 0,
        inv.items.length,
        inv.items.map((it) => `${it.name} × ${it.qty}`).join(' | '),
      ]),
  ]

  const paidOf = (p: Purchase): number => {
    const hasFields = p.paidAmount !== undefined || p.debtAmount !== undefined
    return hasFields ? Number(p.paidAmount) || 0 : Number(p.totalAmount) || 0
  }

  const purchaseRows: XlsxCell[][] = [
    ['#', 'التاريخ', 'المورد', 'رقم الفاتورة', 'الإجمالي', 'المدفوع', 'الدين', 'الأصناف'],
    ...[...purchases]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((p, i) => [
        i + 1,
        formatDate(p.date),
        p.supplierName || 'غير محدد',
        p.invoiceNumber || (p.id != null ? `#${p.id}` : ''),
        Number(p.totalAmount) || 0,
        paidOf(p),
        Number(p.debtAmount) || 0,
        p.items.map((it) => `${it.productName} × ${it.quantity}`).join(' | '),
      ]),
  ]

  const paymentRows: XlsxCell[][] = [
    ['#', 'التاريخ', 'العميل', 'الفاتورة', 'المبلغ', 'الوسيلة', 'ملاحظة'],
    ...[...payments]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((p, i) => [
        i + 1,
        formatDateTime(p.createdAt),
        customerName.get(p.customerId) || `#${p.customerId}`,
        p.invoiceId != null ? `#${p.invoiceId}` : '—',
        Number(p.amount) || 0,
        p.method ? getPaymentMethodName(p.method) : '—',
        (p.note || '').replace(/\n/g, ' '),
      ]),
  ]

  const expenseRows: XlsxCell[][] = [
    ['#', 'التاريخ', 'البيان', 'الفئة', 'المبلغ', 'الوسيلة', 'ملاحظات'],
    ...[...expenses]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((e, i) => [
        i + 1,
        formatDate(e.date),
        e.title,
        categoryName(e.category),
        Number(e.amount) || 0,
        e.paymentMethod ? getPaymentMethodName(e.paymentMethod) : '—',
        (e.notes || '').replace(/\n/g, ' '),
      ]),
  ]

  const transferRows: XlsxCell[][] = [
    ['#', 'التاريخ', 'من محفظة', 'إلى محفظة', 'المبلغ', 'ملاحظات'],
    ...[...transfers]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((t, i) => [
        i + 1,
        formatDateTime(t.date),
        getPaymentMethodName(t.fromMethod),
        getPaymentMethodName(t.toMethod),
        Number(t.amount) || 0,
        (t.notes || '').replace(/\n/g, ' '),
      ]),
  ]

  const productionRows: XlsxCell[][] = [
    ['#', 'التاريخ', 'الصنف', 'الوزن (غرام)', 'تكلفة المواد', 'التكلفة الكلية', 'تكلفة الكيلو'],
    ...[...productions]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((p, i) => [
        i + 1,
        formatDate(p.date),
        p.productName,
        Number(p.producedQty) || 0,
        Number(p.materialCost) || 0,
        Number(p.totalCost) || 0,
        Number(p.unitCost) || 0,
      ]),
  ]

  const customerRows: XlsxCell[][] = [
    ['#', 'الاسم', 'الهاتف', 'إجمالي الدين', 'الرصيد الدائن'],
    ...customers.map((c, i) => [
      i + 1,
      c.name,
      c.phone || '',
      Number(c.totalDebt) || 0,
      Number(c.creditBalance) || 0,
    ]),
  ]

  // أرصدة الموردين مجمّعة من فواتير التوريد (كل الأسماء المسجلة + أي اسم وارد في الفواتير)
  const agg = new Map<string, { total: number; paid: number }>()
  for (const name of suppliers.map((s) => s.name)) agg.set(name, { total: 0, paid: 0 })
  for (const p of purchases) {
    const name = p.supplierName || 'غير محدد'
    const cur = agg.get(name) || { total: 0, paid: 0 }
    cur.total += Number(p.totalAmount) || 0
    cur.paid += paidOf(p)
    agg.set(name, cur)
  }

  const supplierRows: XlsxCell[][] = [
    ['#', 'المورد', 'إجمالي التوريد', 'إجمالي السداد', 'الرصيد المستحق'],
    ...[...agg.entries()].map(([name, v], i) => [
      i + 1,
      name,
      v.total,
      v.paid,
      Math.round((v.total - v.paid) * 100) / 100,
    ]),
  ]

  return [
    { name: 'المبيعات', rows: invoiceRows },
    { name: 'المشتريات', rows: purchaseRows },
    { name: 'الدفعات', rows: paymentRows },
    { name: 'المصاريف', rows: expenseRows },
    { name: 'التحويلات', rows: transferRows },
    { name: 'الإنتاج', rows: productionRows },
    { name: 'أرصدة العملاء', rows: customerRows },
    { name: 'أرصدة الموردين', rows: supplierRows },
  ]
}

/** يُصدّر كل الحركات إلى ملف إكسل واحد متعدد الأوراق. */
export async function exportTransactionsToExcel(): Promise<void> {
  const sheets = await buildTransactionsWorkbook()
  const stamp = new Date().toISOString().slice(0, 10)
  downloadXlsx(`حركات-النظام-${stamp}.xlsx`, sheets)
}

/** يُصفّر كل الحركات وديون/أرصدة العملاء داخل معاملة واحدة. */
export async function resetTransactionsData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.invoices, db.payments, db.expenses, db.purchases, db.productions, db.transfers, db.customers],
    async () => {
      await Promise.all([
        db.invoices.clear(),
        db.payments.clear(),
        db.expenses.clear(),
        db.purchases.clear(),
        db.productions.clear(),
        db.transfers.clear(),
      ])
      await db.customers.toCollection().modify((c) => {
        c.totalDebt = 0
        c.creditBalance = 0
      })
    }
  )
}
