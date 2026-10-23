import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase.js';

const CACHE_KEY = 'si-inventory-cache';
const API_BASE = '/api';
const EMPTY_SUMMARY = {
  totalItems: 0,
  lowStock: 0,
  inTransit: 0,
  activeVendors: 0,
  pausedVendors: 0,
};

async function request(path, options = {}) {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();
  let payload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { message: responseText };
    }
  }
  if (!response.ok) {
    throw new Error(payload.message || payload.detail || payload.title || `${response.status} ${response.statusText}`);
  }

  return payload;
}

function readCache(uid) {
  try {
    return JSON.parse(localStorage.getItem(`${CACHE_KEY}:${uid}`) || '{}');
  } catch {
    return {};
  }
}

function writeCache(uid, next) {
  localStorage.setItem(`${CACHE_KEY}:${uid}`, JSON.stringify(next));
}

const InventoryDataContext = createContext(null);

function InventoryDataProvider({ firebaseUser, children }) {
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async (uid = firebaseUser.uid) => {
    if (!uid) return;

    const cached = readCache(uid);
    setInventory(cached.inventory || []);
    setSummary(cached.summary || EMPTY_SUMMARY);
    setVendors(cached.vendors || []);
    setLocations(cached.locations || []);
    setReady(false);
    setLoading(true);

    try {
      const [me, dashboard, vendorList, locationList] = await Promise.all([
        request('/me'),
        request('/dashboard'),
        request('/vendors'),
        request('/locations'),
      ]);

      if (auth?.currentUser?.uid !== uid) return;

      setUser(me.user);
      setInventory(dashboard.inventory);
      setSummary(dashboard.summary);
      setVendors(vendorList);
      setLocations(locationList);
      writeCache(uid, {
        inventory: dashboard.inventory,
        summary: dashboard.summary,
        vendors: vendorList,
        locations: locationList,
      });
    } catch (requestError) {
      if (auth?.currentUser?.uid === uid) {
        console.error(requestError);
        setError(requestError.message || 'Unable to load data.');
      }
    } finally {
      if (auth?.currentUser?.uid === uid) {
        setLoading(false);
        setReady(true);
      }
    }
  }, [firebaseUser.uid]);

  useEffect(() => {
    setError('');
    reload();
  }, [reload]);

  const value = useMemo(() => ({
    user,
    inventory,
    vendors,
    locations,
    summary,
    loading,
    ready,
    error,
    setError,
    reload,
  }), [user, inventory, vendors, locations, summary, loading, ready, error, reload]);

  return (
    <InventoryDataContext.Provider value={value}>
      {children}
    </InventoryDataContext.Provider>
  );
}

function useInventoryData() {
  const context = useContext(InventoryDataContext);
  if (!context) {
    throw new Error('useInventoryData must be used within InventoryDataProvider.');
  }
  return context;
}

export { InventoryDataProvider, request, useInventoryData };
