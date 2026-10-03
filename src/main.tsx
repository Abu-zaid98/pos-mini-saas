import { useState, useEffect, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'

import { LicenseGuard } from './components/LicenseGuard'
import { initSettings } from './db/db'
import { AppShell } from './components/layout/AppShell'
import { LoginScreen } from './pages/LoginScreen'
import { SalePage } from './pages/SalePage'
import { ProductsPage } from './pages/ProductsPage'
import { CustomersPage } from './pages/CustomersPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { ExpensesPage } from './pages/ExpensesPage'

// لوحة التحكم تُحمّل عند الطلب فقط — لا تُثقل فتح الكاشير (code-splitting)
// (ملف admin.css يُستورد داخل AdminApp فيُحمّل مع نفس الشريحة)
const AdminApp = lazy(() =>
  import('./admin/AdminApp').then((m) => ({ default: m.AdminApp }))
)

function AdminLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      background: '#f5f5f7',
      gap: 16,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        width: 56,
        height: 56,
        background: '#1d1d1f',
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        color: '#fff',
      }}>
        ◆
      </div>
      <p style={{ color: '#6e6e73', fontSize: 14 }}>جارٍ تحميل لوحة التحكم...</p>
    </div>
  )
}

// ─── POS App (offline, LicenseGuard) ───────────────────────────
function PosApp() {
  const [authenticated, setAuthenticated] = useState(() => {
    return sessionStorage.getItem('pos_authenticated') === 'true'
  })
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    initSettings().then(() => setDbReady(true))
  }, [])

  const handleLoginSuccess = () => {
    sessionStorage.setItem('pos_authenticated', 'true')
    setAuthenticated(true)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('pos_authenticated')
    setAuthenticated(false)
  }

  if (!dbReady) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        background: 'var(--color-bg-base)',
        gap: 16,
      }}>
        <img
          src="/logo.jpeg"
          alt="ميزان"
          style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'contain', background: '#fff' }}
        />
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>جارٍ التحميل...</p>
      </div>
    )
  }

  if (!authenticated) {
    return <LoginScreen onSuccess={handleLoginSuccess} />
  }

  return (
    <Routes>
      <Route element={<AppShell onLogout={handleLogout} />}>
        <Route path="/" element={<SalePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// ─── Router Root ────────────────────────────────────────────────
function RouterRoot() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  if (isAdmin) {
    // لوحة التحكم — لا تحتاج LicenseGuard ولا Dexie
    return (
      <Suspense fallback={<AdminLoading />}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </Suspense>
    )
  }

  // تطبيق POS — محمي بـ LicenseGuard
  return (
    <LicenseGuard>
      <PosApp />
    </LicenseGuard>
  )
}

// ─── Entry Point ────────────────────────────────────────────────
const root = createRoot(document.getElementById('root')!)
root.render(
  <BrowserRouter>
    <RouterRoot />
  </BrowserRouter>
)
