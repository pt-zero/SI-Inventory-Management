import { signOut } from 'firebase/auth';
import { NavLink, Outlet } from 'react-router-dom';
import { auth } from './firebase.js';
import { useInventoryData } from './contexts/InventoryDataContext.jsx';
import { Avatar, AvatarFallback } from '@/components/ui/avatar.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { LogOut, MapPin, Package, RefreshCw, Users, X } from 'lucide-react';

const inventoryNavigation = [
  { to: '/inventory', label: 'Inventory', icon: Package },
];

const adminNavigation = [
  { to: '/vendors', label: 'Vendors', icon: Users },
  { to: '/locations', label: 'Locations', icon: MapPin },
];

function AppLayout() {
  const { user, loading, error, setError, reload } = useInventoryData();
  const navigation = user?.role === 'admin'
    ? [...inventoryNavigation, ...adminNavigation]
    : inventoryNavigation;

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (logoutError) {
      setError(logoutError.message || 'Unable to sign out.');
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Inventory operations</p>
          <h2>{user?.vendor_name ? `${user.vendor_name} Control Room` : 'Savage Control Room'}</h2>
        </div>
        <div className="topbar-actions">
          <Avatar>
            <AvatarFallback>{user?.role?.charAt(0).toUpperCase() ?? '?'}</AvatarFallback>
          </Avatar>
          <Badge variant="outline" className="role-badge">
            {user?.name ?? 'Loading'}
          </Badge>
          <Button variant="outline" type="button" onClick={() => reload()}>
            <RefreshCw />Refresh data
          </Button>
          <Button variant="outline" type="button" onClick={handleLogout}>
            <LogOut />Log out
          </Button>
        </div>
      </header>

      <nav className="app-navigation" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => isActive ? 'app-nav-link active' : 'app-nav-link'}
          >
            <Icon aria-hidden="true" />{label}
          </NavLink>
        ))}
      </nav>

      <main className="main-grid">
        <Outlet />
      </main>

      {error ? (
        <div className="flash-error" role="alert">
          <span>{error}</span>
          <button
            className="flash-error-close"
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {loading ? <div className="loading-banner" role="status">Loading inventory data…</div> : null}
    </div>
  );
}

export default AppLayout;
