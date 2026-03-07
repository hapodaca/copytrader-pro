import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '~' },
  { to: '/accounts', label: 'Cuentas', icon: '$' },
  { to: '/groups', label: 'Copy Groups', icon: '#' },
  { to: '/rules', label: 'Reglas', icon: '%' },
  { to: '/manual', label: 'Manual', icon: '>' },
  { to: '/signals', label: 'Signals', icon: '*' },
  { to: '/orders', label: 'Orders', icon: '+' },
  { to: '/reports', label: 'Reports', icon: '=' },
];

const adminItems = [
  { to: '/admin', label: 'Admin', icon: '!' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-emerald-400">CopyTrader Pro</h1>
        <p className="text-xs text-gray-500 mt-1">v1.0 MVP</p>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-emerald-600/20 text-emerald-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <span className="w-4 text-center font-mono">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <>
            <div className="border-t border-gray-800 my-2" />
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-amber-600/20 text-amber-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`
                }
              >
                <span className="w-4 text-center font-mono">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <div className="text-xs text-gray-500 mb-2 truncate">{user?.email}</div>
        <button
          onClick={logout}
          className="w-full text-left text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-800"
        >
          Cerrar Sesion
        </button>
      </div>
    </aside>
  );
}
