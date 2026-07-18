# Sandhu Installment Corporation Web Platform

A production-grade, highly optimized vanilla single-page application (SPA) client built using the **Premium Dark Fintech** design language.

## Architecture

```
Browser / Android APK  →  Vercel (static SPA + /api Express)  →  Neon Postgres
```

- **Frontend:** vanilla SPA at repo root (`index.html`, `assets/`)
- **API:** Express app in `backend/`, exposed on Vercel via `api/index.js`
- **Database:** Neon Postgres (`DATABASE_URL`)

Railway is not required. Local API: `npm run dev:api` in `backend/` (or `npm run start:api` from root).

### Directory Structure

```
/api
  index.js              → Vercel serverless entry (exports Express app)
/assets
  /css
    tokens.css          → Design variables (color, padding, borders, radius)
    base.css            → Resets, grids, animations, core typography
    components.css      → Buttons, forms, modals, tables, badges
    layout.css          → App layout grid, sidebars, toast containers, floating panels
    print.css           → Printer override classes for receipt printing
  /js
    /services
      api.js            → Fetch helper wrapper (authorization head propagation)
      auth.service.js   → Mockable auth actions
      customers.service.js
      installments.service.js
      notifications.service.js
      audit.service.js
    /components
      navbar.js         → Dynamic header navigation
      sidebar.js        → Collapsible sidebar navigation menu
      toast.js          → Status toast manager
      modal.js          → Dialog overlay utility
      chart.js          → Lightweight hand-rolled SVG Line/Bar/Donut charts
    /mock
      customers.mock.js → Data definitions corresponding to production tables
      installments.mock.js
      products.mock.js
    config.js           → Feature toggles, constants, string format utilities
    app.js              → SPA theme hook, hash-based router, FAB floating handlers
/backend                → Express + Postgres (shared by local + Vercel)
vercel.json             → Rewrites /api/* to the serverless function
index.html              → Main entry index template
README.md               → This configuration handbook
```

## Deploy on Vercel + Neon (production)

1. **Neon:** copy the pooled connection string (`…-pooler…` / `sslmode=require`).
2. **Vercel project** (this GitHub repo) → **Settings → Environment Variables** — set:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Neon pooled connection string |
| `JWT_SECRET` | Long random secret (reuse the one from Railway if migrating) |
| `FRONTEND_ORIGIN` | `https://sandhu-installment-corp.vercel.app` (comma-separate extra origins if needed) |
| `ENABLE_SMS_SCHEDULER` | `false` |
| Twilio vars (optional) | Only if SMS is configured |

   Or use **Vercel → Integrations → Neon** to inject `DATABASE_URL` automatically.

3. Deploy (push to `main` or `vercel --prod`).
4. Check health: `https://YOUR-APP.vercel.app/api/health`
5. Log in and smoke-test customers / payments / Roznamcha.
6. **Remove Railway** once Vercel API works (stops the extra host).

Migrations (against Neon) stay local:

```bash
cd backend
# DATABASE_URL=…neon… in backend/.env
npm run migrate
```

## API Integration Contract

When taking this platform live and plugging it into a real database/API:
1. Open `assets/js/config.js`.
2. Toggle `FEATURE_FLAGS.MOCK_MODE` to `false`.
3. Set `API_BASE_URL` to `'/api'` on Vercel (same origin), or `http://localhost:3000/api` for local API.
4. Ensure your server matches the endpoint expectations described below.

### Expected Backend Endpoints

- **Auth Services**:
  - `POST   /api/auth/login` -> returns `{ success: true, data: { user, token } }`
  - `POST   /api/auth/forgot-password` -> returns `{ success: true, data: null }`
- **Customer Directory**:
  - `GET    /api/customers?search=&status=&page=&pageSize=`
  - `GET    /api/customers/:id`
  - `POST   /api/customers`
  - `PUT    /api/customers/:id`
- **Installment Agreements**:
  - `GET    /api/installment-plans?customerId=&status=`
  - `POST   /api/installment-plans`
  - `GET    /api/installment-plans/:id/schedule`
- **Collections & Payment Ledger**:
  - `POST   /api/payments`
  - `GET    /api/payments?planId=&dateFrom=&dateTo=`
  - `GET    /api/reports/summary`
  - `GET    /api/reports/collections?period=`
- **System**:
  - `GET    /api/notifications?userId=`
  - `GET    /api/audit-logs`

## Running Locally

Since this project utilizes ES6 native modules, opening `index.html` directly inside a browser via `file://` scheme is blocked by CORS security policies.

Please serve the folder using a local web server:

```bash
# Option A: NodeJS (http-server)
npx http-server ./

# Option B: Python
python -m http.server 8000
```
