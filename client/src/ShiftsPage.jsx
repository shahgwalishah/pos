import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, LockKeyhole, Play } from 'lucide-react';
import { supabase } from './lib/supabase';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

export default function ShiftsPage({ store, user, activeShift, onShiftChange }) {
  const [shifts, setShifts] = useState([]);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!store) return;
    const { data, error: loadError } = await supabase.from('register_shifts').select('*').eq('store_id', store.id).order('opened_at', { ascending: false }).limit(30);
    if (loadError) setError(loadError.message); else setShifts(data || []);
  };
  useEffect(() => { load(); }, [store, activeShift?.id, activeShift?.status]);

  const shiftCashSales = useMemo(() => {
    if (!activeShift) return 0;
    return Number(activeShift.liveCashSales || 0);
  }, [activeShift]);
  const expected = Number(activeShift?.opening_cash || 0) + shiftCashSales;

  const openShift = async () => {
    setSaving(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('open_register_shift', { target_store: store.id, opening_amount: Number(openingCash || 0), shift_note: note || null });
    setSaving(false);
    if (rpcError) return setError(rpcError.message);
    setNote(''); onShiftChange(data); load();
  };
  const closeShift = async () => {
    setSaving(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('close_register_shift', { target_shift: activeShift.id, closing_amount: Number(closingCash || 0), shift_note: note || null });
    setSaving(false);
    if (rpcError) return setError(rpcError.message);
    setClosingCash(''); setNote(''); onShiftChange(null); load();
  };

  return <section className="module-page shifts-page">
    <div className="module-heading"><div><span className="eyebrow">Cash register</span><h2>Shifts</h2><p>Open the till, track cash sales, and reconcile at closing.</p></div></div>
    {!activeShift ? <div className="shift-open-card"><div className="shift-icon"><Play size={24}/></div><div><h3>Open a new shift</h3><p>Enter the starting cash available in the drawer.</p></div><label>Opening cash <div className="money-field"><span>Rs.</span><input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}/></div></label><label>Opening note <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note"/></label>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={saving} onClick={openShift}><Play size={17}/>{saving ? 'Opening…' : 'Open shift'}</button></div>
    : <div className="current-shift-card"><div className="current-shift-head"><div><span className="status-pill"><span/> Open now</span><h3>Shift #{activeShift.id}</h3><p>Opened {new Date(activeShift.opened_at).toLocaleString()}</p></div><Clock3 size={28}/></div><div className="shift-metrics"><div><span>Opening cash</span><b>{money(activeShift.opening_cash)}</b></div><div><span>Cash sales</span><b>{money(shiftCashSales)}</b></div><div><span>Expected drawer</span><b>{money(expected)}</b></div></div><div className="close-shift"><label>Counted closing cash <div className="money-field"><span>Rs.</span><input type="number" min="0" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder={String(expected)}/></div></label><label>Closing note <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional handover note"/></label>{closingCash !== '' && <div className={`difference ${Number(closingCash) - expected === 0 ? 'balanced' : ''}`}><span>Difference</span><b>{money(Number(closingCash) - expected)}</b></div>}{error && <p className="form-error">{error}</p>}<button className="close-action" disabled={saving || closingCash === ''} onClick={closeShift}><LockKeyhole size={17}/>{saving ? 'Closing…' : 'Close & reconcile shift'}</button></div></div>}
    <div className="history-card"><div className="history-title"><h3>Shift history</h3><span>{shifts.length} records</span></div><div className="shift-table"><div className="shift-row shift-table-head"><span>Shift</span><span>Opened</span><span>Status</span><span>Opening</span><span>Expected</span><span>Counted</span><span>Difference</span></div>{shifts.map((shift) => <div className="shift-row" key={shift.id}><b>#{shift.id}</b><span>{new Date(shift.opened_at).toLocaleString()}</span><span className={`row-status ${shift.status}`}>{shift.status === 'open' ? <Clock3 size={13}/> : <CheckCircle2 size={13}/>} {shift.status}</span><span>{money(shift.opening_cash)}</span><span>{shift.expected_cash == null ? '—' : money(shift.expected_cash)}</span><span>{shift.closing_cash == null ? '—' : money(shift.closing_cash)}</span><b className={Number(shift.cash_difference) === 0 ? 'balanced-text' : 'difference-text'}>{shift.cash_difference == null ? '—' : money(shift.cash_difference)}</b></div>)}</div>{!shifts.length && <div className="empty-history"><Banknote size={28}/><p>No shifts recorded yet.</p></div>}</div>
  </section>;
}
