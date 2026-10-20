# Savage Innovations Inventory Operations Prototype

This project is a full-stack inventory management prototype designed for the Savage Innovations initial screening assignment. It demonstrates a modern operational workflow for inventory intake, cataloging, shipping, vendor coordination, and location tracking.

## Tech stack

- React + Vite for the front-end
- ASP.NET Core + Azure SQL for the API and relational data
- Firebase Authentication for sign-in and ID token verification
- Azure SQL-backed admin/vendor roles and access controls
- Local browser caching for fast UI refreshes

## Architecture summary

The app uses a simple three-layer architecture:

1. Front-end: React dashboard with role-aware views for admin and vendor users.
2. API layer: ASP.NET Core API with Firebase-authenticated access to inventory, vendors, and locations.
3. Data layer: Azure SQL stores account role mappings, vendors, inventory, and locations with relational foreign keys.

The design is intentionally compact, but it follows good separation of concerns with a REST API and service-style route handlers.

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
4. Configure Application Default Credentials for the API server. For local development, create a service-account key in Firebase Console > Project settings > Service accounts, save it outside the repository, and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. Never commit this key. On Google Cloud, use the runtime's attached service account instead.

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

## Production build

```bash
npm run build
npm start
```

The ASP.NET Core API serves the Vite production build from `dist`. Configure the Azure SQL connection string, Firebase settings, and server credentials in the production environment. Grant the application identity only the SQL permissions it needs; automatic EF migrations require schema-change privileges.

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