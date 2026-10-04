import { useState, useMemo } from 'react'
import { useInvoices, useAccountBalances } from '../hooks/useInvoices'
import { useProducts } from '../hooks/useProducts'
import { useCustomers } from '../hooks/useCustomers'
import { useExpenses } from '../hooks/useExpenses'
import { formatCurrency } from '../utils/currency'
import { formatLineQty, lineDiscountAmount } from '../utils/units'
import { Modal } from '../components/ui/Modal'
import { type Invoice, getPaymentMethodName, db } from '../db/db'
import { useStoreName } from '../hooks/useStoreName'
import { useLiveQuery } from 'dexie-react-hooks'

type PeriodFilter = 'today' | 'week' | 'month' | 'all'
type ReportSubTab = 'financial' | 'inventory_debt'

export function ReportsPage() {
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('financial')
  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const invoices = useInvoices({ dateRange: period })
  const allProducts = useProducts()
  const allCustomers = useCustomers('', 'debt')
  const balances = useAccountBalances()
  const storeName = useStoreName()
  const expenses = useExpenses(period)

  // All payments (for debt collection tracking)
  const allPayments = useLiveQuery(() => db.payments.toArray(), []) ?? []

  // Overall Debt
  const totalOutstandingDebt = useMemo(() => {
    return allCustomers.reduce((sum, c) => sum + (c.totalDebt || 0), 0)
  }, [allCustomers])

  // فواتير البيع الحقيقية فقط — نستثني قيود الديون الوهمية (productId === 0)
  // وهي فواتير الرصيد الافتتاحي والديون اليدوية التي ليست بيعاً فعلياً
  const realInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.items.some((i) => i.productId !== 0))
  }, [invoices])

  // KPIs
  const totalSales = useMemo(() => {
    return realInvoices.reduce((sum, inv) => sum + inv.total, 0)
  }, [realInvoices])

  const grossSalesProfit = useMemo(() => {
    return realInvoices.reduce((sum, inv) => {
      const invProfit = inv.items.reduce((iSum, item) => {
        if (item.productId === 0) return iSum // skip opening-debt entries
        const net = item.qty * item.price - lineDiscountAmount(item)
        const profit = net - (item.costPrice || 0) * item.qty
        return iSum + profit
      }, 0)
      return sum + invProfit
    }, 0)
  }, [realInvoices])

  // Operating Expenses
  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  }, [expenses])

  // Real Net Profit = Gross Profit - Operating Expenses
  const realNetProfit = useMemo(() => {
    return grossSalesProfit - totalExpenses
  }, [grossSalesProfit, totalExpenses])

  // Period breakdown by payment method
  const periodCollections = useMemo(() => {
    const map = { cash: 0, jawwal_pay: 0, palpay: 0, bop: 0 }
    realInvoices.forEach((inv) => {
      if (inv.paidAmount > 0) {
        const m = inv.paymentMethod || 'cash'
        if (m === 'jawwal_pay') map.jawwal_pay += inv.paidAmount
        else if (m === 'palpay') map.palpay += inv.paidAmount
        else if (m === 'bop') map.bop += inv.paidAmount
        else map.cash += inv.paidAmount
      }
    })
    return map
  }, [realInvoices])

  // Collected debts in period — سدادات العملاء المستقلة (invoiceId === null)
  // دفعات البيع الأصلية تحمل invoiceId، أما التحصيل من useCustomers.recordPayment فيكون مستقلاً
  const collectedDebtInPeriod = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    return allPayments.reduce((sum, p) => {
      if (p.invoiceId) return sum
      const pDate = new Date(p.createdAt).getTime()
      if (period === 'today' && pDate < startOfDay) return sum
      if (period === 'week' && pDate < startOfWeek) return sum
      if (period === 'month' && pDate < startOfMonth) return sum
      return sum + (p.amount || 0)
    }, 0)
  }, [allPayments, period])

  // Top Selling Products — نستثني بنود الديون الوهمية
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {}

    realInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (item.productId === 0) return
        if (!map[item.name]) {
          map[item.name] = { name: item.name, qty: 0, revenue: 0 }
        }
        map[item.name].qty += item.qty
        map[item.name].revenue += item.price * item.qty - lineDiscountAmount(item)
      })
    })

    const list = Object.values(map).sort((a, b) => b.qty - a.qty)
    return list.slice(0, 5)
  }, [invoices])

  const maxProductQty = topProducts[0]?.qty || 1

  // Top Debtors
  const topDebtors = useMemo(() => {
    return [...allCustomers]
      .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0))
      .slice(0, 5)
  }, [allCustomers])

  // Inventory Alerts
  const lowStockProducts = useMemo(() => {
    return allProducts.filter((p) => p.quantity <= p.lowStockAlert)
  }, [allProducts])

  // Share WhatsApp for selected invoice
  const shareInvoiceWhatsApp = (inv: Invoice) => {
    const customer = allCustomers.find((c) => c.id === inv.customerId)
    const phone = customer?.phone?.replace(/\D/g, '') || ''
    const dateStr = new Date(inv.createdAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

    const itemsText = inv.items
      .map((i) => `• ${i.name} (${formatLineQty(i)} × ${formatCurrency(i.price)}) = ${formatCurrency(i.qty * i.price)}`)
      .join('\n')

    let msg = `🧾 *فاتورة مبيعات — ${storeName} (ميزان)*\n`
    msg += `رقم الفاتورة: #${inv.id}\n`
    msg += `التاريخ: ${dateStr}\n`
    if (inv.customerName) msg += `العميل: ${inv.customerName}\n`
    msg += `طريقة الدفع: ${inv.paymentType === 'debt' ? 'دين كامل 📝' : getPaymentMethodName(inv.paymentMethod)}\n`
    msg += `--------------------------------\n`
    msg += `${itemsText}\n`
    msg += `--------------------------------\n`
    msg += `الإجمالي: ${formatCurrency(inv.total)}\n`
    msg += `المدفوع: ${formatCurrency(inv.paidAmount)}\n`
    if (inv.debtAmount > 0) msg += `المتبقي دين: ${formatCurrency(inv.debtAmount)}\n`

    const encoded = encodeURIComponent(msg)
    if (phone) {
      const cleanPhone = phone.startsWith('0') ? '970' + phone.slice(1) : phone
      window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank')
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank')
    }
  }

  // Period selector helper element
  const renderPeriodSelector = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
      gap: 6,
      background: 'var(--kpi-period-bg)',
      padding: 4,
      borderRadius: 14,
      border: '1px solid var(--color-border)',
    }}>
      {[
        { key: 'today' as PeriodFilter, label: 'اليوم' },
        { key: 'week' as PeriodFilter, label: 'آخر 7 أيام' },
        { key: 'month' as PeriodFilter, label: 'هذا الشهر' },
        { key: 'all' as PeriodFilter, label: 'الكل' },
      ].map((tab) => (
        <button
          key={tab.key}
          onClick={() => setPeriod(tab.key)}
          style={{
            padding: '8px 4px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 13,
            fontFamily: 'var(--font-main)',
            background: period === tab.key ? 'var(--color-primary)' : 'transparent',
            color: period === tab.key ? 'white' : 'var(--color-text-muted)',
            transition: 'all 0.15s ease',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TOP SEGMENTED REPORT TABS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 6,
        background: 'var(--color-bg-card)',
        padding: 5,
        borderRadius: 16,
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <button
          type="button"
          onClick={() => setReportSubTab('financial')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 4px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 13,
            fontFamily: 'var(--font-main)',
            background: reportSubTab === 'financial' ? 'var(--brand-gradient)' : 'transparent',
            color: reportSubTab === 'financial' ? 'white' : 'var(--color-text-muted)',
            transition: 'all 0.18s ease',
            boxShadow: reportSubTab === 'financial' ? 'var(--shadow-primary)' : 'none',
          }}
        >
          <span>📊</span>
          <span>المالية والأرباح</span>
        </button>

        <button
          type="button"
          onClick={() => setReportSubTab('inventory_debt')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 4px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 13,
            fontFamily: 'var(--font-main)',
            background: reportSubTab === 'inventory_debt' ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : 'transparent',
            color: reportSubTab === 'inventory_debt' ? 'white' : 'var(--color-text-muted)',
            transition: 'all 0.18s ease',
            boxShadow: reportSubTab === 'inventory_debt' ? '0 2px 8px rgba(139,92,246,0.35)' : 'none',
          }}
        >
          <span>📦</span>
          <span>حركة وحالة المخزن</span>
          {lowStockProducts.length > 0 && (
            <span style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.2)',
              color: 'var(--color-danger-light)',
              fontWeight: 900,
            }}>
              {lowStockProducts.length}
            </span>
          )}
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: FINANCIAL & PROFITS */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>💼</span>
                <h3 style={{ fontSize: 16, fontWeight: 900 }}>أرصدة الخزينة والحسابات</h3>
              </div>
              <span style={{
                fontSize: 12,
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: 50,
                background: 'rgba(59,130,246,0.15)',
                color: 'var(--color-primary-light)',
                direction: 'ltr',
              }}>
                المجموع: {formatCurrency(balances.total)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Cash */}
              <div style={{
                background: 'var(--color-input-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 14,
                padding: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>💵</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>رصيد الكاش (الصندوق)</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-text-primary)', direction: 'ltr' }}>
                  {formatCurrency(balances.cash)}
                </div>
              </div>

              {/* Jawwal Pay */}
              <div style={{
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.25)',
                borderRadius: 14,
                padding: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>📱</span>
                  <span style={{ fontSize: 12, color: 'var(--color-success-light)', fontWeight: 600 }}>رصيد جوال باي</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-success-light)', direction: 'ltr' }}>
                  {formatCurrency(balances.jawwal_pay)}
                </div>
              </div>

              {/* PalPay */}
              <div style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.25)',
                borderRadius: 14,
                padding: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>💳</span>
                  <span style={{ fontSize: 12, color: 'var(--color-purple-light)', fontWeight: 600 }}>رصيد بال باي (PalPay)</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-purple-light)', direction: 'ltr' }}>
                  {formatCurrency(balances.palpay)}
                </div>
              </div>

              {/* Bank of Palestine */}
              <div style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 14,
                padding: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>🏦</span>
                  <span style={{ fontSize: 12, color: 'var(--color-primary-light)', fontWeight: 600 }}>رصيد بنك فلسطين</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-primary-light)', direction: 'ltr' }}>
                  {formatCurrency(balances.bop)}
                </div>
              </div>
            </div>
          </div>

          {/* Period Selector Tabs */}
          {renderPeriodSelector()}

          {/* 4 Financial KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Sales */}
            <div style={{
              background: 'var(--kpi-blue-bg)',
              border: '1px solid var(--kpi-blue-border)',
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 }}>💵 مبيعاتي</span>
                <span style={{ fontSize: 18 }}>💵</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--color-primary-light)', direction: 'ltr', textAlign: 'right' }}>
                {formatCurrency(totalSales)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                مجموع ما بعته ({realInvoices.length} فواتير)
              </div>
            </div>

            {/* Sales Gross Profit */}
            <div style={{
              background: 'var(--kpi-cyan-bg)',
              border: '1px solid var(--kpi-cyan-border)',
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 }}>📈 ربح البضاعة</span>
                <span style={{ fontSize: 18 }}>📈</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#38bdf8', direction: 'ltr', textAlign: 'right' }}>
                {formatCurrency(grossSalesProfit)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                فرق سعر البيع عن التكلفة
              </div>
            </div>

            {/* Operating Expenses */}
            <div style={{
              background: 'var(--kpi-red-bg)',
              border: '1px solid var(--kpi-red-border)',
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 }}>💸 مصاريفي</span>
                <span style={{ fontSize: 18 }}>💸</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fb7185', direction: 'ltr', textAlign: 'right' }}>
                {formatCurrency(totalExpenses)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                كهرباء وإيجار ورواتب... ({expenses.length})
              </div>
            </div>

            {/* Real Net Profit */}
            <div style={{
              background: realNetProfit >= 0
                ? 'var(--kpi-green-bg)'
                : 'var(--kpi-danger-bg)',
              border: `1.5px solid ${realNetProfit >= 0 ? 'var(--kpi-green-border)' : 'var(--kpi-danger-border)'}`,
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 700 }}>💰 صافي ربحي</span>
                <span style={{ fontSize: 18 }}>💰</span>
              </div>
              <div style={{
                fontSize: 22,
                fontWeight: 900,
                color: realNetProfit >= 0 ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                direction: 'ltr',
                textAlign: 'right'
              }}>
                {formatCurrency(realNetProfit)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                ربح البضاعة ناقص مصاريفي
              </div>
            </div>
          </div>

          {/* Period Collections Breakdown */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: 16,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
              💳 المقبوضات المحصلة حسب وسيلة الدفع
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--kpi-period-inset)', border: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>كاش:</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2 }}>{formatCurrency(periodCollections.cash)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--kpi-green-bg)', border: '1px solid var(--kpi-green-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-success-light)' }}>جوال باي:</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2, color: 'var(--color-success-light)' }}>{formatCurrency(periodCollections.jawwal_pay)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-purple-light)' }}>بال باي:</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2, color: 'var(--color-purple-light)' }}>{formatCurrency(periodCollections.palpay)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--kpi-cyan-bg)', border: '1px solid var(--kpi-cyan-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-primary-light)' }}>بنك فلسطين:</span>
                <p style={{ fontWeight: 800, fontSize: 15, direction: 'ltr', marginTop: 2, color: 'var(--color-primary-light)' }}>{formatCurrency(periodCollections.bop)}</p>
              </div>
            </div>
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
                        {new Date(inv.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* TAB 3: INVENTORY MOVEMENT & DEBTS */}
      {/* ============================================================ */}
      {reportSubTab === 'inventory_debt' && (
        <>
          {/* Period Selector */}
          {renderPeriodSelector()}

          {/* Activity & Debt KPIs */}
          <div className="summary-grid-three" style={{ display: 'grid', gap: 10 }}>
            {/* Outstanding Debts */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(30,41,59,0.5))',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 16,
              padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>الديون المعلقة</span>
                <span style={{ fontSize: 16 }}>⚠️</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-danger-light)', direction: 'ltr', textAlign: 'right' }}>
                {formatCurrency(totalOutstandingDebt)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                على {allCustomers.length} عميل
              </div>
            </div>

            {/* Collected Debts in Period */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(30,41,59,0.5))',
              border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: 16,
              padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>ديون محصلة</span>
                <span style={{ fontSize: 16 }}>✅</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-success-light)', direction: 'ltr', textAlign: 'right' }}>
                {formatCurrency(collectedDebtInPeriod)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                تحصيل (سيولة)
              </div>
            </div>

            {/* Sales Invoices Count */}
            <div style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>عدد العمليات</span>
                <span style={{ fontSize: 16 }}>🧾</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-text-primary)' }}>
                {realInvoices.length}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                عملية بيع
              </div>
            </div>
          </div>

          {/* Top Selling Products */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>🔥 الأكثر مبيعاً في هذه الفترة</h3>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>أفضل 5</span>
            </div>

            {topProducts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '16px 0' }}>
                لا توجد مبيعات مسجلة في هذه الفترة
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topProducts.map((p, idx) => {
                  const pct = Math.round((p.qty / maxProductQty) * 100)
                  return (
                    <div key={p.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700 }}>
                          <span style={{ color: 'var(--color-primary-light)', marginLeft: 6 }}>#{idx + 1}</span>
                          {p.name}
                        </span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          <strong>{p.qty}</strong> قطعة ({formatCurrency(p.revenue)})
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                          borderRadius: 4,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top Debtor Customers */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>👥 أعلى العملاء ديناً</h3>
              <span style={{ fontSize: 12, color: 'var(--color-danger-light)', fontWeight: 700 }}>متابعة التحصيل</span>
            </div>

            {topDebtors.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '16px 0' }}>
                لا توجد ديون مستحقة على أي عميل 🎉
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topDebtors.map((c, idx) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 10,
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        <span style={{ color: 'var(--color-danger-light)', marginLeft: 6 }}>#{idx + 1}</span>
                        {c.name}
                      </span>
                      {c.phone && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', direction: 'ltr', textAlign: 'right' }}>
                          {c.phone}
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 800, color: 'var(--color-danger-light)', direction: 'ltr', fontSize: 14 }}>
                      {formatCurrency(c.totalDebt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Low Stock Warning */}
          {lowStockProducts.length > 0 && (
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
            </div>
          )}
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
              <div><strong>التاريخ:</strong> {new Date(selectedInvoice.createdAt).toLocaleString('ar-EG')}</div>
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

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => shareInvoiceWhatsApp(selectedInvoice)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 12,
                  background: '#25D366',
                  border: 'none',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>مشاركة واتساب</span>
                <span>💬</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: '11px 16px',
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
                🖨️ طباعة
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
