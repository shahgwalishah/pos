create unique index payments_reference_unique_idx on public.payments (reference) where reference is not null;

drop function if exists public.checkout_sale(uuid, jsonb, numeric, public.payment_kind, numeric, text);

create function public.checkout_sale(
  target_store uuid,
  cart_items jsonb,
  discount_amount numeric default 0,
  payment_type public.payment_kind default 'cash',
  tendered_amount numeric default null,
  sale_note text default null,
  payment_reference text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_sale_id bigint;
  existing_sale public.sales%rowtype;
  existing_payment public.payments%rowtype;
  computed_subtotal numeric(12,2);
  computed_tax numeric(12,2);
  computed_total numeric(12,2);
  store_tax_rate numeric(5,4);
  item jsonb;
  product_row public.products%rowtype;
begin
  if current_user_id is null or not private.is_store_member(target_store, current_user_id) then raise exception 'Store access denied'; end if;
  if payment_reference is not null then
    select p.* into existing_payment from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.reference = payment_reference and s.store_id = target_store and s.cashier_id = current_user_id;
    if found then
      select * into existing_sale from public.sales where id = existing_payment.sale_id;
      return jsonb_build_object('id', existing_sale.id, 'subtotal', existing_sale.subtotal, 'tax', existing_sale.tax, 'discount', existing_sale.discount, 'total', existing_sale.total, 'paymentMethod', initcap(existing_payment.kind::text), 'change', existing_payment.change_due);
    end if;
  end if;
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
  insert into public.payments (sale_id, kind, amount, tendered, reference)
    values (new_sale_id, payment_type, computed_total, case when payment_type = 'cash' then tendered_amount else null end, nullif(trim(payment_reference), ''));
  return jsonb_build_object('id', new_sale_id, 'subtotal', computed_subtotal, 'tax', computed_tax, 'discount', least(discount_amount, computed_subtotal + computed_tax), 'total', computed_total, 'paymentMethod', initcap(payment_type::text), 'change', greatest(coalesce(tendered_amount, computed_total) - computed_total, 0));
end; $$;

revoke execute on function public.checkout_sale(uuid, jsonb, numeric, public.payment_kind, numeric, text, text) from public, anon;
grant execute on function public.checkout_sale(uuid, jsonb, numeric, public.payment_kind, numeric, text, text) to authenticated;
