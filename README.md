# Counterly POS

Counterly is an interview-ready, Square-inspired Point of Sale application. It supports store operations from authentication and product management to checkout, Stripe payments, inventory, shifts, customers, staff roles, reports, receipts, and email notifications.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, JavaScript/JSX, CSS, Lucide icons |
| Backend | Node.js, Express.js, REST APIs |
| Database | PostgreSQL hosted on Supabase |
| Authentication | Supabase Auth, email/password, Google OAuth |
| Payments | Cash and Stripe Payment Element/PaymentIntents |
| Email | Nodemailer with Gmail SMTP |
| Security | JWT authentication, PostgreSQL RLS, role-aware RPCs |
| Production | AWS EC2, PM2 and Nginx compatible |

## Main features

### Authentication

- Email/password sign up and sign in
- Google Sign-In
- Persistent Supabase sessions
- Secure logout
- A demo store and starter catalog are created for a new owner

### POS register

- Product search and category filters
- Stock-aware cart quantities
- Discount and configurable tax calculation
- Cash received and change calculation
- Optional customer and order note
- Cash checkout
- Secure Stripe card checkout
- Printable receipt
- Authenticated receipt email

### Products and inventory

- Product and category management
- SKU, price, stock, color and active status
- Stock increase/decrease adjustments
- Inventory movement history
- Low-stock visibility
- Transaction-safe stock deduction during checkout

### Sales and customers

- Sales history and receipt details
- Customer management
- Customer linked to a sale
- Void and refund workflow
- Held/parked orders that can be resumed

### Register shifts

- Opening cash
- Current cash sales
- Expected drawer cash
- Closing cash count
- Over/short cash difference
- Shift history and reconciliation

### Staff roles

- Owner, manager and cashier roles
- Staff management using an existing registered email
- Staff sales and order totals
- Owner cannot be removed or downgraded
- Managers can manage cashiers but cannot promote themselves

### Reports and settings

- Net sales and completed orders
- Items sold and average order value
- Daily sales chart
- Cash/card payment breakdown
- Top-selling products
- Store name, currency and tax settings

## Project structure

```text
pos/
├── client/
│   ├── src/                  React pages, components and styles
│   ├── .env.example          Frontend environment template
│   └── vite.config.js
├── server/
│   ├── src/index.js          Express API, Stripe and static hosting
│   ├── src/mailer.js         SMTP receipt email
│   └── .env.example          Server environment template
├── supabase/migrations/      Versioned PostgreSQL migrations
├── package.json              Root development/build commands
└── README.md
```

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project
- Google Cloud OAuth client for Google Sign-In
- Gmail App Password for receipt email
- Stripe sandbox account for test card payments

## Install and run locally

Install all dependencies:

```bash
npm run install:all
```

Start the React development server and Express API together:

```bash
npm run dev
```

Open:

```text
Frontend: http://localhost:5173
API:      http://localhost:4000
```

During `npm run dev`, Vite proxies `/api` requests to `https://counterly-api.vercel.app`. The local UI therefore uses the live backend without browser CORS restrictions. Production builds use `VITE_API_URL` directly.

Production-style local run:

```bash
npm run build
npm start
```

Then open `http://localhost:4000`.

## Environment configuration

Create `client/.env` from `client/.env.example`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
VITE_API_URL=https://counterly-api.vercel.app
```

Create `server/.env` from `server/.env.example`:

```env
PORT=4000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
CLIENT_URL=https://pos-two-puce.vercel.app

MAIL_DRIVER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-address@gmail.com
MAIL_PASSWORD=your-google-app-password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=your-address@gmail.com
MAIL_FROM_NAME=Counterly POS

STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

Important security rules:

- Never commit `client/.env` or `server/.env`.
- Only `pk_test_...`/`pk_live_...` belongs in the client.
- Never put `sk_test_...`, `sk_live_...`, SMTP passwords or webhook secrets in React code.
- The Stripe secret key remains server-side.
- Raw card details are handled inside Stripe Elements and never reach this server.

## Supabase database setup

SQL migrations are stored in `supabase/migrations` and cover:

