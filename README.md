# Savage Innovations Inventory Operations Prototype

This project is a full-stack inventory management prototype designed for the Savage Innovations initial screening assignment. It demonstrates a modern operational workflow for inventory intake, cataloging, shipping, vendor coordination, and location tracking.

## Tech stack

- React + Vite for the front-end
- Express.js + SQLite for the API and data layer
- JWT-based authentication with role-based access
- Local browser caching for fast UI refreshes

## Architecture summary

The app uses a simple three-layer architecture:

1. Front-end: React dashboard with role-aware views for admin and vendor users.
2. API layer: Express endpoints for authentication, inventory CRUD, vendors, and locations.
3. Data layer: SQLite database seeded with demo users, vendors, inventory, and locations.

The design is intentionally compact, but it follows good separation of concerns with a REST API and service-style route handlers.

## Features

- Secure sign-in for Internal Admin and External Vendor personas
- Inventory intake and management with filters and search
- Vendor and location management workflows
- Shipment tracking and status changes
- Role-based access protections for vendor-only visibility
- Front-end caching via localStorage to keep the dashboard responsive while revalidating with the API

## Local setup

```bash
npm install
npm run dev
```

This starts:

- Front-end on `http://localhost:5173`
- API on `http://localhost:3001`

## Production build

```bash
npm run build
npm start
```

The server will serve the built application from the `dist` folder when present.

## Assumptions

- The prototype focuses on core inventory workflows rather than full enterprise-grade compliance.
- Vendor-facing users are scoped to their assigned vendor records.
- The application uses local SQLite rather than a cloud database for a quick, reliable demo.

## AI tooling usage

This project was developed with AI-assisted tooling as encouraged by the assignment. The workflow used iterative design, code generation, validation, and refinement to develop a coherent MVP in a short time window.