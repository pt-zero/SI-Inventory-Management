import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');
const app = express();
const PORT = Number(process.env.PORT || 3001);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
if (!FIREBASE_PROJECT_ID) {
  throw new Error('FIREBASE_PROJECT_ID must be set to verify Firebase Authentication tokens.');
}
const firebaseApp = initializeApp({
  credential: applicationDefault(),
  projectId: FIREBASE_PROJECT_ID,
});
const firebaseAuth = getAuth(firebaseApp);
const db = new Database(path.join(__dirname, 'inventory.db'));

db.pragma('foreign_keys = ON');

function seedDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'Warehouse',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('admin','vendor')) DEFAULT 'vendor',
      vendor_id INTEGER NULL,
      firebase_uid TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'In Stock',
      vendor_id INTEGER,
      location_id INTEGER,
      intake_date TEXT NOT NULL,
      shipment_status TEXT NOT NULL DEFAULT 'Not Started',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vendor_id) REFERENCES vendors(id),
      FOREIGN KEY(location_id) REFERENCES locations(id)
    );
  `);

  const userColumns = db.pragma('table_info(users)');
  if (!userColumns.some((column) => column.name === 'firebase_uid')) {
    db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)');

  const adminExists = db.prepare('SELECT 1 FROM users WHERE email = ?').get('admin@si.co');
  if (!adminExists) {
    db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run('Savage Admin', 'admin@si.co', '', 'admin');
  }

  const vendorExists = db.prepare('SELECT 1 FROM vendors WHERE email = ?').get('vendor-support@northwind.io');
  if (!vendorExists) {
    db.prepare(
      'INSERT INTO vendors (name, contact_name, email, status) VALUES (?, ?, ?, ?)'
    ).run('Northwind Logistics', 'Shane Porter', 'vendor-support@northwind.io', 'active');
  }

  const vendorUserExists = db.prepare('SELECT 1 FROM users WHERE email = ?').get('vendor@si.co');
  if (!vendorUserExists) {
    const vendorId = db.prepare('SELECT id FROM vendors WHERE email = ?').get('vendor-support@northwind.io').id;
    db.prepare(
      'INSERT INTO users (name, email, password_hash, role, vendor_id) VALUES (?, ?, ?, ?, ?)'
    ).run('Northwind Vendor', 'vendor@si.co', '', 'vendor', vendorId);
  }

  const locationCount = db.prepare('SELECT COUNT(*) as count FROM locations').get().count;
  if (locationCount === 0) {
    db.prepare('INSERT INTO locations (name, code, type) VALUES (?, ?, ?)').run('Dallas Distribution Hub', 'DAL-01', 'Warehouse');
    db.prepare('INSERT INTO locations (name, code, type) VALUES (?, ?, ?)').run('Phoenix Sort Center', 'PHX-02', 'Carrier Hub');
    db.prepare('INSERT INTO locations (name, code, type) VALUES (?, ?, ?)').run('Seattle Returns Dock', 'SEA-03', 'Returns');
  }

  const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory').get().count;
  if (inventoryCount === 0) {
    const vendorId = db.prepare('SELECT id FROM vendors WHERE email = ?').get('vendor-support@northwind.io').id;
    const locationId = db.prepare('SELECT id FROM locations WHERE code = ?').get('DAL-01').id;

    const seedItems = [
      ['SKU-1001', 'Rivet Gun Kit', 'Hardware', 16, 'In Stock', vendorId, locationId, '2026-03-02', 'In Transit', 'Assigned to engineering maintenance team.'],
      ['SKU-1002', 'Industrial Sensor Array', 'Electronics', 42, 'Low Stock', vendorId, locationId, '2026-03-11', 'Received', 'Replacement units for outbound assembly line.'],
      ['SKU-1007', 'Safety Harness Set', 'Safety', 8, 'Reserved', vendorId, locationId, '2026-03-18', 'Pending', 'Reserved for field technician onboarding.'],
      ['SKU-1014', 'Forklift Battery Pack', 'Equipment', 3, 'Low Stock', vendorId, locationId, '2026-04-02', 'In Transit', 'Battery shipment scheduled for cross-dock transfer.'],
    ];

    const insertInventory = db.prepare(`
      INSERT INTO inventory (sku, title, category, quantity, status, vendor_id, location_id, intake_date, shipment_status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of seedItems) {
      insertInventory.run(...item);
    }
  }
}