1. Core POS schema and checkout transaction
2. RLS helper permissions
3. Inventory adjustments
4. Sale void/refund support
5. Customers and held orders
6. Register shifts
7. Shift indexes
8. Staff management
9. Staff RLS hardening
10. Stripe payment references and duplicate-sale protection

For the existing connected project, these migrations have already been applied. For a new Supabase project, link the Supabase CLI and apply migrations in timestamp order.

The client must only use the Supabase publishable key. Do not expose the service-role key.

## Google Sign-In configuration

In Google Cloud Console, create an OAuth 2.0 Web Application client.

Authorized JavaScript origins for local development:

```text
http://localhost:5173
http://localhost:4000
```

Google OAuth redirect URI:

```text
https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
```

Then enable Google under Supabase Dashboard → Authentication → Providers and enter the Google Client ID and Client Secret.

In Supabase Dashboard → Authentication → URL Configuration, add local and production application URLs to the redirect allow list.

## Stripe sandbox configuration

Get test keys from Stripe Dashboard → Developers → API keys:

```text
Publishable key: pk_test_...
Secret key:      sk_test_...
```

Place the publishable key in `client/.env` and the secret key in `server/.env`.

Webhook endpoint:

```text
Local:      http://localhost:4000/api/stripe/webhook
Production: https://your-domain.com/api/stripe/webhook
```

Subscribe at minimum to:

```text
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
```

Copy the endpoint signing secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET` and restart the server.

Stripe test card:

```text
Card number: 4242 4242 4242 4242
Expiry:      Any future date
CVC:         Any 3 digits
Postal code: Any valid value
```

The server recalculates product prices, tax and discount from trusted database data before creating and finalizing a payment. A unique Stripe PaymentIntent reference prevents duplicate sales.

## SMTP receipt emails

Use a Google App Password rather than the normal Gmail account password. Configure the `MAIL_*` variables in `server/.env`, restart the API and check:

```text
GET http://localhost:4000/api/health
```

Expected configured services appear as:

```json
{
  "status": "ok",
  "database": "supabase-postgresql",
  "mail": "configured",
  "stripe": "configured"
}
```

Receipt emails can only be requested by an authenticated user and are sent to that signed-in user's verified email address.

## Available commands

```bash
npm run install:all   # Install client and server dependencies
npm run dev           # Run client and server in development
npm run build         # Build the React production bundle
npm start             # Serve the built app through Express
```

## Interview demo flow

1. Sign up using email/password or Google.
2. Show the dashboard and seeded product catalog.
3. Open a register shift with starting cash.
4. Create or select a customer.
5. Add products, apply a discount and hold the order.
6. Resume the held order.
7. Complete a cash payment and show change calculation.
8. Complete a Stripe sandbox payment using the test card.
9. Print the receipt and show email notification status.
10. Open Sales and show receipt/refund/void functionality.
11. Show inventory deduction and adjustment history.
12. Close the shift and demonstrate cash reconciliation.
13. Show reports and staff roles.

## AWS EC2 deployment outline

1. Create an Ubuntu EC2 instance.
2. Allow inbound ports `22`, `80` and `443` in its Security Group.
3. Install Node.js 20, Nginx and PM2.
4. Upload or clone this repository.
5. Create `client/.env` and `server/.env` on the server.
6. Run `npm run install:all` and `npm run build`.
7. Start the app with PM2 using `npm start`.
8. Configure Nginx to proxy port 80/443 to `127.0.0.1:4000`.
9. Add a domain and HTTPS certificate for production Stripe and Google OAuth usage.
10. Add the final domain to Supabase redirect URLs and Google authorized origins.
11. Register the production Stripe webhook endpoint.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Service configuration health |
| POST | `/api/email/receipt` | Send authenticated receipt email |
| POST | `/api/stripe/payment-intent` | Create server-priced Stripe PaymentIntent |
| POST | `/api/stripe/finalize` | Verify payment and record POS sale |
| POST | `/api/stripe/webhook` | Verify and receive Stripe events |

## Current project status

The initial/interview-level POS is feature-complete. The React production build passes, Supabase migrations are applied, Google authentication is configured, SMTP support is implemented, and Stripe sandbox keys can be used for test payments. Production deployment still requires the final server/domain, HTTPS, OAuth URL, and Stripe webhook configuration.
