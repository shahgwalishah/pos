import { BarChart3, Clock3, LayoutDashboard, Package, ReceiptText, Settings, ShoppingCart, UserCog, Users, Warehouse } from 'lucide-react';

const items = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['register', 'Register', ShoppingCart], ['products', 'Products', Package],
  ['inventory', 'Inventory', Warehouse], ['sales', 'Sales', ReceiptText], ['customers', 'Customers', Users],
  ['staff', 'Staff', UserCog], ['shifts', 'Shifts', Clock3], ['reports', 'Reports', BarChart3], ['settings', 'Settings', Settings]
];

export default function Sidebar({ active, onChange }) {
  return <nav className="sidebar"><div className="sidebar-items">{items.map(([id, label, Icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)} title={label}><Icon size={19}/><span>{label}</span></button>)}</div><div className="sidebar-version">Counterly<br/><span>v1.0</span></div></nav>;
}
