# Savage Innovations Inventory Management

This project is a full-stack inventory management application for inventory intake, cataloging, shipping, vendor coordination, and location tracking.

## Tech stack

- React + Vite for the front-end
- React Router for separate login and protected inventory routes
- shadcn/ui components with Tailwind CSS v4 for the front-end design system
- ASP.NET Core + Azure SQL for the API and relational data
- AutoMapper for mapping backend entities to API response DTOs
- Firebase Authentication for sign-in and ID token verification
- Azure SQL-backed admin/vendor roles and access controls
- Local browser caching for fast UI refreshes

## Architecture summary

The app uses a simple three-layer architecture:

1. Front-end: React dashboard with role-aware views for admin and vendor users.
2. API layer: ASP.NET Core API with Firebase-authenticated access to inventory, vendors, and locations.
3. Data layer: Azure SQL stores account role mappings, vendors, inventory, and locations with relational foreign keys.

The design is intentionally compact, but it follows good separation of concerns with a REST API and service-style route handlers.

## Front-end components

The React app uses local shadcn/ui components for buttons, cards, form controls, badges, and tables. Add more components with `npx shadcn@latest add <component>`; components are generated under `src/components/ui` and use the `@/` alias for imports.

The login page is available at `/login`. Authenticated users can navigate to `/inventory`, `/vendors`, and `/locations`; vendor and location management routes are restricted to administrators. The root route redirects to `/inventory`, while unauthenticated users are redirected to sign in.

Creating a vendor also creates a Firebase email/password account using the vendor email and initial password. Administrators can edit the contact name and email; contact changes are synchronized to the linked Firebase account, including the login email and display name. Administrators can optionally set a new password in the same edit form; leaving the password blank keeps the current password. The API requires Firebase Admin credentials configured through Application Default Credentials. Pausing a vendor disables its Firebase account and API access. Vendor deletion is blocked while inventory is assigned to that vendor; after deleting a vendor, the API also removes its associated Firebase accounts.

Administrators can edit location names, codes, and types, or delete locations. Deletion is blocked while inventory records still reference the location.

## Features

- Firebase email/password sign-in for Internal Admin and External Vendor personas
- Inventory intake and management with filters and search
- Vendor and location management workflows
- Shipment tracking and status changes
- Role-based access protections for vendor-only visibility
- Front-end caching via localStorage to keep the dashboard responsive while revalidating with the API

## Firebase setup

1. Create a Firebase project and add a Web app.
2. In Firebase Console, enable **Email/Password** under Authentication > Sign-in method. Add `localhost` under Authentication > Settings > Authorized domains for local development.
3. Copy `.env.example` to `.env` and fill in the Web app values. Set `FIREBASE_PROJECT_ID` to the same project ID.
4. Configure Application Default Credentials for the API server. For local development, create a service-account key in Firebase Console > Project settings > Service accounts, save it outside the repository, and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. Never commit this key. Grant the service account the Firebase Authentication Admin role so the API can create, disable, and delete vendor accounts. On Google Cloud, use the runtime's attached service account instead and grant it the same role.

The `.env.example` includes an optional `AUTOMAPPER_LICENSE_KEY` setting. Leave it empty unless you have an AutoMapper license key to configure; keep any real key private and out of source control.

## Azure SQL setup

1. Create an Azure SQL logical server and database. Configure the server firewall to allow connections from the machine running the API.
2. In `.env`, set `AZURE_SQL_CONNECTION_STRING` to the Azure SQL connection string. Keep the entire value in double quotes because connection strings contain semicolons and may contain spaces. The example uses SQL authentication; replace its placeholders and keep the connection string private. Set `Encrypt=True` and `TrustServerCertificate=False`.
3. The API applies its checked-in EF Core schema migrations on startup. For a new database, this creates the relational tables and seeds the demo account roles, vendor, locations, and inventory.

```bash
cp .env.example .env
npm install
npm run dev
```

Install the .NET 10 SDK and Node.js before starting the app. The ASP.NET Core API and Vite client both read the root `.env` file. The API uses Azure SQL for application data.

This starts:

- Front-end on `http://localhost:5173`
- API on `http://localhost:3001`

## Production deployment

The production deployment uses one Linux Azure App Service for both the ASP.NET Core API and the Vite-built frontend. The API serves the frontend from `dist`, so the browser and API share an origin and do not require cross-origin access.

