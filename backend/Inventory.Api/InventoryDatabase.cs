using Microsoft.Data.Sqlite;

namespace Inventory.Api;

public sealed record InventoryUser(long Id, string Name, string Email, string Role, long? VendorId, string? VendorName);

public sealed class InventoryDatabase
{
    private readonly string _connectionString;

    public InventoryDatabase(string databasePath)
    {
        var directory = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _connectionString = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();
        Initialize();
    }

    public InventoryUser? LinkFirebaseUser(string uid, string email)
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        using (var linkedCommand = connection.CreateCommand())
        {
            linkedCommand.Transaction = transaction;
            linkedCommand.CommandText = "SELECT id FROM users WHERE firebase_uid = $uid";
            linkedCommand.Parameters.AddWithValue("$uid", uid);
            var linkedId = linkedCommand.ExecuteScalar();
            if (linkedId is not null)
            {
                var linkedUser = GetUser(connection, transaction, Convert.ToInt64(linkedId));
                transaction.Commit();
                return linkedUser;
            }
        }

        long? userId = null;
        string? existingUid = null;
        using (var accountCommand = connection.CreateCommand())
        {
            accountCommand.Transaction = transaction;
            accountCommand.CommandText = "SELECT id, firebase_uid FROM users WHERE lower(email) = lower($email)";
            accountCommand.Parameters.AddWithValue("$email", email);
            using var reader = accountCommand.ExecuteReader();
            if (reader.Read())
            {
                userId = reader.GetInt64(0);
                existingUid = reader.IsDBNull(1) ? null : reader.GetString(1);
            }
        }

        if (userId is null || existingUid is not null)
        {
            transaction.Commit();
            return null;
        }

        using (var linkCommand = connection.CreateCommand())
        {
            linkCommand.Transaction = transaction;
            linkCommand.CommandText = "UPDATE users SET firebase_uid = $uid WHERE id = $id AND firebase_uid IS NULL";
            linkCommand.Parameters.AddWithValue("$uid", uid);
            linkCommand.Parameters.AddWithValue("$id", userId.Value);
            linkCommand.ExecuteNonQuery();
        }

