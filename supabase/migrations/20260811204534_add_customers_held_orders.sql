create table public.customers (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  email text,
  phone text,
  notes varchar(250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create unique index customers_store_email_unique on public.customers (store_id, lower(email)) where email is not null;
create index customers_store_name_idx on public.customers (store_id, name);

create table public.held_orders (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  customer_id bigint references public.customers(id) on delete set null,
  label varchar(80) not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  note varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index held_orders_store_created_idx on public.held_orders (store_id, created_at desc);
create index held_orders_customer_id_idx on public.held_orders (customer_id);
create index held_orders_created_by_idx on public.held_orders (created_by);

alter table public.sales add column customer_id bigint references public.customers(id) on delete set null;
create index sales_customer_id_idx on public.sales (customer_id);

alter table public.customers enable row level security;
alter table public.held_orders enable row level security;
create policy customers_select_store on public.customers for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
create policy customers_insert_store on public.customers for insert to authenticated with check (private.is_store_member(store_id, (select auth.uid())));
create policy customers_update_store on public.customers for update to authenticated using (private.is_store_member(store_id, (select auth.uid()))) with check (private.is_store_member(store_id, (select auth.uid())));
create policy customers_delete_manager on public.customers for delete to authenticated using (private.can_manage_store(store_id, (select auth.uid())));
create policy held_orders_select_store on public.held_orders for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
create policy held_orders_insert_store on public.held_orders for insert to authenticated with check (private.is_store_member(store_id, (select auth.uid())) and created_by = (select auth.uid()));
create policy held_orders_update_store on public.held_orders for update to authenticated using (private.is_store_member(store_id, (select auth.uid()))) with check (private.is_store_member(store_id, (select auth.uid())));
create policy held_orders_delete_store on public.held_orders for delete to authenticated using (private.is_store_member(store_id, (select auth.uid())));
grant select, insert, update, delete on public.customers, public.held_orders to authenticated;
grant usage, select on sequence public.customers_id_seq, public.held_orders_id_seq to authenticated;

create or replace function public.link_sale_customer(target_sale bigint, target_customer bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); sale_store uuid; customer_store uuid;
begin
  select store_id into sale_store from public.sales where id = target_sale;
  select store_id into customer_store from public.customers where id = target_customer;
  if current_user_id is null or sale_store is null or sale_store <> customer_store or not private.is_store_member(sale_store, current_user_id) then raise exception 'Customer link access denied'; end if;
  update public.sales set customer_id = target_customer where id = target_sale;
end; $$;
revoke execute on function public.link_sale_customer(bigint, bigint) from public, anon;
grant execute on function public.link_sale_customer(bigint, bigint) to authenticated;
