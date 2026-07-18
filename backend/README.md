# Sandhu Installment Backend

Node.js + Express backend for the Sandhu Installment Corporation SPA, backed by PostgreSQL.

## Stack

- Runtime: Node.js
- HTTP server: Express
- Database: PostgreSQL
- Query layer: `pg` with raw parameterized SQL queries
- Auth: bcrypt password hashes and signed JWT bearer tokens

`pg` is intentionally lightweight here: the schema is documented as SQL migrations, queries stay explicit, and PostgreSQL transactions are used directly for ledger-critical actions like recording payments.

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sandhu_installments
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_ORIGIN=http://localhost:8000
PORT=3000
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-twilio-auth-token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
ENABLE_SMS_SCHEDULER=true
```

**Production (Vercel):** set the same variables in the Vercel project dashboard (not in git). Use Neon’s pooled `DATABASE_URL`, set `FRONTEND_ORIGIN` to your Vercel URL, and `ENABLE_SMS_SCHEDULER=false`. The SPA calls same-origin `/api` via `api/index.js` — Railway is not required.

Secrets must come from environment variables. Do not hardcode production database URLs or JWT secrets.

Twilio variables are required for real SMS delivery. If they are missing, payment and due/overdue actions still succeed, but the SMS attempt is logged as `failed` in `sms_notifications_log`.

`FRONTEND_ORIGIN` controls CORS. Use the deployed frontend domain in production, for example:

```bash
FRONTEND_ORIGIN=https://app.sandhuinstallments.com
```

Multiple origins can be comma-separated.

## Local Setup

```bash
npm install
npm run migrate
npm run seed
npm run dev
```

The API listens on `http://localhost:3000` by default.

Health checks:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/health
```

## Database

Run migrations:

```bash
npm run migrate
```

Run seed data:

```bash
npm run seed
```

The seed creates demo accounts:

- `admin@sandhuinstallments.com` / `admin123`
- `hamza@sandhuinstallments.com` / `manager123`
- `sara@sandhuinstallments.com` / `agent123`
- `arif.customer@email.com` / `customer123`

## Frontend Integration

In `assets/js/config.js`:

```js
API_BASE_URL: 'http://localhost:3000/api',
FEATURE_FLAGS: {
  MOCK_MODE: false,
}
```

For production, point `API_BASE_URL` at the deployed backend URL.

## Implemented API

All API responses use:

```json
{ "success": true, "data": {}, "error": null }
```

List endpoints also return top-level pagination:

```json
{
  "success": true,
  "data": [],
  "error": null,
  "pagination": { "page": 1, "pageSize": 15, "total": 0, "totalPages": 0 }
}
```

Implemented routes:

- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `GET /api/customers`
- `GET /api/customers/:id`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `DELETE /api/customers/:id`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `GET /api/installment-plans`
- `GET /api/installment-plans/:id`
- `POST /api/installment-plans`
- `GET /api/installment-plans/:id/schedule`
- `POST /api/payments`
- `GET /api/payments`
- `GET /api/payments/:id`
- `GET /api/reports/summary`
- `GET /api/reports/collections`
- `GET /api/reports/today-due`
- `GET /api/notifications`
- `GET /api/notifications/sms-log`
- `POST /api/notifications/sms-sweep`
- `PATCH /api/notifications/:id`
- `POST /api/notifications/mark-all-read`
- `GET /api/audit-logs`
- `POST /api/audit-logs`
- `GET /api/users`
- `POST /api/users`

## Security and Business Rules

- Passwords are hashed with bcrypt.
- JWTs are required for protected endpoints.
- Admin, manager, agent, and customer access rules are enforced server-side.
- Customer-role users can only read their own customer, plan, schedule, and payment data.
- Customers with active installment plans cannot be deleted.
- Create, update, delete, login, and payment actions write audit logs.
- Recording a payment runs in one PostgreSQL transaction: insert payment, update schedule, recalculate plan balance, and update customer outstanding total.
- Payment confirmation SMS is attempted after the payment transaction commits. SMS failure never rolls back the payment.

## SMS Alerts

SMS alerts are customer opt-in/out via `customers.sms_alerts_enabled`.

Implemented SMS events:

- Payment confirmation after `POST /api/payments`
- Due-soon reminders for unpaid installments due in the next 2 days
- Overdue reminders for unpaid installments with a past due date

The backend starts an in-process daily scheduler by default. Set `ENABLE_SMS_SCHEDULER=false` to disable it and use an external scheduler instead. For Railway, the safer production setup is a Railway Cron Job that calls `POST /api/notifications/sms-sweep` once daily with an admin/manager token, especially if the API is scaled to multiple instances. The in-process scheduler is simpler, but multiple running app instances can each run the sweep.

Every SMS attempt is logged in `sms_notifications_log` with recipient, message, alert type, status, timestamp, provider response ID, and error text where applicable.
