begin;

create or replace function public.create_order_with_inventory(
  p_order jsonb,
  p_order_number text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  item jsonb;
  v_product_id text;
  v_variant_id text;
  v_quantity integer;
  v_stock integer;
  v_price numeric;
  v_bundle jsonb;
  v_variants jsonb;
  v_variant_index integer;
  v_variant jsonb;
  v_updated_variants jsonb;
  v_total_stock integer;
  v_canonical_items jsonb := '[]'::jsonb;
  v_product record;
  v_order_id text := coalesce(p_order->>'id', p_order_number);
begin
  if jsonb_typeof(p_order->'items') <> 'array' or jsonb_array_length(p_order->'items') = 0 then
    raise exception using message = 'Cart items are required', errcode = 'P0001';
  end if;

  for item in select value from jsonb_array_elements(p_order->'items')
  loop
    v_product_id := coalesce(nullif(item->>'productId', ''), nullif(item->>'product_id', ''), nullif(item->>'id', ''));
    v_variant_id := coalesce(nullif(item->>'variantId', ''), nullif(item->>'variant_id', ''), 'default');
    v_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));

    if v_product_id is null then
      raise exception using message = 'A cart item is missing productId', errcode = 'P0001';
    end if;

    select id, name, price, stock, is_active, bundle_config
      into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception using message = format('Product %s is no longer available', v_product_id), errcode = 'P0002';
    end if;

    if not coalesce(v_product.is_active, false) then
      raise exception using message = format('Product %s is no longer active', v_product.name), errcode = 'P0002';
    end if;

    v_bundle := case
      when jsonb_typeof(v_product.bundle_config) = 'object' then v_product.bundle_config
      else '{}'::jsonb
    end;

    v_variants := case
      when jsonb_typeof(v_bundle->'variants') = 'array' then v_bundle->'variants'
      else '[]'::jsonb
    end;

    v_variant_index := null;

    if jsonb_array_length(v_variants) > 0 then
      for i in 0 .. jsonb_array_length(v_variants) - 1
      loop
        v_variant := v_variants->i;
        if coalesce(v_variant->>'id', '') = v_variant_id then
          v_variant_index := i;
          exit;
        end if;
      end loop;

      if v_variant_index is null then
        raise exception using message = format('Selected variant %s for %s is no longer available', v_variant_id, v_product.name), errcode = 'P0002';
      end if;

      v_stock := greatest(0, coalesce((v_variants->v_variant_index->>'stock')::integer, 0));
      v_price := coalesce((v_variants->v_variant_index->>'price')::numeric, v_product.price);

      if v_stock < v_quantity then
        raise exception using
          message = format(
            'Insufficient stock for %s (%s). Available: %s, requested: %s',
            v_product.name,
            coalesce(v_variants->v_variant_index->>'name', v_variant_id),
            v_stock,
            v_quantity
          ),
          errcode = 'P0002';
      end if;

      v_updated_variants := jsonb_set(
        v_variants,
        array[v_variant_index::text, 'stock'],
        to_jsonb(v_stock - v_quantity),
        true
      );

      select coalesce(sum(greatest(0, coalesce((value->>'stock')::integer, 0))), 0)
        into v_total_stock
      from jsonb_array_elements(v_updated_variants);

      update public.products
      set
        stock = v_total_stock,
        bundle_config = jsonb_set(v_bundle, '{variants}', v_updated_variants, true),
        updated_at = now()
      where id = v_product.id;
    else
      v_stock := greatest(0, coalesce(v_product.stock, 0));
      v_price := coalesce(v_product.price, 0);

      if v_stock < v_quantity then
        raise exception using
          message = format('Insufficient stock for %s. Available: %s, requested: %s', v_product.name, v_stock, v_quantity),
          errcode = 'P0002';
      end if;

      update public.products
      set stock = v_stock - v_quantity, updated_at = now()
      where id = v_product.id;
    end if;

    v_canonical_items := v_canonical_items || jsonb_build_array(
      jsonb_set(
        jsonb_set(
          jsonb_set(item, '{productId}', to_jsonb(v_product.id), true),
          '{variantId}', to_jsonb(v_variant_id), true
        ),
        '{price}', to_jsonb(v_price), true
      )
    );
  end loop;

  insert into public.orders (
    id, order_number, customer_id, customer_name, customer_phone, tg_user_id, prime_member_id,
    items, subtotal, delivery_fee, discount_amount, applied_promo_code, points_discount,
    charges_breakdown, total_amount, payable_now, payable_on_delivery, status, payment_status,
    payment_method_id, payment_method_name, payment_proof_image, ocr_analysis, review_status,
    requires_manual_review, delivery_address, courier_id, courier_name, tracking_number,
    notes, fingerprint_snapshot, created_at, updated_at
  )
  values (
    v_order_id,
    p_order_number,
    nullif(p_order->>'customerId', ''),
    coalesce(p_order->>'customerName', p_order->>'receiverName', ''),
    coalesce(p_order->>'customerPhone', p_order->>'receiverPhone', ''),
    coalesce(p_order->>'tgUserId', ''),
    coalesce(p_order->>'primeMemberId', ''),
    v_canonical_items,
    coalesce((p_order->>'subtotal')::numeric, 0),
    coalesce((p_order->>'deliveryFee')::numeric, 0),
    coalesce((p_order->>'discountAmount')::numeric, 0),
    coalesce(p_order->>'appliedPromoCode', ''),
    coalesce((p_order->>'pointsDiscount')::numeric, 0),
    coalesce(p_order->'chargesBreakdown', '[]'::jsonb),
    coalesce((p_order->>'totalAmount')::numeric, 0),
    coalesce((p_order->>'payableNow')::numeric, 0),
    coalesce((p_order->>'payableOnDelivery')::numeric, 0),
    coalesce(p_order->>'status', 'Pending'),
    coalesce(p_order->>'paymentStatus', 'Unpaid'),
    coalesce(p_order->>'paymentMethodId', ''),
    coalesce(p_order->>'paymentMethodName', ''),
    coalesce(p_order->>'paymentProofImage', ''),
    p_order->'ocrAnalysis',
    'Pending Manual Review',
    true,
    coalesce(p_order->'deliveryAddress', '{}'::jsonb),
    coalesce(p_order->>'courierId', ''),
    coalesce(p_order->>'courierName', ''),
    coalesce(p_order->>'trackingNumber', ''),
    coalesce(p_order->>'notes', ''),
    p_order->'fingerprintSnapshot',
    now(),
    now()
  );

  return jsonb_build_object('success', true, 'id', v_order_id, 'orderNumber', p_order_number, 'items', v_canonical_items);
end;
$$;

revoke execute on function public.create_order_with_inventory(jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order_with_inventory(jsonb, text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;

commit;
