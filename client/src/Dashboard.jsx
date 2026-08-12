import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Banknote, Package, ReceiptText, ShoppingBag } from 'lucide-react';
import { supabase } from './lib/supabase';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK')}`;
const dayLabel = (date) => date.toLocaleDateString('en', { weekday: 'short' });

export default function Dashboard({ store, onOpenRegister, onOpenProducts }) {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!store) return;
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
    Promise.all([
      supabase.from('sales').select('id,total,status,created_at,payments(kind)').eq('store_id', store.id).gte('created_at', start.toISOString()).order('created_at', { ascending: false }),
      supabase.from('products').select('id,name,sku,stock,is_active').eq('store_id', store.id).eq('is_active', true)
    ]).then(([saleResult, productResult]) => { if (!saleResult.error) setSales(saleResult.data); if (!productResult.error) setProducts(productResult.data); setLoading(false); });
  }, [store]);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySales = sales.filter((sale) => new Date(sale.created_at) >= todayStart && sale.status === 'completed');
  const revenue = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const average = todaySales.length ? revenue / todaySales.length : 0;
  const lowStock = products.filter((product) => product.stock <= 10);
  const chart = useMemo(() => Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); const next = new Date(date); next.setDate(next.getDate() + 1); return { label: dayLabel(date), value: sales.filter((sale) => sale.status === 'completed' && new Date(sale.created_at) >= date && new Date(sale.created_at) < next).reduce((sum, sale) => sum + Number(sale.total), 0) }; }), [sales]);
  const maxChart = Math.max(...chart.map((item) => item.value), 1);

  return <section className="dashboard-page"><div className="dashboard-top"><div><span className="eyebrow">Business overview</span><h2>Good day, cashier</h2><p>Here’s what is happening at {store?.name || 'your store'}.</p></div><button onClick={onOpenRegister}>New sale <ArrowUpRight size={18}/></button></div>
    <div className="metric-grid"><Metric icon={Banknote} label="Today's revenue" value={money(revenue)} detail="Completed sales" tone="green"/><Metric icon={ShoppingBag} label="Orders today" value={todaySales.length} detail="Transactions" tone="blue"/><Metric icon={ReceiptText} label="Average order" value={money(average)} detail="Per transaction" tone="purple"/><Metric icon={AlertTriangle} label="Low stock" value={lowStock.length} detail="10 units or fewer" tone="orange"/></div>
    <div className="dashboard-grid"><article className="dashboard-card sales-chart"><div className="card-heading"><div><h3>Sales overview</h3><p>Revenue over the last 7 days</p></div><span>{money(chart.reduce((sum, item) => sum + item.value, 0))}</span></div><div className="bars">{chart.map((item) => <div className="bar-column" key={item.label}><div className="bar-track"><div style={{ height: `${Math.max(item.value ? 8 : 2, item.value / maxChart * 100)}%` }} title={money(item.value)}/></div><span>{item.label}</span></div>)}</div></article>
      <article className="dashboard-card"><div className="card-heading"><div><h3>Low-stock products</h3><p>Items that need attention</p></div><button onClick={onOpenProducts}>View all</button></div><div className="stock-list">{loading ? <p>Loading…</p> : !lowStock.length ? <div className="healthy-stock"><Package size={23}/><span>Inventory looks healthy</span></div> : lowStock.slice(0, 5).map((product) => <div key={product.id}><span><b>{product.name}</b><small>{product.sku}</small></span><strong className={product.stock === 0 ? 'out' : ''}>{product.stock} left</strong></div>)}</div></article>
      <article className="dashboard-card recent-sales"><div className="card-heading"><div><h3>Recent transactions</h3><p>Latest completed orders</p></div></div><div className="sales-table"><div className="table-row table-head"><span>Order</span><span>Time</span><span>Payment</span><span>Status</span><span>Total</span></div>{!sales.length ? <div className="no-sales">No sales recorded yet. Start a new sale to see activity.</div> : sales.slice(0, 6).map((sale) => <div className="table-row" key={sale.id}><b>#{sale.id}</b><span>{new Date(sale.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{sale.payments?.[0]?.kind || '—'}</span><span className={`status ${sale.status}`}>{sale.status}</span><strong>{money(sale.total)}</strong></div>)}</div></article>
    </div>
  </section>;
}

function Metric({ icon: Icon, label, value, detail, tone }) { return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
