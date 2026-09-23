alter table public.orders
  add column if not exists payment_deadline_at timestamptz,
  add column if not exists payment_proof_submitted_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists inventory_released_at timestamptz;

create index if not exists idx_orders_payment_expiry
  on public.orders (payment_deadline_at)
  where status = 'Pending'
    and payment_status = 'Unpaid'
    and payment_deadline_at is not null;

create or replace function public.set_order_payment_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, '')) = 'pending'
     and lower(coalesce(new.payment_status, '')) = 'unpaid'
  then
    new.payment_deadline_at := coalesce(
      new.payment_deadline_at,
      coalesce(new.created_at, now()) + interval '1 hour'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_order_payment_deadline on public.orders;

create trigger trg_set_order_payment_deadline
before insert or update of created_at, status, payment_status, payment_deadline_at
on public.orders
for each row
execute function public.set_order_payment_deadline();

update public.orders
set payment_deadline_at = coalesce(payment_deadline_at, created_at + interval '1 hour')
where lower(coalesce(status, '')) = 'pending'
  and lower(coalesce(payment_status, '')) = 'unpaid'
  and created_at is not null
  and payment_deadline_at is null;

update public.orders
set payment_proof_submitted_at = coalesce(payment_proof_submitted_at, updated_at, created_at, now())
where nullif(trim(coalesce(payment_proof_image, '')), '') is not null
  and payment_proof_submitted_at is null;

create or replace function public.expire_unpaid_orders(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item jsonb;
  v_product_id text;
  v_variant_id text;
  v_quantity integer;
  v_bundle jsonb;
  v_variants jsonb;
  v_variant_index integer;
  v_variant jsonb;
  v_updated_variants jsonb;
  v_total_stock integer;
  v_variant_stock integer;
  v_product record;
  v_expired jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_batch_limit integer := least(500, greatest(1, coalesce(p_limit, 100)));
begin
  for ord in
    select id, order_number, customer_id, tg_user_id, items
    from public.orders
    where lower(coalesce(status, '')) = 'pending'
      and lower(coalesce(payment_status, '')) = 'unpaid'
      and nullif(trim(coalesce(payment_proof_image, '')), '') is null
      and payment_deadline_at is not null
      and payment_deadline_at <= v_now
      and expired_at is null
      and inventory_released_at is null
    order by payment_deadline_at asc, created_at asc
    for update skip locked
    limit v_batch_limit
  loop
    if jsonb_typeof(ord.items) <> 'array' then
      raise exception 'Order % has invalid item payload and cannot release inventory', ord.order_number;
    end if;

    for item in select value from jsonb_array_elements(ord.items)
    loop
      v_product_id := coalesce(nullif(item->>'productId',''),nullif(item->>'product_id',''),nullif(item->>'id',''));
      v_variant_id := coalesce(nullif(item->>'variantId',''),nullif(item->>'variant_id',''),'default');
      v_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));

      if v_product_id is null then
        raise exception 'Order % contains an item without productId', ord.order_number;
      end if;

      select id, stock, bundle_config into v_product
      from public.products where id = v_product_id for update;

      if not found then
        raise exception 'Order % references missing product %; inventory was not released', ord.order_number, v_product_id;
      end if;

      v_bundle := case when jsonb_typeof(v_product.bundle_config) = 'object' then v_product.bundle_config else '{}'::jsonb end;
      v_variants := case when jsonb_typeof(v_bundle->'variants') = 'array' then v_bundle->'variants' else '[]'::jsonb end;
      v_variant_index := null;

      if jsonb_array_length(v_variants) > 0 then
        for i in 0 .. jsonb_array_length(v_variants)-1 loop
          v_variant := v_variants->i;
          if coalesce(v_variant->>'id','') = v_variant_id then
            v_variant_index := i; exit;
          end if;
        end loop;

        if v_variant_index is null then
          raise exception 'Order % references missing variant % on product %; inventory was not released', ord.order_number, v_variant_id, v_product_id;
        end if;

        v_variant_stock := greatest(0, coalesce((v_variants->v_variant_index->>'stock')::integer, 0));
        v_updated_variants := jsonb_set(v_variants, array[v_variant_index::text,'stock'], to_jsonb(v_variant_stock + v_quantity), true);

        select coalesce(sum(greatest(0, coalesce((value->>'stock')::integer,0))),0)
        into v_total_stock from jsonb_array_elements(v_updated_variants);

        update public.products
        set stock=v_total_stock,
            bundle_config=jsonb_set(v_bundle,'{variants}',v_updated_variants,true),
            updated_at=v_now
        where id=v_product.id;
      else
        update public.products
        set stock=greatest(0,coalesce(stock,0))+v_quantity, updated_at=v_now
        where id=v_product.id;
      end if;
    end loop;

    update public.orders
    set status='Expired',
        payment_status='Expired',
        review_status='Expired',
        requires_manual_review=false,
        expired_at=v_now,
        inventory_released_at=v_now,
        updated_at=v_now
    where id=ord.id;

    v_expired := v_expired || jsonb_build_array(
      jsonb_build_object('id',ord.id,'orderNumber',ord.order_number,'customerId',ord.customer_id,'chatId',ord.tg_user_id)
    );
  end loop;

  return jsonb_build_object('success',true,'expiredCount',jsonb_array_length(v_expired),'orders',v_expired);
end;
$$;

revoke execute on function public.set_order_payment_deadline() from public, anon, authenticated;
revoke execute on function public.expire_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders(integer) to service_role;
