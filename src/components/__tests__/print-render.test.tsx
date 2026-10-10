/**
 * print-render.test.ts — معاينة الطباعة يجب أن ترسم محتوى (لا فراغ)
 * يغطي بلاغ: معاينة طباعة فواتير البيع والشراء لا تظهر شيئاً
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint, type StoreInfo } from '../invoice/InvoicePrint'
import { PurchasePrint } from '../purchases/PurchasePrint'
import type { Invoice, Purchase } from '../../db/db'

const store: StoreInfo = {
  name: 'متجر الاختبار',
  phone: '0599123456',
  address: 'شارع الاختبار',
  currency: '₪',
  footer: 'شكراً لتسوقكم معنا',
}

const sale: Invoice = {
  id: 7,
  customerId: 1,
  customerName: 'أحمد',
  items: [
    { productId: 1, name: 'شيبس', qty: 2, price: 5, costPrice: 3, unit: 'piece' },
    { productId: 2, name: 'أرز', qty: 12, price: 55, costPrice: 36, unit: 'piece', pack: { label: 'كرتونة', factor: 12, price: 55 } },
    { productId: 3, name: 'سكر', qty: 0.5, price: 40, costPrice: 25, unit: 'kg', discount: { type: 'percent', value: 10 } },
  ],
  subtotal: 100,
  discountType: 'fixed',
  discountValue: 5,
  discountAmount: 5,
  itemDiscountAmount: 2,
  total: 93,
  paidAmount: 50,
  debtAmount: 43,
  paymentType: 'partial',
  paymentMethod: 'cash',
  note: 'ملاحظة اختبار',
  createdAt: new Date('2026-10-09T10:30:00'),
}

const purchase: Purchase = {
  id: 3,
  invoiceNumber: 'INV-1',
  supplierName: 'شركة النور',
  items: [
    { productId: 1, productName: 'شيبس', barcode: '123', quantity: 20, oldQuantity: 5, newQuantity: 25, costPrice: 3, totalCost: 60, unit: 'piece' },
  ],
  totalAmount: 60,
  paidAmount: 20,
  debtAmount: 40,
  paymentType: 'partial',
  paymentMethod: 'cash',
  supplierPayments: [{ amount: 20, paymentMethod: 'cash', date: new Date('2026-10-09T11:00:00'), notes: 'الدفعة الأولى عند التوريد' }],
  date: new Date('2026-10-09T09:00:00'),
  notes: 'ملاحظة توريد',
  createdAt: new Date('2026-10-09T09:00:00'),
}

describe('معاينة طباعة فاتورة البيع', () => {
  it('ترسم الأصناف والإجماليات (ليست فارغة)', () => {
    const html = renderToStaticMarkup(<InvoicePrint invoice={sale} store={store} />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).toContain('شيبس')
    expect(html).toContain('كرتونة')
    expect(html).toContain('فاتورة #7')
    expect(html).toContain('93.00')
  })
})

describe('معاينة طباعة فاتورة الشراء', () => {
  it('ترسم المورد والأصناف والدفعات (ليست فارغة)', () => {
    const html = renderToStaticMarkup(<PurchasePrint purchase={purchase} store={store} />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).toContain('شركة النور')
    expect(html).toContain('شيبس')
    expect(html).toContain('فاتورة شراء')
  })
})
