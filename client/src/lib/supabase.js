import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vrrodecylfihoqygeiab.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7DOaxnrTU1esznX-DyvHFg_sXCt7DMY';

export const supabase = createClient(supabaseUrl, supabaseKey);

const demoProducts = [
  ['Cappuccino', 'Drinks', 'DRK-001', 480, 30, '#b7793f'], ['Iced Latte', 'Drinks', 'DRK-002', 550, 24, '#3b82f6'],
  ['Mint Lemonade', 'Drinks', 'DRK-003', 390, 18, '#22c55e'], ['Club Sandwich', 'Food', 'FOD-001', 850, 16, '#f59e0b'],
  ['Chicken Burger', 'Food', 'FOD-002', 790, 12, '#ef4444'], ['Alfredo Pasta', 'Food', 'FOD-003', 1050, 9, '#8b5cf6'],
  ['Chocolate Cake', 'Desserts', 'DES-001', 520, 14, '#7c3f20'], ['Cheesecake', 'Desserts', 'DES-002', 620, 7, '#ec4899'],
  ['French Fries', 'Sides', 'SID-001', 350, 26, '#eab308'], ['Garlic Bread', 'Sides', 'SID-002', 320, 20, '#f97316']
];

export async function getOrCreateStore() {
  const { data: membership, error: membershipError } = await supabase.from('store_members').select('store_id, stores(name,currency_code,tax_rate)').limit(1).maybeSingle();
  if (membershipError) throw membershipError;
  if (membership) return { id: membership.store_id, name: membership.stores?.name || 'Counterly', currency_code: membership.stores?.currency_code || 'PKR', tax_rate: Number(membership.stores?.tax_rate ?? .05) };
  const { data: storeId, error: storeError } = await supabase.rpc('create_store', { store_name: 'Counterly Demo' });
  if (storeError) throw storeError;
  const names = ['Drinks', 'Food', 'Desserts', 'Sides'];
  const { data: categories, error: categoryError } = await supabase.from('categories').insert(names.map((name, index) => ({ store_id: storeId, name, sort_order: index }))).select();
  if (categoryError) throw categoryError;
  const categoryIds = Object.fromEntries(categories.map((item) => [item.name, item.id]));
  const { error: productError } = await supabase.from('products').insert(demoProducts.map(([name, category, sku, price, stock, color]) => ({ store_id: storeId, category_id: categoryIds[category], name, sku, price, stock, color })));
  if (productError) throw productError;
  return { id: storeId, name: 'Counterly Demo', currency_code: 'PKR', tax_rate: .05 };
}
