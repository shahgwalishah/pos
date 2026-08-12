create schema if not exists private;

create type public.staff_role as enum ('owner', 'manager', 'cashier');
create type public.sale_status as enum ('completed', 'refunded', 'voided');
create type public.payment_kind as enum ('cash', 'card', 'other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100),
  currency_code char(3) not null default 'PKR',
  tax_rate numeric(5,4) not null default 0.05 check (tax_rate between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.staff_role not null default 'cashier',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table public.categories (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.products (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id bigint references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  sku text not null check (char_length(sku) between 1 and 50),
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  color varchar(7) not null default '#2563eb' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create table public.sales (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  cashier_id uuid not null references auth.users(id) on delete restrict,
  status public.sale_status not null default 'completed',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  tax numeric(12,2) not null check (tax >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  note varchar(120),
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales(id) on delete restrict,
  product_id bigint references public.products(id) on delete set null,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored
);

create table public.payments (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales(id) on delete restrict,
  kind public.payment_kind not null,
  amount numeric(12,2) not null check (amount >= 0),
  tendered numeric(12,2) check (tendered is null or tendered >= amount),
  change_due numeric(12,2) generated always as (greatest(coalesce(tendered, amount) - amount, 0)) stored,
  reference text,
  created_at timestamptz not null default now()
);

create index store_members_user_id_idx on public.store_members (user_id, store_id);
create index stores_owner_id_idx on public.stores (owner_id);
create index categories_store_sort_idx on public.categories (store_id, sort_order, name);
create index products_store_active_name_idx on public.products (store_id, name) where is_active;
create index products_store_category_idx on public.products (store_id, category_id) where is_active;
create index products_category_id_idx on public.products (category_id);
create index products_low_stock_idx on public.products (store_id, stock) where is_active and stock <= 10;
create index sales_store_created_idx on public.sales (store_id, created_at desc);
create index sales_cashier_created_idx on public.sales (cashier_id, created_at desc);
create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_product_id_idx on public.sale_items (product_id);
create index payments_sale_id_idx on public.payments (sale_id);

create or replace function private.is_store_member(target_store uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.store_members where store_id = target_store and user_id = target_user) $$;

create or replace function private.can_manage_store(target_store uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.store_members where store_id = target_store and user_id = target_user and role in ('owner', 'manager')) $$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)));
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.create_store(store_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_store_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(store_name)) < 2 then raise exception 'Store name is required'; end if;
  insert into public.stores (owner_id, name) values (current_user_id, trim(store_name)) returning id into new_store_id;
  insert into public.store_members (store_id, user_id, role) values (new_store_id, current_user_id, 'owner');
  return new_store_id;
end; $$;

create or replace function public.checkout_sale(
  target_store uuid,
  cart_items jsonb,
  discount_amount numeric default 0,
  payment_type public.payment_kind default 'cash',
  tendered_amount numeric default null,
  sale_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_sale_id bigint;
  computed_subtotal numeric(12,2);
  computed_tax numeric(12,2);
  computed_total numeric(12,2);
  store_tax_rate numeric(5,4);
  item jsonb;
  product_row public.products%rowtype;
begin
  if current_user_id is null or not private.is_store_member(target_store, current_user_id) then raise exception 'Store access denied'; end if;
  if cart_items is null or jsonb_typeof(cart_items) <> 'array' or jsonb_array_length(cart_items) = 0 then raise exception 'Cart cannot be empty'; end if;
  if discount_amount < 0 then raise exception 'Discount cannot be negative'; end if;
  select tax_rate into store_tax_rate from public.stores where id = target_store;
  create temporary table if not exists pg_temp.checkout_lines (product_id bigint, quantity integer, name text, sku text, unit_price numeric(12,2)) on commit drop;
  truncate pg_temp.checkout_lines;
  for item in select * from jsonb_array_elements(cart_items) loop
    if coalesce((item ->> 'quantity')::integer, 0) <= 0 then raise exception 'Invalid quantity'; end if;
    select * into product_row from public.products
      where id = (item ->> 'productId')::bigint and store_id = target_store and is_active for update;
    if not found then raise exception 'Product not found'; end if;
    if product_row.stock < (item ->> 'quantity')::integer then raise exception '% has only % items in stock', product_row.name, product_row.stock; end if;
    insert into pg_temp.checkout_lines values (product_row.id, (item ->> 'quantity')::integer, product_row.name, product_row.sku, product_row.price);
  end loop;
  select coalesce(sum(quantity * unit_price), 0) into computed_subtotal from pg_temp.checkout_lines;
  computed_tax := round(computed_subtotal * store_tax_rate, 2);
  computed_total := greatest(computed_subtotal + computed_tax - least(discount_amount, computed_subtotal + computed_tax), 0);
  if payment_type = 'cash' and coalesce(tendered_amount, 0) < computed_total then raise exception 'Cash received is less than total'; end if;
  insert into public.sales (store_id, cashier_id, subtotal, tax, discount, total, note)
  values (target_store, current_user_id, computed_subtotal, computed_tax, least(discount_amount, computed_subtotal + computed_tax), computed_total, nullif(trim(sale_note), ''))
  returning id into new_sale_id;
  insert into public.sale_items (sale_id, product_id, product_name, sku, quantity, unit_price)
    select new_sale_id, product_id, name, sku, quantity, unit_price from pg_temp.checkout_lines;
  update public.products p set stock = p.stock - l.quantity, updated_at = now()
    from pg_temp.checkout_lines l where p.id = l.product_id;
  insert into public.payments (sale_id, kind, amount, tendered)
    values (new_sale_id, payment_type, computed_total, case when payment_type = 'cash' then tendered_amount else null end);
  return jsonb_build_object('id', new_sale_id, 'subtotal', computed_subtotal, 'tax', computed_tax, 'discount', least(discount_amount, computed_subtotal + computed_tax), 'total', computed_total, 'paymentMethod', initcap(payment_type::text), 'change', greatest(coalesce(tendered_amount, computed_total) - computed_total, 0));
end; $$;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy stores_select_member on public.stores for select to authenticated using (private.is_store_member(id, (select auth.uid())));
create policy stores_update_manager on public.stores for update to authenticated using (private.can_manage_store(id, (select auth.uid()))) with check (private.can_manage_store(id, (select auth.uid())));
create policy members_select_store on public.store_members for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
create policy members_insert_store on public.store_members for insert to authenticated with check (private.can_manage_store(store_id, (select auth.uid())));
create policy members_update_store on public.store_members for update to authenticated using (private.can_manage_store(store_id, (select auth.uid()))) with check (private.can_manage_store(store_id, (select auth.uid())));
create policy members_delete_store on public.store_members for delete to authenticated using (private.can_manage_store(store_id, (select auth.uid())));
create policy categories_select_store on public.categories for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
create policy categories_insert_store on public.categories for insert to authenticated with check (private.can_manage_store(store_id, (select auth.uid())));
create policy categories_update_store on public.categories for update to authenticated using (private.can_manage_store(store_id, (select auth.uid()))) with check (private.can_manage_store(store_id, (select auth.uid())));
create policy categories_delete_store on public.categories for delete to authenticated using (private.can_manage_store(store_id, (select auth.uid())));
create policy products_select_store on public.products for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
create policy products_insert_store on public.products for insert to authenticated with check (private.can_manage_store(store_id, (select auth.uid())));
create policy products_update_store on public.products for update to authenticated using (private.can_manage_store(store_id, (select auth.uid()))) with check (private.can_manage_store(store_id, (select auth.uid())));
create policy products_delete_store on public.products for delete to authenticated using (private.can_manage_store(store_id, (select auth.uid())));
create policy sales_select_store on public.sales for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
create policy sale_items_select_store on public.sale_items for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id and private.is_store_member(s.store_id, (select auth.uid()))));
create policy payments_select_store on public.payments for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id and private.is_store_member(s.store_id, (select auth.uid()))));

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function private.is_store_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_manage_store(uuid, uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_store_member(uuid, uuid) to authenticated;
grant execute on function private.can_manage_store(uuid, uuid) to authenticated;
revoke execute on function public.create_store(text) from public, anon;
revoke execute on function public.checkout_sale(uuid, jsonb, numeric, public.payment_kind, numeric, text) from public, anon;
grant execute on function public.create_store(text) to authenticated;
grant execute on function public.checkout_sale(uuid, jsonb, numeric, public.payment_kind, numeric, text) to authenticated;
