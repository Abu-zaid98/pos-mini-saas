import { useState, useMemo, useRef } from 'react'
import { useInvoices, useAccountBalances } from '../hooks/useInvoices'
import { usePurchases } from '../hooks/usePurchases'
import { useProducts } from '../hooks/useProducts'
import { useCustomers } from '../hooks/useCustomers'
import { useExpenses, getCategoryIcon } from '../hooks/useExpenses'
import { formatCurrency } from '../utils/currency'
import { formatLineQty, getProductType, isLowStock, isOutOfStock, lineDiscountAmount } from '../utils/units'
import { invoiceNetRevenue, invoiceNetProfit, computeReturnsSummary } from '../utils/reports'
import { formatDateTime } from '../utils/datetime'
import { exportFullExcel, type ExportRange } from '../utils/excelExport'
import { Modal, Tabs, StatCard, PageHeader, Icon } from '../components/ui'
import { InvoicePrint, usePrintInvoice, useStoreInfo } from '../components/invoice/InvoicePrint'
import { InvoiceExportActions } from '../components/invoice/InvoiceExportActions'
import { WalletDetailModal } from '../components/wallet/WalletDetailModal'
import {
  DonutChart,
  RadialGauge,
  BarList,
  ColumnTrend,
  CHART_PALETTE,
  DEBT_PALETTE,
  type ChartSlice,
} from '../components/charts/Charts'
import { type Invoice, type PaymentMethod, getPaymentMethodName, db } from '../db/db'
import { useWallets } from '../hooks/useWallets'
import { useLiveQuery } from 'dexie-react-hooks'

type PeriodFilter = 'today' | 'week' | 'month' | 'all' | 'custom'
type ReportSubTab = 'overview' | 'financial' | 'inventory' | 'customers'

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'هذا الشهر',
  all: 'كل الفترات',
  custom: 'فترة مخصصة',
}

const EXPENSE_PALETTE = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#94a3b8']
const MUTED_COLOR = '#94a3b8'

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** يحوّل فلتر الفترة إلى نطاق تصدير (تاريخ البداية شامل، والنهاية حصرية). */
function buildExportRange(period: PeriodFilter, fromDate: string, toDate: string): ExportRange | undefined {
  const now = new Date()
  const tomorrow = new Date(dayStart(now).getTime() + 86_400_000)
  if (period === 'today') return { from: dayStart(now), to: tomorrow }
  if (period === 'week') return { from: dayStart(new Date(now.getTime() - 6 * 86_400_000)), to: tomorrow }
  if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow }
  if (period === 'custom') {
    return {
      from: fromDate ? new Date(`${fromDate}T00:00:00`) : undefined,
      to: toDate ? new Date(new Date(`${toDate}T00:00:00`).getTime() + 86_400_000) : undefined,
    }
  }
  return undefined
}

/** يبني سلسلة زمنية للمبيعات حسب الفترة (بالساعة/اليوم/الشهر) */
interface TrendPoint {
  label: string
  value: number
}

