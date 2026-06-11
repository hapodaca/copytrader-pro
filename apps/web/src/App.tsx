import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import CopyGroups from './pages/CopyGroups'
import Rules from './pages/Rules'
import ManualPanel from './pages/ManualPanel'
import Signals from './pages/Signals'
import Orders from './pages/Orders'
import Reports from './pages/Reports'
import Webhook from './pages/Webhook'
import Settings from './pages/Settings'
import Plans from './pages/Plans'
import AdminDashboard from './pages/AdminDashboard'

// ── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 max-w-2xl w-full">
            <h1 className="text-red-300 text-xl font-bold mb-2">Error en la aplicación</h1>
            <pre className="text-red-400 text-sm overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
              className="mt-4 bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Private Route ───────────────────────────────────────────────────────────
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-blue-400 text-lg">Cargando...</div>
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

// ── Routes ──────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="groups" element={<CopyGroups />} />
        <Route path="rules" element={<Rules />} />
        <Route path="manual" element={<ManualPanel />} />
        <Route path="signals" element={<Signals />} />
        <Route path="orders" element={<Orders />} />
        <Route path="reports" element={<Reports />} />
        <Route path="webhook" element={<Webhook />} />
        <Route path="settings" element={<Settings />} />
        <Route path="plans" element={<Plans />} />
        <Route path="admin" element={<AdminDashboard />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LanguageProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
