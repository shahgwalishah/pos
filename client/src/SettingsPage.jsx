import { useEffect, useState } from 'react';
import { Save, Settings2, Store } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function SettingsPage({ store, onSaved }) {
  const [form, setForm] = useState({ name: '', currency_code: 'PKR', tax_rate: 5 });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (store) setForm({ name: store.name || '', currency_code: store.currency_code || 'PKR', tax_rate: Number(store.tax_rate ?? .05) * 100 }); }, [store]);
  const save = async () => {
    setSaving(true); setMessage('');
    const values = { name: form.name.trim(), currency_code: form.currency_code, tax_rate: Number(form.tax_rate) / 100, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('stores').update(values).eq('id', store.id).select().single();
    setSaving(false);
    if (error) return setMessage(error.message);
    setMessage('Store settings saved.'); onSaved(data);
  };
  return <section className="module-page settings-page"><div className="module-heading"><span className="eyebrow">Configuration</span><h2>Settings</h2><p>Update store identity, currency, and checkout tax.</p></div><div className="settings-card"><div className="settings-title"><div><Store size={22}/></div><span><h3>Store details</h3><p>Used on the POS, sales and receipts.</p></span></div><div className="settings-form"><label>Store name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label><label>Currency<select value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value })}><option value="PKR">PKR — Pakistani Rupee</option><option value="USD">USD — US Dollar</option><option value="GBP">GBP — British Pound</option></select></label><label>Tax rate<div className="tax-field"><input type="number" min="0" max="100" step="0.1" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}/><span>%</span></div></label><div className="tax-preview"><Settings2 size={18}/><span>Checkout will calculate <b>{Number(form.tax_rate || 0)}%</b> tax automatically.</span></div></div>{message && <p className={message.includes('saved') ? 'save-success' : 'form-error'}>{message}</p>}<button className="save-settings" disabled={saving || form.name.trim().length < 2} onClick={save}><Save size={17}/>{saving ? 'Saving…' : 'Save settings'}</button></div></section>;
}
