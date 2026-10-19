# Savage Innovations Inventory Operations Prototype

This project is a full-stack inventory management prototype designed for the Savage Innovations initial screening assignment. It demonstrates a modern operational workflow for inventory intake, cataloging, shipping, vendor coordination, and location tracking.

## Tech stack

- React + Vite for the front-end
- Express.js + SQLite for the API and data layer
- Firebase Authentication for sign-in and ID token verification
- SQLite-backed admin/vendor roles and access controls
- Local browser caching for fast UI refreshes

## Architecture summary

The app uses a simple three-layer architecture:

1. Front-end: React dashboard with role-aware views for admin and vendor users.
2. API layer: Express API with Firebase-authenticated access to inventory, vendors, and locations.
3. Data layer: SQLite database seeded with account role mappings, vendors, inventory, and locations.

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

```bash
cp .env.example .env
npm install
npm run dev
```

The API loads `.env` automatically. The Vite client uses the `VITE_FIREBASE_*` settings.

This starts:

- Front-end on `http://localhost:5173`
- API on `http://localhost:3001`

## Production build

```bash
npm run build
npm start
```

The server will serve the built application from the `dist` folder when present. Configure the same Firebase environment variables and server credentials in the production environment.

## Assumptions

- The prototype focuses on core inventory workflows rather than full enterprise-grade compliance.
- Vendor-facing users are scoped to their assigned vendor records.
- The application uses local SQLite rather than a cloud database for a quick, reliable demo.
- Firebase Authentication verifies user identities; inventory roles and vendor assignments remain provisioned in SQLite and cannot be selected by users at sign-up.

## AI tooling usage

This project was developed with AI-assisted tooling as encouraged by the assignment. The workflow used iterative design, code generation, validation, and refinement to develop a coherent MVP in a short time window.