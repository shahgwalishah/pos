import dotenv from 'dotenv';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMailConfigured, sendReceiptEmail } from './mailer.js';
import Stripe from 'stripe';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const app = express();
const supabaseUrl = process.env.SUPABASE_URL || 'https://vrrodecylfihoqygeiab.supabase.co';
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7DOaxnrTU1esznX-DyvHFg_sXCt7DMY';
const recentEmails = new Map();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const authenticate = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return { token, user: await response.json() };
};

const supabaseRequest = (path, token, options = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
  ...options,
  headers: { apikey: supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
});

const priceCart = async ({ storeId, cart, discount, token }) => {
  if (!storeId || !Array.isArray(cart) || !cart.length) throw new Error('Cart cannot be empty.');
  const normalized = cart.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity) }));
  if (normalized.some((item) => !Number.isSafeInteger(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Invalid cart.');
  const ids = [...new Set(normalized.map((item) => item.productId))];
  if (ids.length !== normalized.length) throw new Error('Duplicate products are not allowed.');
  const [storeResponse, productResponse] = await Promise.all([
    supabaseRequest(`stores?id=eq.${encodeURIComponent(storeId)}&select=id,currency_code,tax_rate`, token),
    supabaseRequest(`products?store_id=eq.${encodeURIComponent(storeId)}&id=in.(${ids.join(',')})&is_active=eq.true&select=id,price,stock`, token)
  ]);
  if (!storeResponse.ok || !productResponse.ok) throw new Error('Store access denied.');
  const [store] = await storeResponse.json();
  const products = await productResponse.json();
  if (!store || products.length !== ids.length) throw new Error('Product pricing could not be verified.');
  const productMap = new Map(products.map((product) => [Number(product.id), product]));
  let subtotal = 0;
  for (const item of normalized) {
    const product = productMap.get(item.productId);
    if (Number(product.stock) < item.quantity) throw new Error('A product does not have enough stock.');
    subtotal += Number(product.price) * item.quantity;
  }
  const tax = Math.round(subtotal * Number(store.tax_rate) * 100) / 100;
  const safeDiscount = Math.min(Math.max(Number(discount || 0), 0), subtotal + tax);
  const total = Math.max(0, subtotal + tax - safeDiscount);
  if (total < 1) throw new Error('Stripe payment total must be at least 1.');
  return { normalized, total, amount: Math.round(total * 100), currency: store.currency_code.toLowerCase() };
};

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook is not configured.');
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'payment_intent.payment_failed') console.warn('Stripe payment failed:', event.data.object.id);
    res.json({ received: true });
  } catch (error) { res.status(400).send(`Webhook error: ${error.message}`); }
});

app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'supabase-postgresql', mail: isMailConfigured() ? 'configured' : 'not-configured', stripe: stripe ? 'configured' : 'not-configured' }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Counterly API is running'
  });
});

app.post('/api/stripe/payment-intent', async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Stripe is not configured.' });
  const auth = await authenticate(req);
  if (!auth) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const priced = await priceCart({ storeId: req.body.storeId, cart: req.body.cart, discount: req.body.discount, token: auth.token });
    const intent = await stripe.paymentIntents.create({
      amount: priced.amount,
      currency: priced.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { store_id: String(req.body.storeId), user_id: auth.user.id }
    }, { idempotencyKey: `${auth.user.id}-${Date.now()}-${priced.amount}` });
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: priced.total, currency: priced.currency });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/api/stripe/finalize', async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Stripe is not configured.' });
  const auth = await authenticate(req);
  if (!auth) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const intent = await stripe.paymentIntents.retrieve(String(req.body.paymentIntentId || ''));
    if (intent.status !== 'succeeded') return res.status(409).json({ message: `Payment is ${intent.status}.` });
    if (intent.metadata.user_id !== auth.user.id || intent.metadata.store_id !== String(req.body.storeId)) return res.status(403).json({ message: 'Payment ownership mismatch.' });
    const priced = await priceCart({ storeId: req.body.storeId, cart: req.body.cart, discount: req.body.discount, token: auth.token });
    if (intent.amount_received !== priced.amount || intent.currency !== priced.currency) return res.status(409).json({ message: 'Cart total changed after payment started.' });
    const checkoutResponse = await supabaseRequest('rpc/checkout_sale', auth.token, { method: 'POST', body: JSON.stringify({ target_store: req.body.storeId, cart_items: priced.normalized, discount_amount: Number(req.body.discount || 0), payment_type: 'card', tendered_amount: null, sale_note: req.body.note || null, payment_reference: intent.id }) });
    const result = await checkoutResponse.json();
    if (!checkoutResponse.ok) throw new Error(result.message || 'Sale could not be recorded.');
    res.json({ receipt: result });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/api/email/receipt', async (req, res) => {
  const auth = await authenticate(req);
  if (!auth) return res.status(401).json({ message: 'Invalid or expired session.' });
  if (!isMailConfigured()) return res.status(503).json({ message: 'SMTP is not configured.' });
  const user = auth.user;
  const receipt = req.body?.receipt;
  if (!receipt || !Number.isSafeInteger(Number(receipt.id)) || !Number.isFinite(Number(receipt.total)) || Number(receipt.total) < 0 || !Array.isArray(receipt.items)) return res.status(400).json({ message: 'Invalid receipt data.' });
  const rateKey = `${user.id}:${receipt.id}`;
  if (recentEmails.has(rateKey) && Date.now() - recentEmails.get(rateKey) < 60_000) return res.status(429).json({ message: 'Receipt email was already sent.' });
  try {
    await sendReceiptEmail({ to: user.email, customerName: user.user_metadata?.full_name || user.email.split('@')[0], storeName: String(req.body.storeName || 'Counterly POS').slice(0, 100), receipt });
    recentEmails.set(rateKey, Date.now());
    res.json({ sent: true, to: user.email });
  } catch (error) {
    console.error('Receipt email failed:', error.message);
    res.status(502).json({ message: 'Email could not be sent. Check SMTP configuration.' });
  }
});

const clientDist = join(here, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (_req, res) => res.sendFile(join(clientDist, 'index.html')));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Counterly POS running at http://localhost:${port}`));