seedDatabase();

const invalidTokenCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/invalid-id-token',
]);

const resolveFirebaseUser = db.transaction((uid, email) => {
  const linkedUser = db.prepare('SELECT id FROM users WHERE firebase_uid = ?').get(uid);
  if (linkedUser) {
    return getUserData(linkedUser.id);
  }

  const account = db.prepare('SELECT id, firebase_uid FROM users WHERE lower(email) = lower(?)').get(email);
  if (!account || account.firebase_uid) {
    return null;
  }

  db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ? AND firebase_uid IS NULL').run(uid, account.id);
  return getUserData(account.id);
});

async function authUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const identity = await firebaseAuth.verifyIdToken(token);
    if (!identity.email) {
      return res.status(403).json({ message: 'A Firebase account email is required.' });
    }

    const user = resolveFirebaseUser(identity.uid, identity.email);
    if (!user) {
      return res.status(403).json({ message: 'This Firebase account is not authorized for inventory access.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (invalidTokenCodes.has(error.code)) {
      return res.status(401).json({ message: 'Invalid or expired Firebase ID token.' });
    }
    return next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }
    next();
  };
}

function getUserData(userId) {
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.vendor_id, v.name as vendor_name
    FROM users u
    LEFT JOIN vendors v ON v.id = u.vendor_id
    WHERE u.id = ?
  `).get(userId);
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/me', authUser, (req, res) => {
  const user = getUserData(req.user.id);
  res.json({ user });
});

app.get('/api/dashboard', authUser, (req, res) => {
  const { role, vendor_id } = req.user;
  const filterClause = role === 'vendor' ? ' WHERE i.vendor_id = ?' : '';
  const params = role === 'vendor' ? [vendor_id] : [];

  const inventory = db.prepare(`
    SELECT i.*, v.name AS vendor_name, l.name AS location_name
    FROM inventory i
    LEFT JOIN vendors v ON v.id = i.vendor_id
    LEFT JOIN locations l ON l.id = i.location_id
    ${filterClause}
    ORDER BY i.created_at DESC
  `).all(...params);

  const summary = {
    totalItems: inventory.length,
    lowStock: inventory.filter((item) => item.quantity <= 10).length,
    inTransit: inventory.filter((item) => item.shipment_status === 'In Transit').length,
    activeVendors: new Set(inventory.map((item) => item.vendor_id).filter(Boolean)).size,
  };

  res.json({ summary, inventory });
});

app.get('/api/vendors', authUser, (req, res) => {
  if (req.user.role === 'vendor') {
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.user.vendor_id);
    return res.json(vendor ? [vendor] : []);
  }

  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name ASC').all();
  res.json(vendors);
});

app.post('/api/vendors', authUser, requireRole('admin'), (req, res) => {
  const { name, contact_name, email, status } = req.body || {};
  if (!name || !contact_name || !email) {
    return res.status(400).json({ message: 'Vendor details are required.' });
  }

  try {
    const result = db.prepare('INSERT INTO vendors (name, contact_name, email, status) VALUES (?, ?, ?, ?)').run(name, contact_name, email, status || 'active');
    res.status(201).json({ id: result.lastInsertRowid, message: 'Vendor created.' });
  } catch (error) {
    res.status(400).json({ message: 'Vendor already exists or the email is invalid.' });
  }
});

app.get('/api/locations', authUser, (req, res) => {
  const locations = db.prepare('SELECT * FROM locations ORDER BY name ASC').all();
  res.json(locations);
});

app.post('/api/locations', authUser, requireRole('admin'), (req, res) => {
  const { name, code, type } = req.body || {};
  if (!name || !code) {
    return res.status(400).json({ message: 'Location name and code are required.' });
  }

  try {
    const result = db.prepare('INSERT INTO locations (name, code, type) VALUES (?, ?, ?)').run(name, code, type || 'Warehouse');
    res.status(201).json({ id: result.lastInsertRowid, message: 'Location created.' });
  } catch (error) {
    res.status(400).json({ message: 'Location code already exists.' });
  }
});

app.get('/api/inventory', authUser, (req, res) => {
  const { role, vendor_id } = req.user;
  const filterClause = role === 'vendor' ? ' WHERE i.vendor_id = ?' : '';
  const params = role === 'vendor' ? [vendor_id] : [];

  const rows = db.prepare(`
    SELECT i.*, v.name AS vendor_name, l.name AS location_name
    FROM inventory i
    LEFT JOIN vendors v ON v.id = i.vendor_id
    LEFT JOIN locations l ON l.id = i.location_id
    ${filterClause}
    ORDER BY i.created_at DESC
  `).all(...params);

  res.json(rows);
});

app.post('/api/inventory', authUser, (req, res) => {
  const item = req.body || {};
  const { sku, title, category, quantity, vendor_id, location_id, intake_date, status, shipment_status, notes } = item;

  if (!sku || !title || !category || !quantity || !intake_date) {
    return res.status(400).json({ message: 'Required fields are missing.' });
  }

  const permittedVendorId = req.user.role === 'vendor' ? req.user.vendor_id : vendor_id;
  if (!permittedVendorId) {
    return res.status(400).json({ message: 'Inventory must be assigned to a vendor.' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO inventory (sku, title, category, quantity, status, vendor_id, location_id, intake_date, shipment_status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sku, title, category, Number(quantity), status || 'In Stock', permittedVendorId, location_id || null, intake_date, shipment_status || 'Not Started', notes || '');
    return res.status(201).json({ id: result.lastInsertRowid, message: 'Record created successfully.' });
  } catch (error) {
    return res.status(400).json({ message: 'This SKU already exists.' });
  }
});

app.put('/api/inventory/:id', authUser, (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ message: 'Inventory record not found.' });
  }

  if (req.user.role === 'vendor' && current.vendor_id !== req.user.vendor_id) {
    return res.status(403).json({ message: 'Vendor accounts can only edit assigned inventory.' });
  }

  const { sku, title, category, quantity, vendor_id, location_id, intake_date, status, shipment_status, notes } = req.body || {};
  const nextVendorId = req.user.role === 'vendor' ? current.vendor_id : vendor_id ?? current.vendor_id;

  db.prepare(`
    UPDATE inventory
    SET sku = ?, title = ?, category = ?, quantity = ?, vendor_id = ?, location_id = ?, intake_date = ?, status = ?, shipment_status = ?, notes = ?
    WHERE id = ?
  `).run(sku || current.sku, title || current.title, category || current.category, Number(quantity ?? current.quantity), nextVendorId, location_id ?? current.location_id, intake_date || current.intake_date, status || current.status, shipment_status || current.shipment_status, notes ?? current.notes, id);

  return res.json({ message: 'Inventory record updated.' });
});

app.delete('/api/inventory/:id', authUser, (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ message: 'Inventory record not found.' });
  }

  if (req.user.role === 'vendor' && current.vendor_id !== req.user.vendor_id) {
    return res.status(403).json({ message: 'Vendor accounts can only delete assigned inventory.' });
  }

  db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
  res.json({ message: 'Inventory record removed.' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

const distExists = fs.existsSync(distPath);
if (distExists) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
      return next();
    }
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Inventory management API listening on http://localhost:${PORT}`);
});
