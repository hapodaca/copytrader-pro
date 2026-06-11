import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopActionBar from './TopActionBar'
import BottomNav from './BottomNav'

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('stp_sidebar_collapsed') === 'true'
  )

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('stp_sidebar_collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar — only desktop */}
      <Sidebar
        className="hidden lg:flex"
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* Main */}
      <main className="min-w-0 flex-1 flex flex-col">
        <TopActionBar onOpenMenu={() => setMobileMenuOpen(true)} />

        {/* Page content — pb-16 on mobile to clear bottom nav */}
        <div className="flex-1 p-4 sm:p-6 pb-20 lg:pb-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            aria-label="Cerrar menú"
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <Sidebar
            className="w-60 max-w-[85vw] shadow-2xl"
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Bottom nav — mobile/tablet only */}
      <BottomNav />
    </div>
  )
}