        var user = GetUser(connection, transaction, userId.Value);
        transaction.Commit();
        return user;
    }

    public InventoryUser? GetUser(long id)
    {
        using var connection = OpenConnection();
        return GetUser(connection, null, id);
    }

    public IReadOnlyList<Dictionary<string, object?>> GetInventory(long? vendorId = null)
    {
        var filter = vendorId.HasValue ? " WHERE i.vendor_id = $vendor_id" : "";
        var parameters = vendorId.HasValue
            ? new[] { ("$vendor_id", (object?)vendorId.Value) }
            : [];

        return QueryRows($"""
            SELECT i.*, v.name AS vendor_name, l.name AS location_name
            FROM inventory i
            LEFT JOIN vendors v ON v.id = i.vendor_id
            LEFT JOIN locations l ON l.id = i.location_id
            {filter}
            ORDER BY i.created_at DESC
            """, parameters);
    }

    public Dictionary<string, object?>? GetInventoryItem(long id)
    {
        return QueryRows("SELECT * FROM inventory WHERE id = $id", ("$id", id)).SingleOrDefault();
    }

    public IReadOnlyList<Dictionary<string, object?>> GetVendors(long? vendorId = null)
    {
        var sql = vendorId.HasValue
            ? "SELECT * FROM vendors WHERE id = $id"
            : "SELECT * FROM vendors ORDER BY name ASC";
        return vendorId.HasValue
            ? QueryRows(sql, ("$id", vendorId.Value))
            : QueryRows(sql);
    }

    public IReadOnlyList<Dictionary<string, object?>> GetLocations()
    {
        return QueryRows("SELECT * FROM locations ORDER BY name ASC");
    }

    public long AddVendor(string name, string contactName, string email, string status)
    {
        return Insert("""
            INSERT INTO vendors (name, contact_name, email, status)
            VALUES ($name, $contact_name, $email, $status)
            """,
            ("$name", name),
            ("$contact_name", contactName),
            ("$email", email),
            ("$status", status));
    }

    public long AddLocation(string name, string code, string type)
    {
        return Insert("""
            INSERT INTO locations (name, code, type)
            VALUES ($name, $code, $type)
            """,
            ("$name", name),
            ("$code", code),
            ("$type", type));
    }

    public long AddInventoryItem(InventoryInput item, long vendorId, long? locationId)
    {
        return Insert("""
            INSERT INTO inventory (sku, title, category, quantity, status, vendor_id, location_id, intake_date, shipment_status, notes)
            VALUES ($sku, $title, $category, $quantity, $status, $vendor_id, $location_id, $intake_date, $shipment_status, $notes)
            """,
            ("$sku", item.Sku!),
            ("$title", item.Title!),
            ("$category", item.Category!),
            ("$quantity", item.Quantity!.Value),
            ("$status", item.Status ?? "In Stock"),
            ("$vendor_id", vendorId),
            ("$location_id", locationId),
            ("$intake_date", item.IntakeDate!),
            ("$shipment_status", item.ShipmentStatus ?? "Not Started"),
            ("$notes", item.Notes ?? ""));
    }

    public void UpdateInventoryItem(long id, Dictionary<string, object?> current, InventoryInput item, long? actorVendorId)
    {
        var vendorId = actorVendorId ?? ParseStoredLong(item.VendorId) ?? StoredNullableLong(current, "vendor_id");
        Execute("""
            UPDATE inventory
            SET sku = $sku, title = $title, category = $category, quantity = $quantity,
                vendor_id = $vendor_id, location_id = $location_id, intake_date = $intake_date,
                status = $status, shipment_status = $shipment_status, notes = $notes
            WHERE id = $id
            """,
            ("$sku", OrCurrent(item.Sku, current, "sku")),
            ("$title", OrCurrent(item.Title, current, "title")),
            ("$category", OrCurrent(item.Category, current, "category")),
            ("$quantity", item.Quantity ?? StoredInt(current, "quantity")),
            ("$vendor_id", vendorId),
            ("$location_id", item.LocationId.ValueKind == System.Text.Json.JsonValueKind.Undefined
                ? current["location_id"]
                : ParseNullableLong(item.LocationId)),
            ("$intake_date", OrCurrent(item.IntakeDate, current, "intake_date")),
            ("$status", OrCurrent(item.Status, current, "status")),
            ("$shipment_status", OrCurrent(item.ShipmentStatus, current, "shipment_status")),
            ("$notes", item.Notes ?? current["notes"]),
            ("$id", id));
    }

    public void DeleteInventoryItem(long id)
    {
        Execute("DELETE FROM inventory WHERE id = $id", ("$id", id));
    }

    public static long? ParseNullableLong(System.Text.Json.JsonElement element)
    {
        if (element.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
        {
            return null;
        }
        if (element.ValueKind == System.Text.Json.JsonValueKind.String
            && string.IsNullOrWhiteSpace(element.GetString()))
        {
            return null;
        }

        if (element.ValueKind == System.Text.Json.JsonValueKind.Number && element.TryGetInt64(out var number))
        {
            return number;
        }

        if (element.ValueKind == System.Text.Json.JsonValueKind.String
            && long.TryParse(element.GetString(), out number))
        {
            return number;
        }

        throw new FormatException("Expected a numeric ID.");
    }

    private static long? ParseStoredLong(System.Text.Json.JsonElement element)
    {
        return element.ValueKind == System.Text.Json.JsonValueKind.Undefined
            ? null
            : ParseNullableLong(element);
    }

    private static object OrCurrent(string? input, Dictionary<string, object?> current, string key)
    {
        return string.IsNullOrEmpty(input) ? current[key]! : input;
    }

    private static long? StoredNullableLong(Dictionary<string, object?> row, string key)
    {
        return row[key] is null ? null : Convert.ToInt64(row[key]);
    }

    private static int StoredInt(Dictionary<string, object?> row, string key)
    {
        return Convert.ToInt32(row[key]);
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON";
        command.ExecuteNonQuery();
        return connection;
    }

    private void Initialize()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
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
            """;
        command.ExecuteNonQuery();

        var columns = QueryRows("PRAGMA table_info(users)");
        if (columns.All(column => !string.Equals(column["name"]?.ToString(), "firebase_uid", StringComparison.Ordinal)))
        {
            Execute("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
        }
        Execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)");

        Seed();
    }

    private void Seed()
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        Execute(connection, transaction,
            "INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES ('Savage Admin', 'admin@si.co', '', 'admin')");
        Execute(connection, transaction,
            "INSERT OR IGNORE INTO vendors (name, contact_name, email, status) VALUES ('Northwind Logistics', 'Shane Porter', 'vendor-support@northwind.io', 'active')");
        Execute(connection, transaction, """
            INSERT OR IGNORE INTO users (name, email, password_hash, role, vendor_id)
            SELECT 'Northwind Vendor', 'vendor@si.co', '', 'vendor', id
            FROM vendors WHERE email = 'vendor-support@northwind.io'
            """);

        if (ScalarLong(connection, transaction, "SELECT COUNT(*) FROM locations") == 0)
        {
            Execute(connection, transaction, """
                INSERT INTO locations (name, code, type) VALUES
                ('Dallas Distribution Hub', 'DAL-01', 'Warehouse'),
                ('Phoenix Sort Center', 'PHX-02', 'Carrier Hub'),
                ('Seattle Returns Dock', 'SEA-03', 'Returns')
                """);
        }

        if (ScalarLong(connection, transaction, "SELECT COUNT(*) FROM inventory") == 0)
        {
            Execute(connection, transaction, """
                INSERT INTO inventory (sku, title, category, quantity, status, vendor_id, location_id, intake_date, shipment_status, notes)
                SELECT 'SKU-1001', 'Rivet Gun Kit', 'Hardware', 16, 'In Stock', v.id, l.id, '2026-03-02', 'In Transit', 'Assigned to engineering maintenance team.'
                FROM vendors v, locations l WHERE v.email = 'vendor-support@northwind.io' AND l.code = 'DAL-01'
                UNION ALL
                SELECT 'SKU-1002', 'Industrial Sensor Array', 'Electronics', 42, 'Low Stock', v.id, l.id, '2026-03-11', 'Received', 'Replacement units for outbound assembly line.'
                FROM vendors v, locations l WHERE v.email = 'vendor-support@northwind.io' AND l.code = 'DAL-01'
                UNION ALL
                SELECT 'SKU-1007', 'Safety Harness Set', 'Safety', 8, 'Reserved', v.id, l.id, '2026-03-18', 'Pending', 'Reserved for field technician onboarding.'
                FROM vendors v, locations l WHERE v.email = 'vendor-support@northwind.io' AND l.code = 'DAL-01'
                UNION ALL
                SELECT 'SKU-1014', 'Forklift Battery Pack', 'Equipment', 3, 'Low Stock', v.id, l.id, '2026-04-02', 'In Transit', 'Battery shipment scheduled for cross-dock transfer.'
                FROM vendors v, locations l WHERE v.email = 'vendor-support@northwind.io' AND l.code = 'DAL-01'
                """);
        }

        transaction.Commit();
    }

    private InventoryUser? GetUser(SqliteConnection connection, SqliteTransaction? transaction, long id)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT u.id, u.name, u.email, u.role, u.vendor_id, v.name AS vendor_name
            FROM users u
            LEFT JOIN vendors v ON v.id = u.vendor_id
            WHERE u.id = $id
            """;
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new InventoryUser(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetInt64(4),
            reader.IsDBNull(5) ? null : reader.GetString(5));
    }

    private IReadOnlyList<Dictionary<string, object?>> QueryRows(
        string sql,
        params (string Name, object? Value)[] parameters)
    {
        using var connection = OpenConnection();
        return QueryRows(connection, null, sql, parameters);
    }

    private static IReadOnlyList<Dictionary<string, object?>> QueryRows(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql,
        params (string Name, object? Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        AddParameters(command, parameters);
        using var reader = command.ExecuteReader();
        var rows = new List<Dictionary<string, object?>>();
        while (reader.Read())
        {
            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (var index = 0; index < reader.FieldCount; index++)
            {
                row[reader.GetName(index)] = reader.IsDBNull(index) ? null : reader.GetValue(index);
            }
            rows.Add(row);
        }
        return rows;
    }

    private long Insert(string sql, params (string Name, object? Value)[] parameters)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = sql + "; SELECT last_insert_rowid();";
        AddParameters(command, parameters);
        return Convert.ToInt64(command.ExecuteScalar());
    }

    private void Execute(string sql, params (string Name, object? Value)[] parameters)
    {
        using var connection = OpenConnection();
        Execute(connection, null, sql, parameters);
    }

    private static void Execute(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql,
        params (string Name, object? Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        AddParameters(command, parameters);
        command.ExecuteNonQuery();
    }

    private static long ScalarLong(SqliteConnection connection, SqliteTransaction transaction, string sql)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        return Convert.ToInt64(command.ExecuteScalar());
    }

    private static void AddParameters(SqliteCommand command, IEnumerable<(string Name, object? Value)> parameters)
    {
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }
    }
}
