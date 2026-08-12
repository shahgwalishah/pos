import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Package, ReceiptText, TrendingUp } from 'lucide-react';
import { supabase } from './lib/supabase';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

export default function ReportsPage({ store }) {
  const [range, setRange] = useState('7');
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!store) return;
    const from = new Date(); from.setDate(from.getDate() - Number(range)); from.setHours(0, 0, 0, 0);
    setLoading(true);
    Promise.all([
      supabase.from('sales').select('id,total,tax,discount,status,created_at,payments(kind,amount)').eq('store_id', store.id).gte('created_at', from.toISOString()).order('created_at'),
      supabase.from('sale_items').select('product_name,quantity,line_total,sales!inner(store_id,status,created_at)').eq('sales.store_id', store.id).eq('sales.status', 'completed').gte('sales.created_at', from.toISOString())
    ]).then(([saleResult, itemResult]) => { setSales((saleResult.data || []).filter((sale) => sale.status === 'completed')); setItems(itemResult.data || []); setLoading(false); });
  }, [store, range]);
  const stats = useMemo(() => {
    const revenue = sales.reduce((n, sale) => n + Number(sale.total), 0);
    const payment = sales.flatMap((sale) => sale.payments || []).reduce((out, row) => ({ ...out, [row.kind]: (out[row.kind] || 0) + Number(row.amount) }), {});
    const products = Object.values(items.reduce((out, row) => { const item = out[row.product_name] || { name: row.product_name, quantity: 0, revenue: 0 }; item.quantity += Number(row.quantity); item.revenue += Number(row.line_total); out[row.product_name] = item; return out; }, {})).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const days = Object.values(sales.reduce((out, sale) => { const key = new Date(sale.created_at).toLocaleDateString(); const day = out[key] || { date: key, total: 0, orders: 0 }; day.total += Number(sale.total); day.orders++; out[key] = day; return out; }, {}));
    return { revenue, payment, products, days, items: items.reduce((n, item) => n + Number(item.quantity), 0) };
  }, [sales, items]);
  const maxDay = Math.max(...stats.days.map((day) => day.total), 1);
  return <section className="module-page report-page"><div className="module-heading split-heading"><div><span className="eyebrow">Business insights</span><h2>Reports</h2><p>Sales performance and payment summary.</p></div><select value={range} onChange={(e) => setRange(e.target.value)}><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></div>
    <div className="report-stats"><div><TrendingUp/><span>Net sales</span><b>{money(stats.revenue)}</b></div><div><ReceiptText/><span>Completed orders</span><b>{sales.length}</b></div><div><Package/><span>Items sold</span><b>{stats.items}</b></div><div><TrendingUp/><span>Average order</span><b>{money(sales.length ? stats.revenue / sales.length : 0)}</b></div></div>
    <div className="report-grid"><div className="report-card"><h3>Daily sales</h3>{loading ? <p>Loading…</p> : stats.days.length ? <div className="daily-bars">{stats.days.map((day) => <div key={day.date}><span>{day.date}</span><div><i style={{ width: `${Math.max(5, day.total / maxDay * 100)}%` }}/></div><b>{money(day.total)}</b></div>)}</div> : <p className="muted">No completed sales in this period.</p>}</div><div className="report-card"><h3>Payment methods</h3><div className="payment-breakdown"><div><Banknote/><span>Cash</span><b>{money(stats.payment.cash)}</b></div><div><CreditCard/><span>Card (demo)</span><b>{money(stats.payment.card)}</b></div></div></div><div className="report-card wide"><h3>Top products</h3>{stats.products.map((product, index) => <div className="top-product" key={product.name}><span>{index + 1}</span><b>{product.name}</b><small>{product.quantity} sold</small><strong>{money(product.revenue)}</strong></div>)}{!stats.products.length && <p className="muted">Product performance will appear after sales.</p>}</div></div>
  </section>;
}
