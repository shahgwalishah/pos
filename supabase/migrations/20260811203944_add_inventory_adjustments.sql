create table public.inventory_adjustments (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id bigint not null references public.products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  reason varchar(120) not null check (char_length(trim(reason)) >= 2),
  created_at timestamptz not null default now()
);

create index inventory_adjustments_store_created_idx on public.inventory_adjustments (store_id, created_at desc);
create index inventory_adjustments_product_created_idx on public.inventory_adjustments (product_id, created_at desc);
create index inventory_adjustments_user_id_idx on public.inventory_adjustments (user_id);

alter table public.inventory_adjustments enable row level security;
create policy inventory_adjustments_select_store on public.inventory_adjustments for select to authenticated
  using (private.is_store_member(store_id, (select auth.uid())));
grant select on public.inventory_adjustments to authenticated;
grant usage, select on sequence public.inventory_adjustments_id_seq to authenticated;

create or replace function public.adjust_product_stock(target_product bigint, quantity_delta integer, adjustment_reason text)
returns public.inventory_adjustments
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product_row public.products%rowtype;
  adjustment public.inventory_adjustments%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if quantity_delta = 0 then raise exception 'Quantity change cannot be zero'; end if;
  if char_length(trim(adjustment_reason)) < 2 then raise exception 'Adjustment reason is required'; end if;
  select * into product_row from public.products where id = target_product for update;
  if not found or not private.can_manage_store(product_row.store_id, current_user_id) then raise exception 'Product management access denied'; end if;
  if product_row.stock + quantity_delta < 0 then raise exception 'Stock cannot become negative'; end if;
  update public.products set stock = stock + quantity_delta, updated_at = now() where id = target_product;
  insert into public.inventory_adjustments (store_id, product_id, user_id, quantity_change, stock_before, stock_after, reason)
  values (product_row.store_id, target_product, current_user_id, quantity_delta, product_row.stock, product_row.stock + quantity_delta, trim(adjustment_reason))
  returning * into adjustment;
  return adjustment;
end; $$;

revoke execute on function public.adjust_product_stock(bigint, integer, text) from public, anon;
grant execute on function public.adjust_product_stock(bigint, integer, text) to authenticated;
