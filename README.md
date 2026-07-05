# Sandhu Installment Corporation Web Platform

A production-grade, highly optimized vanilla single-page application (SPA) client built using the **Premium Dark Fintech** design language.

## Architecture

This frontend is designed to be fully data-driven. A clean abstraction layer separates components/pages from direct network logic.

### Directory Structure

```
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
index.html              → Main entry index template
README.md               → This configuration handbook
```

## API Integration Contract

When taking this platform live and plugging it into a real database/API:
1. Open `assets/js/config.js`.
2. Toggle `FEATURE_FLAGS.MOCK_MODE` to `false`.
3. Set `API_BASE_URL` to point to the live server (e.g. `https://api.sandhuinstallments.com`).
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
