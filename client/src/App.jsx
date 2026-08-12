import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, Clock3, CreditCard, LogOut, Mail, Minus, Pause, Plus, ReceiptText, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import AuthPage from './AuthPage';
import { getOrCreateStore, supabase } from './lib/supabase';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import ProductsPage from './ProductsPage';
import InventoryPage from './InventoryPage';
import SalesPage from './SalesPage';
import CustomersPage from './CustomersPage';
import HeldOrdersModal from './HeldOrdersModal';
import ShiftsPage from './ShiftsPage';
import ReportsPage from './ReportsPage';
import SettingsPage from './SettingsPage';
import StaffPage from './StaffPage';
import StripeCheckout from './StripeCheckout';

const money = (value) => `Rs. ${Number(value).toLocaleString('en-PK')}`;

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState('Cash');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState('');
  const [categories, setCategories] = useState(['All']);
  const [activePage, setActivePage] = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [heldOpen, setHeldOpen] = useState(false);
  const [activeShift, setActiveShift] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setAuthLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setAuthLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) { setStore(null); return; }
    getOrCreateStore().then(setStore).catch((error) => setMessage(error.message));
  }, [user]);
  const logout = async () => { await supabase.auth.signOut(); setUser(null); setStore(null); setCart([]); };
  const loadProducts = async () => {
    if (!store) return;
    let query = supabase.from('products').select('id,name,sku,price,stock,color,categories(name)').eq('store_id', store.id).eq('is_active', true).order('name');
    if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return setMessage(error.message);
    const mapped = data.map((item) => ({ ...item, price: Number(item.price), category: item.categories?.name || 'Other' }));
    setProducts(category === 'All' ? mapped : mapped.filter((item) => item.category === category));
    const { data: categoryRows } = await supabase.from('categories').select('name').eq('store_id', store.id).order('sort_order');
    if (categoryRows) setCategories(['All', ...categoryRows.map((item) => item.name)]);
  };
  useEffect(() => { if (!store) return; const timer = setTimeout(loadProducts, 150); return () => clearTimeout(timer); }, [search, category, store]);
  useEffect(() => { if (store) supabase.from('customers').select('id,name').eq('store_id', store.id).order('name').then(({ data }) => setCustomers(data || [])); }, [store, activePage]);
  const loadActiveShift = async () => {
    if (!store || !user) return setActiveShift(null);
    const { data } = await supabase.from('register_shifts').select('*').eq('store_id', store.id).eq('opened_by', user.id).eq('status', 'open').maybeSingle();
    if (!data) return setActiveShift(null);
    const { data: sales } = await supabase.from('sales').select('total,payments!inner(amount,kind)').eq('shift_id', data.id).eq('status', 'completed').eq('payments.kind', 'cash');
    setActiveShift({ ...data, liveCashSales: (sales || []).reduce((sum, sale) => sum + (sale.payments || []).reduce((n, p) => n + Number(p.amount), 0), 0) });
  };
  useEffect(() => { loadActiveShift(); }, [store, user]);

  const add = (product) => {
    if (!product.stock) return;
    setCart((items) => {
      const current = items.find((item) => item.id === product.id);
      if (current) return items.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item);
      return [...items, { ...product, quantity: 1 }];
    });
  };
  const changeQuantity = (id, delta) => setCart((items) => items.map((item) => item.id === id ? { ...item, quantity: Math.max(0, Math.min(item.stock, item.quantity + delta)) } : item).filter((item) => item.quantity));
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const taxRate = Number(store?.tax_rate ?? 0.05);
  const tax = subtotal * taxRate;
  const total = Math.max(0, subtotal + tax - Number(discount || 0));

  const holdOrder = async () => {
    if (!cart.length) return;
    const customer = customers.find((item) => String(item.id) === String(selectedCustomer));
    const { error } = await supabase.from('held_orders').insert({ store_id: store.id, created_by: user.id, customer_id: selectedCustomer ? Number(selectedCustomer) : null, label: customer?.name ? `${customer.name}'s order` : `Order ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, items: cart, discount: Number(discount || 0), note: orderNote || null });
    if (error) return setMessage(error.message);
    setCart([]); setDiscount(0); setOrderNote(''); setSelectedCustomer(''); setMessage('Order held successfully.');
  };
  const resumeOrder = async (order) => { setCart(order.items); setDiscount(Number(order.discount)); setOrderNote(order.note || ''); setSelectedCustomer(order.customer_id ? String(order.customer_id) : ''); await supabase.from('held_orders').delete().eq('id', order.id); setHeldOpen(false); setActivePage('register'); };

  const sendReceiptNotification = async (completedReceipt) => {
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/api/email/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ storeName: store.name, receipt: completedReceipt }) });
    const result = await response.json().catch(() => ({}));
    setReceipt((current) => current?.id === completedReceipt.id ? { ...current, emailStatus: response.ok ? `Receipt emailed to ${result.to}` : result.message || 'Email notification failed.' } : current);
  };

  const checkout = async () => {
    setMessage('');
    if (payment === 'Cash' && Number(cashReceived) < total) return setMessage('Cash received must cover the amount due.');
    setProcessing(true);
    try {
      const receiptItems = cart.map(({ name, price, quantity }) => ({ name, price, quantity }));
      const { data: result, error } = await supabase.rpc('checkout_sale', { target_store: store.id, cart_items: cart.map(({ id, quantity }) => ({ productId: id, quantity })), discount_amount: Number(discount || 0), payment_type: payment.toLowerCase(), tendered_amount: payment === 'Cash' ? Number(cashReceived) : null, sale_note: orderNote || null });
      if (error) return setMessage(error.message);
      if (selectedCustomer) await supabase.rpc('link_sale_customer', { target_sale: result.id, target_customer: Number(selectedCustomer) });
      if (activeShift) await supabase.rpc('link_sale_shift', { target_sale: result.id, target_shift: activeShift.id });
      const completedReceipt = { ...result, items: receiptItems, cashReceived: payment === 'Cash' ? Number(cashReceived) : null, note: orderNote, paidAt: new Date(), emailStatus: 'Sending receipt email…' };
      setReceipt(completedReceipt);
      sendReceiptNotification(completedReceipt);
      setCart([]); setDiscount(0); setCashReceived(''); setOrderNote(''); setSelectedCustomer(''); setPaymentOpen(false); loadProducts(); loadActiveShift();
    } finally { setProcessing(false); }
  };

  const finishStripeCheckout = async (result) => {
    setProcessing(true);
    try {
      if (selectedCustomer) await supabase.rpc('link_sale_customer', { target_sale: result.id, target_customer: Number(selectedCustomer) });
      if (activeShift) await supabase.rpc('link_sale_shift', { target_sale: result.id, target_shift: activeShift.id });
      const completedReceipt = { ...result, items: cart.map(({ name, price, quantity }) => ({ name, price, quantity })), cashReceived: null, note: orderNote, paidAt: new Date(), emailStatus: 'Sending receipt email…' };
      setReceipt(completedReceipt); sendReceiptNotification(completedReceipt);
      setCart([]); setDiscount(0); setOrderNote(''); setSelectedCustomer(''); setPaymentOpen(false); loadProducts(); loadActiveShift();
    } finally { setProcessing(false); }
  };

  if (authLoading) return <div className="app-loading"><div className="brand-mark">C</div><p>Loading Counterly…</p></div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;
  return <div className="app-shell">
    <header><div className="brand-mark">C</div><div><h1>{store?.name || 'Counterly'}</h1><p>Point of Sale</p></div><button className={`shift ${activeShift ? '' : 'shift-closed'}`} onClick={() => setActivePage('shifts')}><span className="live-dot" /> {activeShift ? `Shift #${activeShift.id} open` : 'Shift closed'} <b>{user.user_metadata?.full_name || user.email}</b></button><button className="logout" onClick={logout} title="Sign out"><LogOut size={18}/></button></header>
    <div className="workspace"><Sidebar active={activePage} onChange={setActivePage}/>{activePage === 'dashboard' ? <Dashboard store={store} onOpenRegister={() => setActivePage('register')} onOpenProducts={() => setActivePage('products')}/> : activePage === 'products' ? <ProductsPage store={store}/> : activePage === 'inventory' ? <InventoryPage store={store}/> : activePage === 'sales' ? <SalesPage store={store}/> : activePage === 'customers' ? <CustomersPage store={store}/> : activePage === 'staff' ? <StaffPage store={store} user={user}/> : activePage === 'shifts' ? <ShiftsPage store={store} user={user} activeShift={activeShift} onShiftChange={(shift) => { setActiveShift(shift); setTimeout(loadActiveShift, 50); }}/> : activePage === 'reports' ? <ReportsPage store={store}/> : activePage === 'settings' ? <SettingsPage store={store} onSaved={setStore}/> : activePage !== 'register' ? <section className="module-placeholder"><span className="eyebrow">Coming next</span><h2>{activePage.charAt(0).toUpperCase() + activePage.slice(1)}</h2><p>This module is queued in the step-by-step implementation.</p></section> : <main className="pos-main">
      <section className="catalog">
        <div className="section-heading"><div><span className="eyebrow">New order</span><h2>Choose products</h2></div><div className="search"><Search size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU" />{search && <X size={17} onClick={() => setSearch('')} />}</div></div>
        <div className="categories">{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
        <div className="product-grid">{products.map((product) => <button className="product-card" onClick={() => add(product)} key={product.id} disabled={!product.stock}>
          <div className="product-art" style={{ background: `${product.color}18`, color: product.color }}><span>{product.name.slice(0, 2).toUpperCase()}</span><Plus size={18}/></div>
          <div className="product-meta"><span>{product.category}</span><small>{product.sku}</small></div><h3>{product.name}</h3>
          <div className="product-bottom"><b>{money(product.price)}</b><span className={product.stock <= 10 ? 'low' : ''}>{product.stock} in stock</span></div>
        </button>)}</div>
      </section>
      <aside className="cart-panel">
        <div className="cart-title"><div><span className="eyebrow">Current sale</span><h2>Order #NEW</h2></div><button className="held-button" onClick={() => setHeldOpen(true)} title="Held orders"><Clock3 size={18}/></button><div className="bag"><ShoppingBag size={20}/><span>{cart.reduce((n, i) => n + i.quantity, 0)}</span></div></div>
        <div className="cart-items">{!cart.length ? <div className="empty"><ShoppingBag size={34}/><h3>Your cart is empty</h3><p>Select products to start a new order.</p></div> : cart.map((item) => <div className="cart-item" key={item.id}>
          <div className="mini-art" style={{ background: `${item.color}18`, color: item.color }}>{item.name.slice(0, 2).toUpperCase()}</div><div className="item-info"><b>{item.name}</b><span>{money(item.price)}</span></div>
          <div className="stepper"><button onClick={() => changeQuantity(item.id, -1)}><Minus size={14}/></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)}><Plus size={14}/></button></div>
          <b>{money(item.price * item.quantity)}</b><button className="remove" onClick={() => setCart((c) => c.filter((x) => x.id !== item.id))}><Trash2 size={16}/></button>
        </div>)}</div>
        <div className="summary">
          <label>Discount <div><span>Rs.</span><input min="0" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div></label>
          <div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Tax ({taxRate * 100}%)</span><b>{money(tax)}</b></div><div className="total"><span>Total</span><b>{money(total)}</b></div>
          <button className="hold-order" disabled={!cart.length} onClick={holdOrder}><Pause size={15}/> Hold order</button>
          {message && <p className="error">{message}</p>}<button className="checkout" disabled={!cart.length} onClick={() => { setMessage(''); setCashReceived(String(Math.ceil(total / 100) * 100)); setPaymentOpen(true); }}>Review & pay {money(total)} <span>→</span></button>
        </div>
      </aside>
    </main>}</div>
    {paymentOpen && <div className="modal-backdrop payment-backdrop"><div className="pay-dialog">
      <div className="pay-head"><div><span className="eyebrow">Checkout</span><h2>Collect payment</h2></div><button onClick={() => setPaymentOpen(false)}><X size={20}/></button></div>
      <div className="amount-due"><span>Amount due</span><strong>{money(total)}</strong><small>{cart.reduce((n, i) => n + i.quantity, 0)} items · Tax included</small></div>
      <div className="pay-body"><span className="field-title">Payment type <small>Cash or secure online card payment</small></span><div className="pay-types"><button className={payment === 'Cash' ? 'active' : ''} onClick={() => { setPayment('Cash'); setMessage(''); }}><Banknote size={22}/><b>Cash</b><span>Record cash sale</span></button><button className={payment === 'Card' ? 'active' : ''} onClick={() => { setPayment('Card'); setMessage(''); }}><CreditCard size={22}/><b>Card</b><span>Pay securely with Stripe</span></button></div>
        {payment === 'Cash' ? <div className="cash-section"><label>Cash received<div className="cash-input"><span>Rs.</span><input autoFocus type="number" min={total} value={cashReceived} onChange={(e) => { setCashReceived(e.target.value); setMessage(''); }}/></div></label><div className="quick-cash">{[Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).map((amount) => <button key={amount} onClick={() => setCashReceived(String(amount))}>{money(amount)}</button>)}</div><div className="change-row"><span>Change due</span><b>{money(Math.max(0, Number(cashReceived || 0) - total))}</b></div></div> : <StripeCheckout store={store} cart={cart} discount={discount} note={orderNote} onComplete={finishStripeCheckout} onError={setMessage}/>} 
        <label className="order-note">Customer <span>Optional</span><select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label><label className="order-note">Order note <span>Optional</span><textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Add a note for this sale..." maxLength="120" /></label>
        {message && <p className="pay-error">{message}</p>}{payment === 'Cash' && <button className="complete-payment" disabled={processing || Number(cashReceived) < total} onClick={checkout}>{processing ? 'Processing…' : 'Complete Cash payment'} <span>{money(total)} →</span></button>}
      </div>
    </div></div>}
    {heldOpen && <HeldOrdersModal store={store} onClose={() => setHeldOpen(false)} onResume={resumeOrder}/>} 
    {receipt && <div className="modal-backdrop receipt-backdrop"><div className="receipt"><div className="success"><Check size={32}/></div><span className="eyebrow">Payment successful</span><h2>{money(receipt.total)}</h2><p>Order #{receipt.id} · {receipt.paymentMethod} · {new Date(receipt.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p><div className="receipt-items">{receipt.items.map((i) => <div key={i.name}><span>{i.quantity} × {i.name}</span><b>{money(i.price * i.quantity)}</b></div>)}<div><span>Subtotal</span><b>{money(receipt.subtotal)}</b></div><div><span>Tax</span><b>{money(receipt.tax)}</b></div>{receipt.discount > 0 && <div><span>Discount</span><b>− {money(receipt.discount)}</b></div>}{receipt.cashReceived !== null && <><div><span>Cash received</span><b>{money(receipt.cashReceived)}</b></div><div className="receipt-change"><span>Change</span><b>{money(receipt.change)}</b></div></>}</div>{receipt.note && <div className="receipt-note"><ReceiptText size={15}/><span>{receipt.note}</span></div>}<div className="email-status"><Mail size={15}/><span>{receipt.emailStatus}</span></div><div className="receipt-actions"><button className="print-receipt" onClick={() => window.print()}>Print receipt</button><button onClick={() => setReceipt(null)}>Start new order</button></div></div></div>}
  </div>;
}