function buildSalesTrend(
  invoices: Invoice[],
  period: PeriodFilter,
  fromDate: string,
  toDate: string,
): TrendPoint[] {
  const now = new Date()
  type Bucket = 'hour' | 'day' | 'month'
  let start: Date
  let end: Date = now
  let bucket: Bucket = 'day'

  if (period === 'today') {
    start = dayStart(now)
    bucket = 'hour'
  } else if (period === 'week') {
    start = dayStart(new Date(now.getTime() - 6 * 86_400_000))
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === 'custom') {
    start = fromDate ? new Date(`${fromDate}T00:00:00`) : dayStart(now)
    end = toDate ? new Date(`${toDate}T23:59:59`) : now
    bucket = end.getTime() - start.getTime() > 45 * 86_400_000 ? 'month' : 'day'
  } else {
    const times = invoices
      .map((i) => new Date(i.createdAt).getTime())
      .filter((t) => Number.isFinite(t))
    start = times.length ? new Date(Math.min(...times)) : dayStart(now)
    bucket = now.getTime() - start.getTime() > 60 * 86_400_000 ? 'month' : 'day'
  }

  if (bucket === 'month') start = new Date(start.getFullYear(), start.getMonth(), 1)
  if (start.getTime() > end.getTime()) return []

  const keyOf = (d: Date) => {
    if (bucket === 'hour') return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
    if (bucket === 'month') return `${d.getFullYear()}-${d.getMonth()}`
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }
  const labelOf = (d: Date) => {
    if (bucket === 'hour') return `${d.getHours()}:00`
    if (bucket === 'month') return AR_MONTHS[d.getMonth()]
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}`
  }

  const points: TrendPoint[] = []
  const index = new Map<string, number>()
  const cursor = new Date(start)
  if (bucket === 'hour') cursor.setMinutes(0, 0, 0)
  let guard = 0
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    index.set(keyOf(cursor), points.length)
    points.push({ label: labelOf(cursor), value: 0 })
    if (bucket === 'hour') cursor.setHours(cursor.getHours() + 1)
    else if (bucket === 'month') cursor.setMonth(cursor.getMonth() + 1)
    else cursor.setDate(cursor.getDate() + 1)
    guard++
  }

  for (const inv of invoices) {
    const d = new Date(inv.createdAt)
    if (!Number.isFinite(d.getTime())) continue
    const i = index.get(keyOf(d))
    if (i !== undefined) points[i].value += invoiceNetRevenue(inv)
  }

  return points
}

/** يدمج كل الشرائح بعد حد معيّن في شريحة "أخرى" */
function topWithOther(slices: ChartSlice[], limit: number, otherLabel = 'أخرى'): ChartSlice[] {
  if (slices.length <= limit + 1) return slices
  const head = slices.slice(0, limit)
  const rest = slices.slice(limit).reduce((s, x) => s + (Number(x.value) || 0), 0)
  if (rest > 0) head.push({ label: otherLabel, value: rest, color: MUTED_COLOR })
  return head
}

function qtyText(v: number): string {
  const n = Number(v) || 0
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

export function ReportsPage() {
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('overview')
  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const printSaleInvoice = usePrintInvoice()
  const storeInfo = useStoreInfo()
  const reportInvoiceRef = useRef<HTMLDivElement>(null)
  const [walletMethod, setWalletMethod] = useState<PaymentMethod | null>(null)

  const wallets = useWallets()
  const invoices = useInvoices({ dateRange: period, fromDate, toDate })
  const allProducts = useProducts()
  const allCustomers = useCustomers('', 'all')
  const balances = useAccountBalances()
  const expenses = useExpenses(period, { fromDate, toDate })

  // All payments (for debt collection tracking)
  const allPayments = useLiveQuery(() => db.payments.toArray(), []) ?? []
  const allPurchases = usePurchases()

  // مشتريات الفترة (حسب تاريخ الفاتورة — نفس منطق فترات المبيعات)
  const periodPurchases = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const fromTs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : NaN
    const toTs = toDate ? new Date(toDate + 'T00:00:00').getTime() + 86_400_000 : NaN
    return allPurchases.filter((p) => {
      const t = new Date(p.date).getTime()
      if (period === 'today') return t >= startOfDay
      if (period === 'week') return t >= startOfWeek
      if (period === 'month') return t >= startOfMonth
      if (period === 'custom') {
        if (fromDate && Number.isFinite(fromTs) && t < fromTs) return false
        if (toDate && Number.isFinite(toTs) && t >= toTs) return false
        return true
      }
      return true
    })
  }, [allPurchases, period, fromDate, toDate])

  const purchaseTotals = useMemo(() => {
    return periodPurchases.reduce(
      (s, p) => ({
        total: s.total + (p.totalAmount || 0),
        paid: s.paid + (p.paidAmount ?? p.totalAmount ?? 0),
        debt: s.debt + (p.debtAmount ?? 0),
        returns: s.returns + (Number(p.returnedAmount) || 0),
      }),
      { total: 0, paid: 0, debt: 0, returns: 0 },
    )
  }, [periodPurchases])

  // فواتير البيع الحقيقية فقط — نستثني قيود الديون الوهمية (productId === 0)
  // وهي فواتير الرصيد الافتتاحي والديون اليدوية التي ليست بيعاً فعلياً
  const realInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.items.some((i) => i.productId !== 0))
  }, [invoices])

  // KPIs — صافي بعد المرتجعات (المرتجع يخفض المبيعات والربح فعلياً)
  const totalSales = useMemo(
    () => realInvoices.reduce((sum, inv) => sum + invoiceNetRevenue(inv), 0),
    [realInvoices],
  )

  const grossSalesProfit = useMemo(
    () => realInvoices.reduce((sum, inv) => sum + invoiceNetProfit(inv), 0),
    [realInvoices],
  )

  // ملخّص المرتجعات (بيع + شراء) — الإجمالي الخام مقابل الصافي
  const returnsSummary = useMemo(
    () => computeReturnsSummary(realInvoices, periodPurchases),
    [realInvoices, periodPurchases],
  )

  // Operating Expenses
  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  }, [expenses])

  // Real Net Profit = Gross Profit - Operating Expenses
  const realNetProfit = useMemo(() => {
    return grossSalesProfit - totalExpenses
  }, [grossSalesProfit, totalExpenses])

  // دفعات الفترة (نفس منطق فلترة الفترات) — أساس المقبوضات الفعلية
  const paymentsInPeriod = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const fromTs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : NaN
    const toTs = toDate ? new Date(toDate + 'T00:00:00').getTime() + 86_400_000 : NaN

    return allPayments.filter((p) => {
      const t = new Date(p.createdAt).getTime()
      if (period === 'today' && t < startOfDay) return false
      if (period === 'week' && t < startOfWeek) return false
      if (period === 'month' && t < startOfMonth) return false
      if (period === 'custom') {
        if (fromDate && Number.isFinite(fromTs) && t < fromTs) return false
        if (toDate && Number.isFinite(toTs) && t >= toTs) return false
      }
      return true
    })
  }, [allPayments, period, fromDate, toDate])

  // Period breakdown by payment method (dynamic wallets) — من الحركات الفعلية
  // (مبيعات نقدية + تحصيل ديون − استردادات) فتطابق حركة المحافظ تماماً
  const periodCollections = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of paymentsInPeriod) {
      const m = p.method || 'cash'
      map[m] = (map[m] ?? 0) + (Number(p.amount) || 0)
    }
    return map
  }, [paymentsInPeriod])

  const periodCollectionsTotal = useMemo(
    () => Object.values(periodCollections).reduce((s, v) => s + Math.max(0, v), 0),
    [periodCollections],
  )

  // Collected debts in period — سدادات العملاء المستقلة (invoiceId === null)
  const collectedDebtInPeriod = useMemo(
    () => paymentsInPeriod.reduce((sum, p) => (p.invoiceId ? sum : sum + (Number(p.amount) || 0)), 0),
    [paymentsInPeriod],
  )

  // Top Selling Products — نستثني بنود الديون الوهمية ونخصم المرتجعات
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {}

    realInvoices.forEach((inv) => {
      const returnedQty = new Map<number, number>()
      const refundedValue = new Map<number, number>()
      for (const r of inv.returnedItems || []) {
        returnedQty.set(r.productId, (returnedQty.get(r.productId) || 0) + (Number(r.qty) || 0))
        refundedValue.set(r.productId, (refundedValue.get(r.productId) || 0) + (Number(r.refundAmount) || 0))
      }
      const appliedReturns = new Set<number>()
      inv.items.forEach((item) => {
        if (item.productId === 0) return
        // المرتجع يُطبَّق مرة واحدة لكل صنف في الفاتورة (تفادياً للخصم المزدوج)
        let rq = 0
        let rv = 0
        if (!appliedReturns.has(item.productId)) {
          rq = returnedQty.get(item.productId) || 0
          rv = refundedValue.get(item.productId) || 0
          appliedReturns.add(item.productId)
        }
        if (!map[item.name]) {
          map[item.name] = { name: item.name, qty: 0, revenue: 0 }
        }
        map[item.name].qty += Math.max(0, item.qty - rq)
        map[item.name].revenue += Math.max(0, item.price * item.qty - lineDiscountAmount(item) - rv)
      })
    })

    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [realInvoices])

  // ── العملاء والديون (مستقلة تماماً عن المخزون) ──
  const debtors = useMemo(
    () => allCustomers
      .filter((c) => (c.totalDebt || 0) > 0)
      .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0)),
    [allCustomers],
  )

  const creditCustomers = useMemo(
    () => allCustomers
      .filter((c) => (c.creditBalance || 0) > 0)
      .sort((a, b) => (b.creditBalance || 0) - (a.creditBalance || 0)),
    [allCustomers],
  )

  const totalCustomerCredit = useMemo(
    () => creditCustomers.reduce((sum, c) => sum + (c.creditBalance || 0), 0),
    [creditCustomers],
  )

  const totalOutstandingDebt = useMemo(
    () => debtors.reduce((sum, c) => sum + (c.totalDebt || 0), 0),
    [debtors],
  )

  const netReceivables = totalOutstandingDebt - totalCustomerCredit

  const avgDebt = debtors.length > 0 ? totalOutstandingDebt / debtors.length : 0

  const collectionRate = useMemo(() => {
    const base = collectedDebtInPeriod + totalOutstandingDebt
    return base > 0 ? (collectedDebtInPeriod / base) * 100 : 0
  }, [collectedDebtInPeriod, totalOutstandingDebt])

  const topDebtors = useMemo(() => debtors.slice(0, 5), [debtors])

  // Inventory Alerts — الخدمات لا تدخل في تنبيهات النقص (بلا مخزون)
  const lowStockProducts = useMemo(() => {
    return allProducts.filter((p) => {
      const t = getProductType(p)
      if (t === 'service') return false
      return isOutOfStock(p) || isLowStock(p)
    })
  }, [allProducts])

  const outOfStockCount = useMemo(
    () => allProducts.filter((p) => getProductType(p) !== 'service' && isOutOfStock(p)).length,
    [allProducts],
  )

  const stockValues = useMemo(() => {
    return allProducts.reduce(
      (acc, p) => {
        const t = getProductType(p)
        if (t === 'service') return acc
        const qty = t === 'weighted' ? (p.quantity || 0) / 1000 : (p.quantity || 0)
        acc.cost += (p.costPrice || 0) * qty
        acc.retail += (p.salePrice || 0) * qty
        return acc
      },
      { cost: 0, retail: 0 },
    )
  }, [allProducts])

  // ── Chart datasets ──
  const paymentDonut: ChartSlice[] = useMemo(
    () =>
      wallets
        .map((w, i) => ({
          label: `${w.icon} ${w.name}`,
          value: periodCollections[w.id] ?? 0,
          color: CHART_PALETTE[i % CHART_PALETTE.length],
        }))
        .filter((d) => d.value > 0),
    [wallets, periodCollections],
  )

  const walletBalanceDonut: ChartSlice[] = useMemo(
    () =>
      wallets
        .map((w, i) => ({
          label: `${w.icon} ${w.name}`,
          value: Math.max(0, Number((balances as Record<string, number>)[w.id] ?? 0)),
          color: CHART_PALETTE[i % CHART_PALETTE.length],
        }))
        .filter((d) => d.value > 0),
    [wallets, balances],
  )

  const expenseDonut: ChartSlice[] = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + (e.amount || 0)))
    const slices = [...map.entries()]
      .map(([label, value]) => ({ label: `${getCategoryIcon(label)} ${label}`, value }))
      .sort((a, b) => b.value - a.value)
    return topWithOther(slices, 6, 'أنواع أخرى')
  }, [expenses])

  const categoryStock: ChartSlice[] = useMemo(() => {
    const map = new Map<string, number>()
    allProducts.forEach((p) => {
      const t = getProductType(p)
      if (t === 'service') return
      const qty = t === 'weighted' ? (p.quantity || 0) / 1000 : (p.quantity || 0)
      const val = (p.salePrice || 0) * qty
      if (val <= 0) return
      const cat = p.category?.trim() || 'غير مصنّف'
      map.set(cat, (map.get(cat) ?? 0) + val)
    })
    const slices = [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
    return topWithOther(slices, 6, 'تصنيفات أخرى')
  }, [allProducts])

  const debtDonut: ChartSlice[] = useMemo(
    () => topWithOther(debtors.map((c) => ({ label: c.name, value: c.totalDebt || 0 })), 6, 'بقية المدينين'),
    [debtors],
  )

  const salesTrend = useMemo(
    () => buildSalesTrend(realInvoices, period, fromDate, toDate),
    [realInvoices, period, fromDate, toDate],
  )

  // Period selector helper element
  const renderPeriodSelector = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Tabs
        tabs={[
          { value: 'today', label: 'اليوم' },
          { value: 'week', label: 'آخر 7 أيام' },
          { value: 'month', label: 'هذا الشهر' },
          { value: 'all', label: 'كل الفترات' },
          { value: 'custom', label: 'مخصص' },
        ]}
        value={period}
        onChange={(v) => {
          setPeriod(v as PeriodFilter)
          if (v !== 'custom') {
            setFromDate('')
            setToDate('')
          }
        }}
      />
      {period === 'custom' && (
        <div style={{
          background: 'var(--color-input-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          <div className="input-wrap">
            <label className="input-label">من تاريخ</label>
            <input className="input" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="input-wrap">
            <label className="input-label">إلى تاريخ</label>
            <input className="input" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        icon="chart-bar"
        title="التقارير والإحصائيات"
        subtitle="لوحة تحليلات شاملة للمبيعات والأرباح والمخزون والديون"
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              void exportFullExcel(buildExportRange(period, fromDate, toDate))
            }}
            title="تصدير تقرير مفصل (كل الأوراق) إلى Excel"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="download" size={16} />
            <span>تصدير Excel</span>
          </button>
        }
      />

      {/* TOP SEGMENTED REPORT TABS */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'نظرة عامة', icon: 'chart-bar' },
          { value: 'financial', label: 'المالية والأرباح', icon: 'banknotes' },
          {
            value: 'inventory',
            label: 'المخزون',
            icon: 'package',
            badge: lowStockProducts.length > 0 ? lowStockProducts.length : undefined,
          },
          {
            value: 'customers',
            label: 'العملاء والديون',
            icon: 'users',
            badge: debtors.length > 0 ? debtors.length : undefined,
          },
        ]}
        value={reportSubTab}
        onChange={(v) => setReportSubTab(v as ReportSubTab)}
      />

      {/* ============================================================ */}
      {/* TAB: OVERVIEW                                                */}
      {/* ============================================================ */}
      {reportSubTab === 'overview' && (
        <>
          {renderPeriodSelector()}

          {/* Hero banner */}
          <div className="report-hero">
            <div>
              <span className="report-hero-eyebrow">ميزان · ملخص الأداء</span>
              <h3 className="report-hero-title">نظرة شاملة — {PERIOD_LABELS[period]}</h3>
              <p className="report-hero-sub">
                {realInvoices.length} فاتورة بيع · {topProducts.length} صنف الأكثر مبيعاً · {debtors.length} عميل مدين
              </p>
            </div>
            <div className="report-hero-grid">
              <div className="report-hero-stat">
                <div className="report-hero-stat-l">المبيعات</div>
                <div className="report-hero-stat-v">{formatCurrency(totalSales)}</div>
              </div>
              <div className="report-hero-stat">
                <div className="report-hero-stat-l">صافي الربح</div>
                <div className="report-hero-stat-v">{formatCurrency(realNetProfit)}</div>
              </div>
              <div className="report-hero-stat">
                <div className="report-hero-stat-l">المصاريف</div>
                <div className="report-hero-stat-v">{formatCurrency(totalExpenses)}</div>
              </div>
              <div className="report-hero-stat">
                <div className="report-hero-stat-l">الديون المعلقة</div>
                <div className="report-hero-stat-v">{formatCurrency(totalOutstandingDebt)}</div>
              </div>
            </div>
          </div>

          {/* Sales trend */}
          <div className="report-panel">
            <div className="report-panel-head">
              <div className="report-panel-title"><span className="report-panel-emoji">📈</span> حركة المبيعات</div>
              <span className="report-panel-badge">{PERIOD_LABELS[period]}</span>
            </div>
            <ColumnTrend points={salesTrend} />
          </div>

          {/* Payments + Expenses donuts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">💳</span> المقبوضات حسب وسيلة الدفع</div>
              </div>
              <DonutChart
                data={paymentDonut}
                centerLabel="إجمالي المحصّل"
                centerValue={formatCurrency(periodCollectionsTotal)}
                valueFormatter={formatCurrency}
              />
            </div>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">🧾</span> المصاريف حسب النوع</div>
              </div>
              <DonutChart
                data={expenseDonut}
                palette={EXPENSE_PALETTE}
                centerLabel="إجمالي المصاريف"
                centerValue={formatCurrency(totalExpenses)}
              />
            </div>
          </div>

          {/* Top products + Top debtors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">🔥</span> الأكثر مبيعاً</div>
                <span className="report-panel-badge">أفضل 5</span>
              </div>
              <BarList
                items={topProducts.map((p) => ({ label: p.name, value: p.qty, sub: formatCurrency(p.revenue) }))}
                valueFormatter={qtyText}
                palette={['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444']}
                emptyText="لا توجد مبيعات في هذه الفترة"
              />
            </div>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">👥</span> أعلى العملاء ديناً</div>
                <button
                  type="button"
                  onClick={() => setReportSubTab('customers')}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--color-primary-light)',
                    fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-main)',
                  }}
                >
                  التفاصيل ›
                </button>
              </div>
              <BarList
                items={topDebtors.map((c) => ({ label: c.name, value: c.totalDebt || 0 }))}
                palette={DEBT_PALETTE}
                emptyText="لا توجد ديون مستحقة 🎉"
              />
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* TAB: FINANCIAL & PROFITS                                     */}
      {/* ============================================================ */}
      {reportSubTab === 'financial' && (
        <>
          {/* WALLETS & ACCOUNTS BALANCES */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 18,
            padding: 16,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 20 }}>💼</span>
                <h3 style={{ fontSize: 16, fontWeight: 900 }}>أرصدة الخزينة والحسابات</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 50,
                  background: balances.total < 0 ? 'var(--kpi-danger-bg)' : 'rgba(59,130,246,0.15)',
                  color: balances.total < 0 ? 'var(--color-danger-light)' : 'var(--color-primary-light)',
                  border: balances.total < 0 ? '1px solid var(--kpi-danger-border)' : '1px solid transparent',
                  direction: 'ltr',
                  flexShrink: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {balances.total < 0 ? '⚠️ عجز: ' : 'المجموع: '}{formatCurrency(balances.total)}
                </span>
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
              أرصدة تراكمية (كل الفترات) — اضغط على أي محفظة لعرض حركاتها. الأرصدة الافتتاحية والتحويلات تُدار من صفحة الخزينة والمحافظ.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {wallets.map((w) => {
                const bal = Number((balances as Record<string, number>)[w.id] ?? 0)
                return (
                  <div
                    key={w.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setWalletMethod(w.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setWalletMethod(w.id) }}
                    title={`عرض حركات ${w.name}`}
                    style={{
                      background: bal < 0 ? 'var(--kpi-danger-bg)' : 'var(--color-input-bg)',
                      border: bal < 0 ? '1px solid var(--kpi-danger-border)' : '1px solid var(--color-border)',
                      borderRadius: 14,
                      padding: 12,
                      cursor: 'pointer',
                      opacity: w.archived ? 0.7 : 1,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>{w.icon}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{w.name}</span>
                      {bal < 0 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-danger-light)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 50, padding: '1px 8px' }}>
                          ⚠️ عجز
                        </span>
                      )}
                      <span style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--color-text-muted)' }}>›</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: bal < 0 ? 'var(--color-danger-light)' : 'var(--color-text-primary)', direction: 'ltr' }}>
                      {formatCurrency(bal)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {walletMethod && (
            <WalletDetailModal method={walletMethod} onClose={() => setWalletMethod(null)} />
          )}

          {/* Period Selector Tabs */}
          {renderPeriodSelector()}

          {/* 4 Financial KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <StatCard
              label="مبيعاتي"
              value={formatCurrency(totalSales)}
              sub={`مجموع ما بعته (${realInvoices.length} فواتير)`}
              icon="banknotes"
              variant="info"
              ltr
            />
            <StatCard
              label="ربح البضاعة"
              value={formatCurrency(grossSalesProfit)}
              sub="فرق سعر البيع عن التكلفة"
              icon="chart-bar"
              variant="brand"
              ltr
            />
            <StatCard
              label="مصاريفي"
              value={formatCurrency(totalExpenses)}
              sub={`كهرباء وإيجار ورواتب... (${expenses.length})`}
              icon="credit-card"
              variant="danger"
              ltr
            />
            <StatCard
              label="صافي ربحي"
              value={formatCurrency(realNetProfit)}
              sub="ربح البضاعة ناقص مصاريفي"
              icon="tag"
              variant={realNetProfit >= 0 ? 'success' : 'danger'}
              ltr
            />
          </div>

          {/* Returns summary — صافي المرتجعات (بيع + شراء) */}
          <div className="report-panel">
            <div className="report-panel-head">
              <div className="report-panel-title">
                <span className="report-panel-emoji">↩️</span> صافي المرتجعات — {PERIOD_LABELS[period]}
              </div>
              <span className="report-panel-badge">
                {returnsSummary.salesReturnCount + returnsSummary.purchaseReturnCount} حركة مرتجع
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {/* مرتجع البيع */}
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--kpi-danger-bg)', border: '1px solid var(--kpi-danger-border)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-danger-light)', fontWeight: 700, marginBottom: 4 }}>↩️ مرتجع البيع</div>
                <div style={{ fontSize: 20, fontWeight: 900, direction: 'ltr', color: 'var(--color-danger-light)' }}>
                  {formatCurrency(returnsSummary.salesReturns)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>مبيعات خام: <b style={{ direction: 'ltr' }}>{formatCurrency(returnsSummary.salesGross)}</b></span>
                  <span>صافي المبيعات: <b style={{ direction: 'ltr', color: 'var(--color-success-light)' }}>{formatCurrency(returnsSummary.salesNet)}</b></span>
                </div>
              </div>

              {/* مرتجع الشراء */}
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-warning-light)', fontWeight: 700, marginBottom: 4 }}>↩️ مرتجع الشراء</div>
                <div style={{ fontSize: 20, fontWeight: 900, direction: 'ltr', color: 'var(--color-warning-light)' }}>
                  {formatCurrency(returnsSummary.purchaseReturns)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>مشتريات خام: <b style={{ direction: 'ltr' }}>{formatCurrency(returnsSummary.purchasesGross)}</b></span>
                  <span>صافي المشتريات: <b style={{ direction: 'ltr', color: 'var(--color-success-light)' }}>{formatCurrency(returnsSummary.purchasesNet)}</b></span>
                </div>
              </div>
            </div>
          </div>

          {/* Donuts: collections + wallet balances */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">💳</span> المقبوضات المحصلة حسب وسيلة الدفع</div>
              </div>
              <DonutChart
                data={paymentDonut}
                centerLabel="إجمالي المحصّل"
                centerValue={formatCurrency(periodCollectionsTotal)}
              />
            </div>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">💰</span> توزيع أرصدة الخزينة</div>
              </div>
              <DonutChart
                data={walletBalanceDonut}
                centerLabel="إجمالي الأرصدة"
                centerValue={formatCurrency(Math.max(0, balances.total))}
              />
            </div>
          </div>

          {/* Purchases in Period — المشتريات حسب الفلتر (قيم + سجل) */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: 16,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
              📥 مشتريات الفترة ({periodPurchases.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 12 }}>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--kpi-period-inset)', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>إجمالي الشراء</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2 }}>{formatCurrency(purchaseTotals.total)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-warning-light)' }}>مرتجع الشراء</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2, color: 'var(--color-warning-light)' }}>{formatCurrency(purchaseTotals.returns)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--kpi-green-bg)', border: '1px solid var(--kpi-green-border)', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-success-light)' }}>مدفوع للموردين</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2, color: 'var(--color-success-light)' }}>{formatCurrency(purchaseTotals.paid)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--kpi-danger-bg)', border: '1px solid var(--kpi-danger-border)', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-danger-light)' }}>دين موردين</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2, color: 'var(--color-danger-light)' }}>{formatCurrency(purchaseTotals.debt)}</p>
              </div>
            </div>

            {periodPurchases.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '8px 0' }}>
                لا توجد مشتريات مسجلة في هذه الفترة
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {periodPurchases.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>🚚 {p.supplierName?.trim() || 'شراء عام'}</span>
                        {(p.debtAmount || 0) > 0 && (
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 50,
                            background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)', fontWeight: 700,
                          }}>
                            دين 📝
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, display: 'block' }}>
                        {formatDateTime(p.date)}
                        {p.invoiceNumber ? ` · #${p.invoiceNumber}` : ''} · {p.items.length} أصناف
                      </span>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, direction: 'ltr' }}>
                        {formatCurrency(p.totalAmount)}
                      </div>
                      {(p.debtAmount || 0) > 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--color-danger-light)', direction: 'ltr' }}>
                          مدفوع {formatCurrency(p.paidAmount ?? 0)} · دين {formatCurrency(p.debtAmount || 0)}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--color-success-light)' }}>
                          ✓ مسددة
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoices Log */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: 16,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
              سجل الفواتير في هذه الفترة ({realInvoices.length})
            </h3>

            {realInvoices.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '16px 0' }}>
                لا توجد فواتير مبيعات مسجلة في هذه الفترة
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {realInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoice(inv)}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>#{inv.id}</span>
                        <span style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 50,
                          background: inv.paymentType === 'cash' ? 'rgba(16,185,129,0.15)' : inv.paymentType === 'debt' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: inv.paymentType === 'cash' ? 'var(--color-success-light)' : inv.paymentType === 'debt' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                          fontWeight: 700,
                        }}>
                          {inv.paymentType === 'cash'
                            ? getPaymentMethodName(inv.paymentMethod)
                            : inv.paymentType === 'debt'
                              ? 'دين آجل 📝'
                              : `جزئي (${getPaymentMethodName(inv.paymentMethod)})`}
                        </span>
                        {inv.customerName && (
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {inv.customerName}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, display: 'block' }}>
                        {formatDateTime(inv.createdAt)}
                      </span>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, direction: 'ltr' }}>
                        {formatCurrency(inv.total)}
                      </div>
                      {inv.debtAmount > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-danger-light)', direction: 'ltr' }}>
                          دين: {formatCurrency(inv.debtAmount)}
                        </div>
                      )}
                      {(inv.refundedAmount || 0) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-warning-light)', direction: 'ltr' }}>
                          مرتجع: -{formatCurrency(inv.refundedAmount || 0)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* TAB: INVENTORY                                               */}
      {/* ============================================================ */}
      {reportSubTab === 'inventory' && (
        <>
          {renderPeriodSelector()}

          {/* Inventory KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <StatCard
              label="قيمة المخزون (بيع)"
              value={formatCurrency(stockValues.retail)}
              sub="بسعر البيع الحالي"
              icon="banknotes"
              variant="success"
              ltr
            />
            <StatCard
              label="قيمة المخزون (تكلفة)"
              value={formatCurrency(stockValues.cost)}
              sub="رأس المال المجمّد"
              icon="box"
              variant="brand"
              ltr
            />
            <StatCard
              label="أصناف ناقصة"
              value={lowStockProducts.length}
              sub="بحاجة لتزويد"
              icon="warning"
              variant="warning"
            />
            <StatCard
              label="أصناف نفدت"
              value={outOfStockCount}
              sub="الكمية = صفر"
              icon="warning"
              variant="danger"
            />
          </div>

          {/* Category stock distribution donut */}
          <div className="report-panel">
            <div className="report-panel-head">
              <div className="report-panel-title"><span className="report-panel-emoji">🗂️</span> توزيع قيمة المخزون حسب التصنيف</div>
              <span className="report-panel-badge">بسعر البيع</span>
            </div>
            <DonutChart
              data={categoryStock}
              centerLabel="قيمة البيع"
              centerValue={formatCurrency(stockValues.retail)}
              emptyText="لا يوجد مخزون مسجّل"
            />
          </div>

          {/* Top Selling Products */}
          <div className="report-panel">
            <div className="report-panel-head">
              <div className="report-panel-title"><span className="report-panel-emoji">🔥</span> الأكثر مبيعاً في هذه الفترة</div>
              <span className="report-panel-badge">أفضل 5</span>
            </div>
            <BarList
              items={topProducts.map((p) => ({ label: p.name, value: p.qty, sub: formatCurrency(p.revenue) }))}
              valueFormatter={qtyText}
              palette={['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444']}
              emptyText="لا توجد مبيعات مسجلة في هذه الفترة"
            />
          </div>

          {/* Low Stock Warning */}
          <div style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 16,
            padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-warning-light)' }}>
                تنبيهات المخزون النواقص ({lowStockProducts.length} صنف)
              </h3>
            </div>
            {lowStockProducts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '6px 0' }}>
                كل الأصناف ضمن الحد الآمن ✓
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lowStockProducts.slice(0, 8).map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{p.name}</span>
                    <span style={{
                      color: p.quantity === 0 ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                      fontWeight: 700,
                    }}>
                      {p.quantity === 0 ? 'نفد تماماً (0)' : `متبقي: ${p.quantity}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* TAB: CUSTOMERS & DEBTS (مستقل تماماً عن المخزون)             */}
      {/* ============================================================ */}
      {reportSubTab === 'customers' && (
        <>
          {renderPeriodSelector()}

          {/* Debt KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <StatCard
              label="الديون المعلقة"
              value={formatCurrency(totalOutstandingDebt)}
              sub={`على ${debtors.length} عميل`}
              icon="warning"
              variant="danger"
              ltr
            />
            <StatCard
              label="ديون محصلة"
              value={formatCurrency(collectedDebtInPeriod)}
              sub={`خلال ${PERIOD_LABELS[period]}`}
              icon="check"
              variant="success"
              ltr
            />
            <StatCard
              label="عدد المدينين"
              value={debtors.length}
              sub="عملاء لديهم رصيد"
              icon="users"
              variant="brand"
            />
            <StatCard
              label="متوسط الدين"
              value={formatCurrency(avgDebt)}
              sub="لكل عميل مدين"
              icon="scale"
              variant="info"
              ltr
            />
            <StatCard
              label="أرصدة دائنة"
              value={formatCurrency(totalCustomerCredit)}
              sub={`مستحقة لـ ${creditCustomers.length} عميل`}
              icon="banknotes"
              variant="info"
              ltr
            />
            <StatCard
              label="صافي الذمم"
              value={formatCurrency(netReceivables)}
              sub="الديون − الأرصدة الدائنة"
              icon="scale"
              variant={netReceivables >= 0 ? 'success' : 'warning'}
              ltr
            />
          </div>

          {/* Collection rate + debt distribution */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">🎯</span> نسبة التحصيل</div>
              </div>
              <RadialGauge
                value={collectionRate}
                max={100}
                size={150}
                color="var(--color-success-light)"
                centerText={`${Math.round(collectionRate)}%`}
                caption="محصّل مقابل المتبقي"
              />
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 12 }}>
                حصّلت {formatCurrency(collectedDebtInPeriod)} · المتبقي {formatCurrency(totalOutstandingDebt)}
              </p>
            </div>
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">📊</span> توزيع الديون على العملاء</div>
              </div>
              <DonutChart
                data={debtDonut}
                palette={DEBT_PALETTE}
                centerLabel="إجمالي الديون"
                centerValue={formatCurrency(totalOutstandingDebt)}
                emptyText="لا توجد ديون مستحقة 🎉"
              />
            </div>
          </div>

          {/* Top debtors bars */}
          <div className="report-panel">
            <div className="report-panel-head">
              <div className="report-panel-title"><span className="report-panel-emoji">👥</span> أعلى العملاء ديناً</div>
              <span className="report-panel-badge">متابعة التحصيل</span>
            </div>
            <BarList
              items={topDebtors.map((c) => ({
                label: c.name,
                value: c.totalDebt || 0,
                sub: c.phone || undefined,
              }))}
              palette={DEBT_PALETTE}
              emptyText="لا توجد ديون مستحقة على أي عميل 🎉"
            />
          </div>

          {/* Credit customers */}
          {creditCustomers.length > 0 && (
            <div className="report-panel">
              <div className="report-panel-head">
                <div className="report-panel-title"><span className="report-panel-emoji">💠</span> أرصدة دائنة للعملاء</div>
                <span className="report-panel-badge">{creditCustomers.length} عميل</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {creditCustomers.slice(0, 20).map((c) => (
                  <div key={c.id} className="report-debtor-row">
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                      {c.phone && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', direction: 'ltr', textAlign: 'right' }}>{c.phone}</span>
                      )}
                    </div>
                    <span className="report-debtor-amount" style={{ color: 'var(--color-primary-light)' }}>{formatCurrency(c.creditBalance || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full debtors list */}
          <div className="report-panel">
            <div className="report-panel-head">
              <div className="report-panel-title"><span className="report-panel-emoji">🧾</span> كشف المدينين</div>
              <span className="report-panel-badge">{debtors.length} عميل</span>
            </div>
            {debtors.length === 0 ? (
              <p className="chart-empty">لا توجد ديون مستحقة 🎉</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {debtors.slice(0, 20).map((c) => (
                  <div key={c.id} className="report-debtor-row">
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                      {c.phone && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', direction: 'ltr', textAlign: 'right' }}>
                          {c.phone}
                        </span>
                      )}
                    </div>
                    <span className="report-debtor-amount">{formatCurrency(c.totalDebt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL: VIEW INVOICE DETAILS */}
      {selectedInvoice && (
        <Modal
          open={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          title={`تفاصيل فاتورة #${selectedInvoice.id}`}
          type="box"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div><strong>التاريخ:</strong> {formatDateTime(selectedInvoice.createdAt)}</div>
              {selectedInvoice.customerName && (
                <div><strong>العميل:</strong> {selectedInvoice.customerName}</div>
              )}
              <div>
                <strong>طريقة الدفع:</strong>{' '}
                {selectedInvoice.paymentType === 'debt'
                  ? 'دين كامل (آجل) 📝'
                  : selectedInvoice.paymentType === 'partial'
                    ? `دفع جزئي (${getPaymentMethodName(selectedInvoice.paymentMethod)})`
                    : getPaymentMethodName(selectedInvoice.paymentMethod)}
              </div>
              {selectedInvoice.note && <div><strong>ملاحظة:</strong> {selectedInvoice.note}</div>}
            </div>

            {/* Items */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 12,
              padding: 10,
              maxHeight: 180,
              overflowY: 'auto',
            }}>
              {selectedInvoice.items.map((i, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '5px 0',
                  borderBottom: idx < selectedInvoice.items.length - 1 ? '1px solid var(--color-border)' : 'none',
                  fontSize: 13,
                }}>
                  <span>{i.name} × {formatLineQty(i)}</span>
                  <span style={{ direction: 'ltr', fontWeight: 600 }}>{formatCurrency(i.qty * i.price)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{
              background: 'var(--color-bg-card)',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>المجموع:</span>
                <span style={{ direction: 'ltr' }}>{formatCurrency(selectedInvoice.subtotal)}</span>
              </div>
              {selectedInvoice.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-warning-light)' }}>
                  <span>الخصم:</span>
                  <span style={{ direction: 'ltr' }}>-{formatCurrency(selectedInvoice.discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15, borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>
                <span>الإجمالي:</span>
                <span style={{ direction: 'ltr', color: 'var(--color-primary-light)' }}>{formatCurrency(selectedInvoice.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success-light)' }}>
                <span>المدفوع:</span>
                <span style={{ direction: 'ltr' }}>{formatCurrency(selectedInvoice.paidAmount)}</span>
              </div>
              {selectedInvoice.debtAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-danger-light)', fontWeight: 700 }}>
                  <span>المتبقي كدين:</span>
                  <span style={{ direction: 'ltr' }}>{formatCurrency(selectedInvoice.debtAmount)}</span>
                </div>
              )}
            </div>

            {/* تصدير: صورة PNG / PDF / واتساب كصورة */}
            <InvoiceExportActions
              getTarget={() => reportInvoiceRef.current}
              filenameBase={`invoice-${selectedInvoice.id ?? ''}`}
              whatsappPhone={allCustomers.find((c) => c.id === selectedInvoice.customerId)?.phone}
              whatsappText={`فاتورة مبيعات #${selectedInvoice.id}`}
            />

            <button
              type="button"
              onClick={() => printSaleInvoice(selectedInvoice)}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              🖨️ طباعة الفاتورة
            </button>
          </div>
        </Modal>
      )}

      {/* نسخة مخفية من الفاتورة تُستخدم للتصدير كصورة (خارج النافذة) */}
      {selectedInvoice && (
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: -10000, top: 0, width: 460, pointerEvents: 'none', zIndex: -1 }}
        >
          <InvoicePrint invoice={selectedInvoice} store={storeInfo} containerRef={reportInvoiceRef} />
        </div>
      )}

    </div>
  )
}