Before deploying:

- Configure these API settings in App Service **Configuration**: `ASPNETCORE_ENVIRONMENT=Production`, `AZURE_SQL_CONNECTION_STRING`, and `FIREBASE_PROJECT_ID`.
- Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the Firebase service-account JSON in App Service Configuration. Treat it as a secret; do not commit it or paste it into shell commands. The API uses this setting instead of Application Default Credentials when it is present.
- Provide `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` when building the frontend. These are build-time settings and are embedded in the Vite bundle; Firebase Authentication still requires the deployed hostname to be in the Firebase project's authorized domains.
- The App Service uses its system-assigned managed identity for Azure SQL. Grant it the database permissions needed for application reads/writes and startup migrations; the deployed app uses `db_datareader`, `db_datawriter`, and `db_ddladmin`.
- Production startup does not add demo locations, inventory, or the sample `admin@si.co` account. It does not remove demo rows already present in an existing database, so review and replace or remove those before opening the app to users. After the schema is ready, create the intended admin in Firebase Authentication and add a matching role record in `dbo.users`. For example:

  ```sql
  INSERT INTO dbo.users (name, email, role)
  VALUES (N'<admin name>', N'<admin Firebase email>', N'admin');
  ```

  On the admin's first sign-in, the API links the Firebase UID to this account.

Build and package the frontend and API from the repository root:

```bash
npm ci
npm run build:client
dotnet publish backend/Inventory.Api/Inventory.Api.csproj --configuration Release --output backend/publish
cp -a dist backend/publish/dist
python3 - <<'PY'
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path("backend/publish")
with ZipFile("backend/publish.zip", "w", ZIP_DEFLATED) as package:
    for path in root.rglob("*"):
        if path.is_file():
            package.write(path, path.relative_to(root))
PY
```

Create a Linux App Service plan and app if they do not already exist, configure the settings above, then deploy the package:

```bash
az appservice plan create --resource-group <resource-group> --name <plan-name> --location <region> --is-linux --sku <sku>
az webapp create --resource-group <resource-group> --plan <plan-name> --name <globally-unique-app-name> --runtime "DOTNETCORE:10.0"
az webapp update --resource-group <resource-group> --name <globally-unique-app-name> --https-only true
az webapp deploy --resource-group <resource-group> --name <globally-unique-app-name> --src-path backend/publish.zip --type zip
```

After deployment, verify `https://<globally-unique-app-name>.azurewebsites.net/api/health` and sign in with the provisioned admin account. Rebuild the client whenever its `VITE_FIREBASE_*` settings change.

## Assumptions

- The prototype focuses on core inventory workflows rather than full enterprise-grade compliance.
- Vendor-facing users are scoped to their assigned vendor records.
- Azure SQL is the application's relational database.
- Firebase Authentication verifies user identities; inventory roles and vendor assignments remain provisioned in Azure SQL and cannot be selected by users at sign-up.

## Known limitations

- The application has only two roles (admin and vendor); user and role provisioning is managed outside the UI in Azure SQL.
- Schema migrations run automatically when the API starts, so the runtime identity needs database permissions to apply schema changes.
- Inventory, vendor, and location lists are returned without pagination. This is suitable for the demo dataset, but large catalogs will need server-side paging and filtering.
- Inventory changes do not have an audit history, and shipment tracking is a manually maintained status rather than a carrier integration.
- Browser caching is for display responsiveness; it does not provide offline writes or cross-user shared cache invalidation.
- The API has no automated test project or deployment pipeline yet.

## What I would build next

1. Add automated API and data-access tests, including Firebase authorization, vendor data isolation, inventory validation, and database schema migrations.
2. Add a managed account administration workflow for inviting users, assigning roles and vendors, and deactivating access without editing the database directly.
3. Add paginated inventory search and filtering, backed by Azure SQL indexes and query plans.
4. Record an audit trail for inventory and role changes, then integrate shipment events from a carrier or warehouse system.
5. Move schema deployment into a controlled release step and use managed identity or another secret-free credential flow for Azure SQL.
6. Add production monitoring, backups, and deployment automation.

## AI tooling usage

This project was developed with AI-assisted tooling as encouraged by the assignment. The workflow used iterative design, code generation, validation, and refinement to develop a coherent MVP in a short time window.