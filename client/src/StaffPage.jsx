import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Crown, Plus, ShieldCheck, Trash2, UserRound, Users, X } from 'lucide-react';
import { supabase } from './lib/supabase';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

export default function StaffPage({ store, user }) {
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('cashier');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const currentMember = useMemo(() => staff.find((member) => member.user_id === user.id), [staff, user]);
  const canManage = ['owner', 'manager'].includes(currentMember?.role);

  const load = async () => {
    if (!store) return;
    const { data, error } = await supabase.rpc('get_store_staff', { target_store: store.id });
    if (error) setMessage(error.message); else setStaff(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const addStaff = async () => {
    setSaving(true); setMessage('');
    const { error } = await supabase.rpc('add_store_staff', { target_store: store.id, staff_email: email.trim(), staff_access: role });
    setSaving(false);
    if (error) return setMessage(error.message);
    setEmail(''); setRole('cashier'); setOpen(false); setMessage('Staff member added successfully.'); load();
  };
  const changeRole = async (member, nextRole) => {
    setMessage('');
    const { error } = await supabase.rpc('update_store_staff_role', { target_store: store.id, target_user: member.user_id, staff_access: nextRole });
    if (error) return setMessage(error.message);
    setMessage(`${member.full_name}'s role updated.`); load();
  };
  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.full_name} from this store?`)) return;
    const { error } = await supabase.rpc('remove_store_staff', { target_store: store.id, target_user: member.user_id });
    if (error) return setMessage(error.message);
    setMessage('Staff member removed.'); load();
  };
  const roleIcon = (memberRole) => memberRole === 'owner' ? <Crown size={16}/> : memberRole === 'manager' ? <ShieldCheck size={16}/> : <UserRound size={16}/>;

  return <section className="management-page staff-page"><div className="management-head"><div><span className="eyebrow">Team access</span><h2>Staff</h2><p>Manage roles, access, and cashier performance.</p></div>{canManage && <button onClick={() => { setMessage(''); setOpen(true); }}><Plus size={17}/> Add staff</button>}</div>
    <div className="staff-summary"><div><Users/><span>Total team<b>{staff.length}</b></span></div><div><ShieldCheck/><span>Managers<b>{staff.filter((item) => item.role === 'manager').length}</b></span></div><div><BriefcaseBusiness/><span>Team sales<b>{money(staff.reduce((sum, item) => sum + Number(item.sales_total), 0))}</b></span></div></div>
    {message && <p className={message.includes('successfully') || message.includes('updated') || message.includes('removed') ? 'management-success' : 'management-error'}>{message}</p>}
    <div className="staff-table"><div className="staff-row staff-head"><span>Team member</span><span>Role</span><span>Orders</span><span>Sales</span><span>Joined</span><span>Actions</span></div>{staff.map((member) => { const editable = canManage && member.role !== 'owner' && member.user_id !== user.id && (currentMember?.role === 'owner' || member.role === 'cashier'); return <div className="staff-row" key={member.user_id}><div className="staff-person"><span>{member.full_name.slice(0, 2).toUpperCase()}</span><div><b>{member.full_name}</b><small>{member.email}{member.user_id === user.id ? ' · You' : ''}</small></div></div><div className={`role-badge ${member.role}`}>{roleIcon(member.role)}<span>{member.role}</span></div><b>{member.sales_count}</b><b>{money(member.sales_total)}</b><span>{new Date(member.joined_at).toLocaleDateString()}</span><div className="staff-actions">{editable && <><select value={member.role} onChange={(e) => changeRole(member, e.target.value)}><option value="cashier">Cashier</option>{currentMember?.role === 'owner' && <option value="manager">Manager</option>}</select><button title="Remove staff" onClick={() => remove(member)}><Trash2 size={15}/></button></>}</div></div>; })}</div>
    {!canManage && <div className="permission-note"><ShieldCheck size={18}/><span>You can view the team. Only owners and managers can change staff access.</span></div>}
    {open && <div className="modal-backdrop"><div className="manage-modal compact"><div className="manage-modal-head"><div><span className="eyebrow">Store access</span><h3>Add staff member</h3></div><button onClick={() => setOpen(false)}><X size={18}/></button></div><p className="invite-help">Enter the email of an existing Counterly account. New staff should sign up first, then you can add them here.</p><label className="full-label">Account email<input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@example.com"/></label><label className="full-label">Access role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="cashier">Cashier — register and sales access</option>{currentMember?.role === 'owner' && <option value="manager">Manager — manage store operations</option>}</select></label>{message && <p className="management-error">{message}</p>}<button className="save-button" disabled={saving || !email.includes('@')} onClick={addStaff}>{saving ? 'Adding…' : 'Add to store'}</button></div></div>}
  </section>;
}
