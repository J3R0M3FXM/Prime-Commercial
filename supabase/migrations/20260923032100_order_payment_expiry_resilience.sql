alter table public.orders
  add column if not exists inventory_release_error text,
  add column if not exists store_credits_released_at timestamptz;

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
  v_failed jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_batch_limit integer := least(500, greatest(1, coalesce(p_limit, 100)));
  v_error text;
begin
  for ord in
    select id, order_number, customer_id, tg_user_id, items, store_credits_used, store_credits_released_at
    from public.orders
    where lower(coalesce(status,''))='pending'
      and lower(coalesce(payment_status,''))='unpaid'
      and nullif(trim(coalesce(payment_proof_image,'')),'') is null
      and payment_deadline_at is not null
      and payment_deadline_at <= v_now
      and expired_at is null
    order by payment_deadline_at asc, created_at asc
    for update skip locked
    limit v_batch_limit
  loop
    begin
      if jsonb_typeof(ord.items) <> 'array' then
        raise exception 'Order % has invalid item payload and cannot release inventory', ord.order_number;
      end if;

      for item in select value from jsonb_array_elements(ord.items) loop
        v_product_id := coalesce(nullif(item->>'productId',''),nullif(item->>'product_id',''),nullif(item->>'id',''));
        v_variant_id := coalesce(nullif(item->>'variantId',''),nullif(item->>'variant_id',''),'default');
        v_quantity := greatest(1, coalesce((item->>'quantity')::integer,1));

        if v_product_id is null then
          raise exception 'Order % contains an item without productId', ord.order_number;
        end if;

        select id,stock,bundle_config into v_product
        from public.products where id=v_product_id for update;

        if not found then
          raise exception 'Order % references missing product %; inventory was not released', ord.order_number,v_product_id;
        end if;

        v_bundle := case when jsonb_typeof(v_product.bundle_config)='object' then v_product.bundle_config else '{}'::jsonb end;
        v_variants := case when jsonb_typeof(v_bundle->'variants')='array' then v_bundle->'variants' else '[]'::jsonb end;
        v_variant_index := null;

        if jsonb_array_length(v_variants)>0 then
          for i in 0..jsonb_array_length(v_variants)-1 loop
            v_variant := v_variants->i;
            if coalesce(v_variant->>'id','')=v_variant_id then
              v_variant_index:=i; exit;
            end if;
          end loop;

          if v_variant_index is null then
            raise exception 'Order % references missing variant % on product %; inventory was not released', ord.order_number,v_variant_id,v_product_id;
          end if;

          v_variant_stock := greatest(0,coalesce((v_variants->v_variant_index->>'stock')::integer,0));
          v_updated_variants := jsonb_set(v_variants,array[v_variant_index::text,'stock'],to_jsonb(v_variant_stock+v_quantity),true);

          select coalesce(sum(greatest(0,coalesce((value->>'stock')::integer,0))),0)
          into v_total_stock from jsonb_array_elements(v_updated_variants);

          update public.products
          set stock=v_total_stock,bundle_config=jsonb_set(v_bundle,'{variants}',v_updated_variants,true),updated_at=v_now
          where id=v_product.id;
        else
          update public.products
          set stock=greatest(0,coalesce(stock,0))+v_quantity,updated_at=v_now
          where id=v_product.id;
        end if;
      end loop;

      if greatest(0,coalesce(ord.store_credits_used,0))>0 and ord.store_credits_released_at is null then
        update public.customers
        set store_credits=greatest(0,coalesce(store_credits,0)+greatest(0,ord.store_credits_used)),updated_at=v_now
        where id=ord.customer_id;

        insert into public.point_transactions(id,user_id,type,amount,order_id,description,created_at)
        values (
          'tx-credit-expiry-'||ord.id,
          ord.customer_id,
          'store_credit_refund',
          greatest(0,ord.store_credits_used),
          ord.id,
          'Returned ₱'||to_char(greatest(0,ord.store_credits_used),'FM9999999990.00')||
          ' Store Credits after Order #'||coalesce(ord.order_number,ord.id)||' expired unpaid',
          v_now
        )
        on conflict (id) do nothing;
      end if;

      update public.orders
      set status='Expired',
          payment_status='Expired',
          review_status='Expired',
          requires_manual_review=false,
          expired_at=v_now,
          inventory_released_at=v_now,
          inventory_release_error=null,
          store_credits_released_at=case
            when greatest(0,coalesce(ord.store_credits_used,0))>0 then v_now
            else store_credits_released_at
          end,
          updated_at=v_now
      where id=ord.id;

      v_expired := v_expired || jsonb_build_array(
        jsonb_build_object('id',ord.id,'orderNumber',ord.order_number,'customerId',ord.customer_id,'chatId',ord.tg_user_id)
      );
    exception when others then
      v_error := left(sqlerrm,500);

      if greatest(0,coalesce(ord.store_credits_used,0))>0 and ord.store_credits_released_at is null then
        begin
          update public.customers
          set store_credits=greatest(0,coalesce(store_credits,0)+greatest(0,ord.store_credits_used)),updated_at=v_now
          where id=ord.customer_id;

          insert into public.point_transactions(id,user_id,type,amount,order_id,description,created_at)
          values (
            'tx-credit-expiry-'||ord.id,
            ord.customer_id,
            'store_credit_refund',
            greatest(0,ord.store_credits_used),
            ord.id,
            'Returned ₱'||to_char(greatest(0,ord.store_credits_used),'FM9999999990.00')||
            ' Store Credits after Order #'||coalesce(ord.order_number,ord.id)||' expired unpaid',
            v_now
          )
          on conflict (id) do nothing;

          update public.orders
          set store_credits_released_at=v_now
          where id=ord.id;
        exception when others then
          v_error := left(v_error || '; Store Credit refund failed: ' || sqlerrm,500);
        end;
      end if;

      update public.orders
      set status='Expired',
          payment_status='Expired',
          review_status='Expired',
          requires_manual_review=false,
          expired_at=v_now,
          inventory_released_at=null,
          inventory_release_error=v_error,
          updated_at=v_now
      where id=ord.id;

      v_failed := v_failed || jsonb_build_object(
        'id',ord.id,'orderNumber',ord.order_number,'customerId',ord.customer_id,'chatId',ord.tg_user_id,'error',v_error
      );
    end;
  end loop;

  return jsonb_build_object(
    'success',true,
    'expiredCount',jsonb_array_length(v_expired),
    'failedCount',jsonb_array_length(v_failed),
    'orders',v_expired,
    'errors',v_failed
  );
end;
$$;

revoke execute on function public.expire_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders(integer) to service_role;
