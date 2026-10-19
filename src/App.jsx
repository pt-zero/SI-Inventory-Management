import { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase.js';

const CACHE_KEY = 'si-inventory-cache';
const API_BASE = '/api';

const EMPTY_FORM = {
  sku: '',
  title: '',
  category: '',
  quantity: 0,
  status: 'In Stock',
  vendor_id: '',
  location_id: '',
  intake_date: new Date().toISOString().slice(0, 10),
  shipment_status: 'Not Started',
  notes: '',
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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
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

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [summary, setSummary] = useState({ totalItems: 0, lowStock: 0, inTransit: 0, activeVendors: 0 });
  const [loading, setLoading] = useState(false);
  const [loginState, setLoginState] = useState({ email: '', password: '' });
  const [itemForm, setItemForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesStatus = filter === 'all' || item.status === filter;
      const haystack = `${item.title} ${item.sku} ${item.vendor_name || ''}`.toLowerCase();
      const matchesQuery = !searchQuery || haystack.includes(searchQuery.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [inventory, filter, searchQuery]);

  async function loadSnapshot(uid = firebaseUser?.uid) {
    if (!uid) return;

    const cached = readCache(uid);
    if (cached.inventory) {
      setInventory(cached.inventory);
    }
    if (cached.summary) {
      setSummary(cached.summary);
    }
    if (cached.vendors) {
      setVendors(cached.vendors);
    }
    if (cached.locations) {
      setLocations(cached.locations);
    }

    try {
      const [me, dashboard, vendorList, locationList] = await Promise.all([
        request('/me'),
        request('/dashboard'),
        request('/vendors'),
        request('/locations'),
      ]);

      if (auth?.currentUser?.uid !== uid) {
        return;
      }

      setUser(me.user);
      setInventory(dashboard.inventory);
      setSummary(dashboard.summary);
      setVendors(vendorList);
      setLocations(locationList);
      writeCache(uid, { inventory: dashboard.inventory, summary: dashboard.summary, vendors: vendorList, locations: locationList });
    } catch (requestError) {
      if (auth?.currentUser?.uid === uid) {
        console.error(requestError);
        setError(requestError.message || 'Unable to load data.');
      }
    }
  }

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser);
      setAuthReady(true);
      setUser(null);
      setInventory([]);
      setVendors([]);
      setLocations([]);
      setSummary({ totalItems: 0, lowStock: 0, inTransit: 0, activeVendors: 0 });
      setError('');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      setUser(null);
      return undefined;
    }

    let active = true;
    setLoading(true);
    loadSnapshot(firebaseUser.uid)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');

    try {
      await signInWithEmailAndPassword(
        auth,
        loginState.email.trim(),
        loginState.password,
      );
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.');
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (logoutError) {
      setError(logoutError.message || 'Unable to sign out.');
    }
  }

  async function handleSaveInventory(event) {
    event.preventDefault();
    setError('');

    try {
      const payload = {
        ...itemForm,
        quantity: Number(itemForm.quantity),
        vendor_id: itemForm.vendor_id || (user?.vendor_id ?? ''),
      };

      if (editingId) {
        await request(`/inventory/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/inventory', { method: 'POST', body: JSON.stringify(payload) });
      }

      setItemForm(EMPTY_FORM);
      setEditingId(null);
      await loadSnapshot();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save inventory item.');
    }
  }

  function startEditing(item) {
    setEditingId(item.id);
    setItemForm({
      sku: item.sku,
      title: item.title,
      category: item.category,
      quantity: item.quantity,
      status: item.status,
      vendor_id: item.vendor_id || '',
      location_id: item.location_id || '',
      intake_date: item.intake_date,
      shipment_status: item.shipment_status,
      notes: item.notes || '',
    });
  }

  async function handleDeleteInventory(id) {
    if (!window.confirm('Remove this inventory record?')) {
      return;
    }

    try {
      await request(`/inventory/${id}`, { method: 'DELETE' });
      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete record.');
    }
  }

  if (!authReady || !firebaseUser || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-row">
            <div className="brand-pill">SI</div>
            <div>
              <p className="eyebrow">Savage Innovations</p>
              <h1>Inventory control</h1>
            </div>
          </div>

          <p className="subtitle">Secure access for admin and vendor operations.</p>

          {!firebaseConfigured ? (
            <p className="error-text">Firebase is not configured. Copy the Firebase settings from .env.example into your .env file.</p>
          ) : null}

          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Email
              <input type="email" autoComplete="email" required value={loginState.email} onChange={(event) => setLoginState((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" required value={loginState.password} onChange={(event) => setLoginState((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <button type="submit" className="primary-button" disabled={!firebaseConfigured || !authReady}>Sign in</button>
          </form>

          <div className="demo-box">
            <strong>Account access</strong>
            <div>Accounts are provisioned by an administrator. Contact your administrator if you need access.</div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {firebaseUser ? (
            <button className="secondary-button" type="button" onClick={handleLogout}>Sign out</button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Inventory operations</p>
          <h2>Savage Innovations control room</h2>
        </div>
        <div className="topbar-actions">
          <span className="role-badge">{user.role}</span>
          <button className="secondary-button" type="button" onClick={() => loadSnapshot()}>Refresh cache</button>
          <button className="secondary-button" type="button" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <main className="main-grid">
        <section className="cards-row">
          <StatCard label="Total items" value={summary.totalItems} tone="primary" />
          <StatCard label="Low stock" value={summary.lowStock} tone="warning" />
          <StatCard label="In transit" value={summary.inTransit} tone="accent" />
          <StatCard label="Active vendors" value={summary.activeVendors} tone="neutral" />
        </section>

        <section className="content-grid">
          <div className="panel inventory-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Operations</p>
                <h3>Inventory records</h3>
              </div>
              <div className="panel-tools">
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search SKU or item" />
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Vendor</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item) => (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>
                        <div className="item-title">
                          <strong>{item.title}</strong>
                          <span>{item.shipment_status}</span>
                        </div>
                      </td>
                      <td>{item.category}</td>
                      <td>{item.quantity}</td>
                      <td><span className="status-pill status-pill--dark">{item.status}</span></td>
                      <td>{item.location_name || 'Unassigned'}</td>
                      <td>{item.vendor_name || '—'}</td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className="table-button" onClick={() => startEditing(item)}>Edit</button>
                          <button type="button" className="table-button danger" onClick={() => handleDeleteInventory(item.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="panel form-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">{editingId ? 'Edit record' : 'New record'}</p>
                <h3>{editingId ? 'Update inventory item' : 'Create inventory item'}</h3>
              </div>
            </div>

            <form className="inventory-form" onSubmit={handleSaveInventory}>
              <label>
                SKU
                <input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
              </label>
              <label>
                Title
                <input value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} />
              </label>
              <div className="double-field">
                <label>
                  Category
                  <input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} />
                </label>
                <label>
                  Quantity
                  <input type="number" min="0" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
                </label>
              </div>
              <div className="double-field">
                <label>
                  Status
                  <select value={itemForm.status} onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}>
                    <option value="In Stock">In Stock</option>
                    <option value="Low Stock">Low Stock</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                </label>
                <label>
                  Intake date
                  <input type="date" value={itemForm.intake_date} onChange={(e) => setItemForm({ ...itemForm, intake_date: e.target.value })} />
                </label>
              </div>
              <div className="double-field">
                <label>
                  Vendor
                  <select value={itemForm.vendor_id} onChange={(e) => setItemForm({ ...itemForm, vendor_id: e.target.value })} disabled={!isAdmin && !!user.vendor_id}>
                    <option value="">Select vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Location
                  <select value={itemForm.location_id} onChange={(e) => setItemForm({ ...itemForm, location_id: e.target.value })}>
                    <option value="">Select location</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Shipment status
                <select value={itemForm.shipment_status} onChange={(e) => setItemForm({ ...itemForm, shipment_status: e.target.value })}>
                  <option value="Not Started">Not Started</option>
                  <option value="Received">Received</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Pending">Pending</option>
                </select>
              </label>
              <label>
                Notes
                <textarea rows="4" value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
              </label>

              <div className="action-row">
                <button type="submit" className="primary-button">{editingId ? 'Update item' : 'Add item'}</button>
                <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setItemForm(EMPTY_FORM); }}>
                  Clear
                </button>
              </div>
            </form>
          </aside>
        </section>

        {isAdmin ? (
          <section className="meta-grid">
            <VendorList vendors={vendors} reload={loadSnapshot} />
            <LocationList locations={locations} reload={loadSnapshot} />
          </section>
        ) : null}
      </main>

      {error ? <div className="flash-error">{error}</div> : null}
      {loading ? <div className="loading-banner">Loading inventory data from cache and API…</div> : null}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function VendorList({ vendors, csrfToken, reload }) {
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', status: 'active' });

  async function handleSubmit(event) {
    event.preventDefault();
    await request('/vendors', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({ name: '', contact_name: '', email: '', status: 'active' });
    await reload();
  }

  return (
    <div className="panel small-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Vendor management</p>
          <h3>Vendors</h3>
        </div>
      </div>
      <div className="mini-list">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="mini-card">
            <strong>{vendor.name}</strong>
            <span>{vendor.contact_name}</span>
            <small>{vendor.email}</small>
          </div>
        ))}
      </div>
      <form className="stack-form" onSubmit={handleSubmit}>
        <input value={form.name} placeholder="Vendor name" onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input value={form.contact_name} placeholder="Contact name" onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
        <input value={form.email} placeholder="Contact email" onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <button type="submit" className="primary-button">Add vendor</button>
      </form>
    </div>
  );
}

function LocationList({ locations, reload }) {
  const [form, setForm] = useState({ name: '', code: '', type: 'Warehouse' });

  async function handleSubmit(event) {
    event.preventDefault();
    await request('/locations', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({ name: '', code: '', type: 'Warehouse' });
    await reload();
  }

  return (
    <div className="panel small-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Location management</p>
          <h3>Locations</h3>
        </div>
      </div>
      <div className="mini-list">
        {locations.map((location) => (
          <div key={location.id} className="mini-card">
            <strong>{location.name}</strong>
            <span>{location.code}</span>
            <small>{location.type}</small>
          </div>
        ))}
      </div>
      <form className="stack-form" onSubmit={handleSubmit}>
        <input value={form.name} placeholder="Location name" onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input value={form.code} placeholder="Location code" onChange={(event) => setForm({ ...form, code: event.target.value })} />
        <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
          <option value="Warehouse">Warehouse</option>
          <option value="Carrier Hub">Carrier Hub</option>
          <option value="Returns">Returns</option>
        </select>
        <button type="submit" className="primary-button">Add location</button>
      </form>
    </div>
  );
}

export default App;
