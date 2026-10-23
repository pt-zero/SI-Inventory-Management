import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { auth, firebaseConfigured } from './firebase.js';
import AppLayout from './AppLayout.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import VendorManagementPage from './pages/VendorManagementPage.jsx';
import LocationManagementPage from './pages/LocationManagementPage.jsx';
import { InventoryDataProvider, useInventoryData } from './contexts/InventoryDataContext.jsx';

function AuthLoading() {
  return <div className="auth-loading" role="status">Checking your session…</div>;
}

function AuthenticatedLayout({ firebaseUser }) {
  return (
    <InventoryDataProvider key={firebaseUser.uid} firebaseUser={firebaseUser}>
      <AppLayout />
    </InventoryDataProvider>
  );
}

function AdminRoute() {
  const { user, ready } = useInventoryData();

  if (!ready) {
    return <AuthLoading />;
  }

  return user?.role === 'admin'
    ? <Outlet />
    : <Navigate to="/inventory" replace />;
}

function AppRoutes({ authReady, firebaseUser }) {
  if (!authReady) {
    return <AuthLoading />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={firebaseUser ? <Navigate to="/inventory" replace /> : <LoginPage />}
      />
      <Route
        element={
          firebaseUser
            ? <AuthenticatedLayout firebaseUser={firebaseUser} />
            : <Navigate to="/login" replace />
        }
      >
        <Route index element={<Navigate to="/inventory" replace />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route element={<AdminRoute />}>
          <Route path="vendors" element={<VendorManagementPage />} />
          <Route path="locations" element={<LocationManagementPage />} />
        </Route>
      </Route>
      <Route
        path="*"
        element={
          firebaseUser
            ? <Navigate to="/inventory" replace />
            : <Navigate to="/login" replace />
        }
      />
    </Routes>
  );
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes authReady={authReady} firebaseUser={firebaseUser} />
    </BrowserRouter>
  );
}

export default App;
