# Counterly POS

An interview-ready Square-inspired point-of-sale application built with React, Node.js/Express, Supabase Auth, PostgreSQL, and Stripe Elements.

## Run locally

```bash
npm run install:all
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000.

For the production-style build:

```bash
npm run build
npm start
```

Open http://localhost:4000.

## Included

- Searchable, category-filtered product catalog
- Cart and stock-aware quantity controls
- Configurable discount and tax, cash/card checkout
- Square-inspired payment review screen with quick cash amounts and change due
- Stripe Payment Element for secure card payments; raw card data never touches this app
- Optional sale notes and detailed payment receipt
- Transaction-safe sale creation and inventory deduction
- Printable payment receipt and authenticated SMTP receipt email
- Automatic demo catalog seeding for each new store
- Responsive UI
- Supabase Auth sessions and PostgreSQL Row Level Security
- Email/password and Google OAuth sign-in
- Customers and sale-to-customer linking
- Held/parked orders with resume workflow
- Product/category management and inventory adjustments
- Sales history, receipt details, void and refund workflow
- Register shifts with opening cash, closing cash, and reconciliation
- Sales reports, payment breakdown, and top products
- Store settings for name, currency, and tax rate
- Staff management with owner, manager, and cashier permissions
- Transaction-safe PostgreSQL checkout with row locking
- Authenticated SMTP receipt notification after checkout

## Environment

Client configuration (`client/.env`):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Server configuration (`server/.env`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
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

Add `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` to `client/.env`. For local webhook testing, forward Stripe events to `http://localhost:4000/api/stripe/webhook` and copy the generated `whsec_...` value into `server/.env`.

Never commit either `.env` file.

## Database

Versioned SQL migrations are in `supabase/migrations`. They create the normalized POS schema, indexes, atomic checkout functions, role-aware RPCs, and Row Level Security policies. Run them in timestamp order for a fresh Supabase project.

## Suggested demo flow

1. Sign up with email/password or Google.
2. Open a shift with starting drawer cash.
3. Add products to cart, apply a discount, and attach a customer.
4. Hold and resume an order.
5. Complete a cash or simulated card payment.
6. Print the receipt and verify the receipt email status.
7. Review the sale, inventory movement, reports, and shift reconciliation.
8. Add an already-registered account under Staff and assign a role.

## Staff permissions

- Owner: full store management and manager/cashier administration.
- Manager: operational management and cashier administration.
- Cashier: register and permitted store workflows.

To add staff, the person first creates a Counterly account. The owner or manager then adds that registered email from the Staff screen.
