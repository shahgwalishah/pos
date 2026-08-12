create table public.sale_reversals (
  id bigint generated always as identity primary key,
  sale_id bigint not null unique references public.sales(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.sale_status not null check (status in ('refunded', 'voided')),
  amount numeric(12,2) not null check (amount >= 0),
  reason varchar(160) not null check (char_length(trim(reason)) >= 2),
  created_at timestamptz not null default now()
);
create index sale_reversals_store_created_idx on public.sale_reversals (store_id, created_at desc);
create index sale_reversals_user_id_idx on public.sale_reversals (user_id);
alter table public.sale_reversals enable row level security;
create policy sale_reversals_select_store on public.sale_reversals for select to authenticated using (private.is_store_member(store_id, (select auth.uid())));
grant select on public.sale_reversals to authenticated;
grant usage, select on sequence public.sale_reversals_id_seq to authenticated;

create or replace function public.reverse_sale(target_sale bigint, reversal_status public.sale_status, reversal_reason text)
returns public.sales language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); sale_row public.sales%rowtype; item record;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if reversal_status not in ('refunded', 'voided') then raise exception 'Invalid reversal type'; end if;
  if char_length(trim(reversal_reason)) < 2 then raise exception 'Reason is required'; end if;
  select * into sale_row from public.sales where id = target_sale for update;
  if not found or not private.can_manage_store(sale_row.store_id, current_user_id) then raise exception 'Sale management access denied'; end if;
  if sale_row.status <> 'completed' then raise exception 'Only completed sales can be reversed'; end if;
  for item in select product_id, sum(quantity)::integer quantity from public.sale_items where sale_id = target_sale and product_id is not null group by product_id loop
    update public.products set stock = stock + item.quantity, updated_at = now() where id = item.product_id;
    insert into public.inventory_adjustments (store_id, product_id, user_id, quantity_change, stock_before, stock_after, reason)
      select sale_row.store_id, p.id, current_user_id, item.quantity, p.stock - item.quantity, p.stock, initcap(reversal_status::text) || ' sale #' || target_sale from public.products p where p.id = item.product_id;
  end loop;
  update public.sales set status = reversal_status where id = target_sale returning * into sale_row;
  insert into public.sale_reversals (sale_id, store_id, user_id, status, amount, reason) values (target_sale, sale_row.store_id, current_user_id, reversal_status, sale_row.total, trim(reversal_reason));
  return sale_row;
end; $$;
revoke execute on function public.reverse_sale(bigint, public.sale_status, text) from public, anon;
grant execute on function public.reverse_sale(bigint, public.sale_status, text) to authenticated;
