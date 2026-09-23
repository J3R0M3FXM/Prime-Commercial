-- Fix optional promo record handling in order creation.
-- Keeps promo identity in a scalar so orders without a promo never dereference an unassigned RECORD.
CREATE OR REPLACE FUNCTION public.create_order_with_loyalty(p_order jsonb, p_order_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item jsonb;
  i integer;
  v_product_id text;
  v_variant_id text;
  v_quantity integer;
  v_product record;
  v_bundle jsonb;
  v_variants jsonb;
  v_variant_index integer;
  v_variant jsonb;
  v_updated_variants jsonb;
  v_stock integer;
  v_price numeric;
  v_total_stock integer;
  v_canonical_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_item_count integer := 0;
  v_charges_breakdown jsonb := coalesce(p_order->'chargesBreakdown', '[]'::jsonb);
  v_charges_total numeric := 0;
  v_delivery_fee numeric := greatest(0, coalesce((p_order->>'deliveryFee')::numeric, 0));
  v_delivery_payment_method text := lower(trim(coalesce(p_order->>'deliveryPaymentMethod', '')));
  v_courier_id text := nullif(coalesce(p_order->>'courierId', ''), '');
  v_payment_method_id text := nullif(coalesce(p_order->>'paymentMethodId', ''), '');
  v_payment_method_name text := coalesce(p_order->>'paymentMethodName', '');
  v_device_id text := nullif(trim(coalesce(p_order->>'deviceId', p_order->'deviceSnapshot'->>'deviceId', '')), '');
  v_customer_id text := nullif(p_order->>'customerId', '');
  v_customer record;
  v_referrer record;
  v_referrer_user_id text := nullif(p_order->>'referrerUserId', '');
  v_referrer_member_id text := nullif(p_order->>'referrerMemberId', '');
  v_existing_referrer_member_id text;
  v_promo_code text := upper(trim(coalesce(p_order->>'promoCode', '')));
  v_promo record;
  v_promo_id text;
  v_promo_meta jsonb := '{}'::jsonb;
  v_customer_tier text := 'SILVER';
  v_completed_orders integer := 0;
  v_eligibility text := 'all';
  v_allowed jsonb := '[]'::jsonb;
  v_promo_discount numeric := 0;
  v_shipping_subsidy numeric := 0;
  v_cashback_points numeric := 0;
  v_net_delivery_fee numeric := 0;
  v_requested_credits numeric := greatest(0, coalesce((p_order->>'storeCreditsRequested')::numeric, 0));
  v_available_credits numeric := 0;
  v_credits_used numeric := 0;
  v_payable_before_credits numeric := 0;
  v_payable_now numeric := 0;
  v_payable_on_delivery numeric := 0;
  v_total_amount numeric := 0;
  v_usage_count integer := 0;
  v_customer_usage_count integer := 0;
  v_device_usage_count integer := 0;
  v_pct numeric := 0;
  v_cap numeric := 0;
  v_discount_value numeric := 0;
  v_promo_redemption_discount numeric := 0;
  v_pht timestamp;
  v_pht_day integer;
  v_pht_date integer;
  v_pht_hour integer;
  v_start_hour integer;
  v_end_hour integer;
  v_meta_text text;
  v_delivery_payment_allowed boolean := true;
  v_courier_allowed boolean := true;
  v_purchasing_points_amount numeric := 0;
begin
  if v_customer_id is null then
    raise exception 'Customer authentication context is required' using errcode = 'P0001';
  end if;

  select *
    into v_customer
  from public.customers
  where id = v_customer_id
  for update;

  if not found then
    raise exception 'Authenticated customer was not found' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_order->'items') <> 'array' or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'Cart items are required' using errcode = 'P0001';
  end if;

  if v_requested_credits < 0 then
    raise exception 'Invalid Store Credits amount' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_charges_breakdown) <> 'array' then
    v_charges_breakdown := '[]'::jsonb;
  end if;

  for item in select value from jsonb_array_elements(p_order->'items')
  loop
    v_product_id := coalesce(nullif(item->>'productId', ''), nullif(item->>'product_id', ''), nullif(item->>'id', ''));
    v_variant_id := coalesce(nullif(item->>'variantId', ''), nullif(item->>'variant_id', ''), 'default');
    v_quantity := least(1000, greatest(1, coalesce((item->>'quantity')::integer, 1)));

    if v_product_id is null then
      raise exception 'A cart item is missing productId' using errcode = 'P0001';
    end if;

    select id, name, price, stock, is_active, bundle_config, image_url
      into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Product % is no longer available', v_product_id using errcode = 'P0002';
    end if;

    if not coalesce(v_product.is_active, false) then
      raise exception 'Product % is no longer active', v_product.name using errcode = 'P0002';
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
        raise exception 'Selected variant % for % is no longer available', v_variant_id, v_product.name using errcode = 'P0002';
      end if;

      v_stock := greatest(0, coalesce((v_variants->v_variant_index->>'stock')::integer, 0));
      v_price := greatest(0, coalesce((v_variants->v_variant_index->>'price')::numeric, v_product.price, 0));

      if v_stock < v_quantity then
        raise exception 'Insufficient stock for % (%). Available: %, requested: %',
          v_product.name, coalesce(v_variants->v_variant_index->>'name', v_variant_id), v_stock, v_quantity
          using errcode = 'P0002';
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
      set stock = v_total_stock,
          bundle_config = jsonb_set(v_bundle, '{variants}', v_updated_variants, true),
          updated_at = now()
      where id = v_product.id;
    else
      v_stock := greatest(0, coalesce(v_product.stock, 0));
      v_price := greatest(0, coalesce(v_product.price, 0));

      if v_stock < v_quantity then
        raise exception 'Insufficient stock for %. Available: %, requested: %',
          v_product.name, v_stock, v_quantity
          using errcode = 'P0002';
      end if;

      update public.products
      set stock = v_stock - v_quantity, updated_at = now()
      where id = v_product.id;
    end if;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_item_count := v_item_count + v_quantity;

    v_canonical_items := v_canonical_items || jsonb_build_array(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(item, '{productId}', to_jsonb(v_product.id), true),
            '{variantId}', to_jsonb(v_variant_id), true
          ),
          '{price}', to_jsonb(v_price), true
        ),
        '{name}', to_jsonb(v_product.name), true
      )
    );
  end loop;

  v_subtotal := round(greatest(0, v_subtotal), 2);

  select coalesce(sum(greatest(0, coalesce((value->>'computedAmount')::numeric, 0))), 0)
    into v_charges_total
  from jsonb_array_elements(v_charges_breakdown);

  if v_charges_total < 0 then
    v_charges_total := 0;
  end if;

  if v_promo_code <> '' then
    select *
      into v_promo
    from public.promos
    where upper(code) = v_promo_code
    for update;

    if not found then
      raise exception 'Promo code does not exist or is invalid' using errcode = 'P0001';
    end if;

    v_promo_id := v_promo.id;

    begin
      v_meta_text := coalesce(v_promo.description, '');
      if left(trim(v_meta_text), 1) = '{' then
        v_promo_meta := v_meta_text::jsonb;
      end if;
      if jsonb_typeof(v_promo_meta) <> 'object' then
        v_promo_meta := '{}'::jsonb;
      end if;
    exception when others then
      v_promo_meta := '{}'::jsonb;
    end;

    if not coalesce(v_promo.is_active, false) then
      raise exception 'This promo code is currently inactive' using errcode = 'P0001';
    end if;
    if v_promo.start_date is not null and now() < v_promo.start_date then
      raise exception 'This promo code is not active yet' using errcode = 'P0001';
    end if;
    if v_promo.end_date is not null and now() > v_promo.end_date then
      raise exception 'This promo code has expired' using errcode = 'P0001';
    end if;

    v_pht := now() at time zone 'Asia/Manila';
    v_pht_day := extract(dow from v_pht)::integer;
    v_pht_date := extract(day from v_pht)::integer;
    v_pht_hour := extract(hour from v_pht)::integer;

    v_allowed := coalesce(v_promo_meta->'activeDaysOfWeek', '[0,1,2,3,4,5,6]'::jsonb);
    if jsonb_typeof(v_allowed) = 'array' and jsonb_array_length(v_allowed) between 1 and 6 then
      if not exists (
        select 1 from jsonb_array_elements_text(v_allowed) d where (d::integer) = v_pht_day
      ) then
        raise exception 'This promo is not valid today' using errcode = 'P0001';
      end if;
    end if;

    if coalesce((v_promo_meta->>'isPaydayOnly')::boolean, false)
       and not ((v_pht_date between 14 and 16) or v_pht_date >= 28) then
      raise exception 'This promo is exclusive to the Payday Sale window' using errcode = 'P0001';
    end if;

    begin
      if nullif(v_promo_meta->>'flashHourStart', '') is not null then
        v_start_hour := (v_promo_meta->>'flashHourStart')::integer;
      end if;
      if nullif(v_promo_meta->>'flashHourEnd', '') is not null then
        v_end_hour := (v_promo_meta->>'flashHourEnd')::integer;
      end if;
    exception when others then
      v_start_hour := null;
      v_end_hour := null;
    end;

    if v_start_hour is not null and v_end_hour is not null then
      if v_start_hour < 0 or v_end_hour > 24 or v_start_hour >= v_end_hour
         or v_pht_hour < v_start_hour or v_pht_hour >= v_end_hour then
        raise exception 'This promo is outside its configured flash-hour window' using errcode = 'P0001';
      end if;
    end if;

    if greatest(0, coalesce(v_promo.min_spend, 0)) > v_subtotal then
      raise exception 'Minimum spend requirement is not met for this promo' using errcode = 'P0001';
    end if;

    if greatest(0, coalesce((v_promo_meta->>'minItemQuantity')::integer, 0)) > v_item_count then
      raise exception 'Minimum item quantity requirement is not met for this promo' using errcode = 'P0001';
    end if;

    select count(*)
      into v_completed_orders
    from public.orders
    where customer_id = v_customer_id
      and lower(coalesce(status, '')) in ('delivered', 'completed');

    v_customer_tier := public.current_customer_tier(v_customer_id);

    v_eligibility := lower(coalesce(v_promo_meta->>'customerEligibility', 'all'));
    if v_eligibility = 'new_customer' and v_completed_orders > 0 then
      raise exception 'This voucher is exclusive to new customers on their first completed order' using errcode = 'P0001';
    elsif v_eligibility = 'min_orders' and v_completed_orders < greatest(1, coalesce((v_promo_meta->>'minPreviousOrders')::integer, 1)) then
      raise exception 'This voucher requires more completed orders' using errcode = 'P0001';
    elsif v_eligibility = 'tier_restricted' then
      v_allowed := coalesce(v_promo_meta->'eligibleTiers', '[]'::jsonb);
      if jsonb_typeof(v_allowed) = 'array'
         and jsonb_array_length(v_allowed) > 0
         and not exists (
           select 1 from jsonb_array_elements_text(v_allowed) t
           where upper(trim(t)) = v_customer_tier
         )
      then
        raise exception 'This voucher is restricted to the configured customer tiers (Current: %)', v_customer_tier
          using errcode = 'P0001';
      end if;
    end if;

    v_allowed := coalesce(v_promo_meta->'allowedPaymentMethods', '["all"]'::jsonb);
    v_delivery_payment_allowed := exists (
      select 1 from jsonb_array_elements_text(v_allowed) m
      where lower(trim(m)) = 'all' or lower(trim(m)) = v_delivery_payment_method
    );
    if jsonb_typeof(v_allowed) = 'array' and jsonb_array_length(v_allowed) > 0 and not v_delivery_payment_allowed then
      raise exception 'This promo is not valid for the selected delivery payment channel' using errcode = 'P0001';
    end if;

    v_allowed := coalesce(v_promo_meta->'allowedCourierIds', '["all"]'::jsonb);
    v_courier_allowed := exists (
      select 1 from jsonb_array_elements_text(v_allowed) c
      where lower(trim(c)) = 'all' or lower(trim(c)) = lower(coalesce(v_courier_id, ''))
    );
    if jsonb_typeof(v_allowed) = 'array' and jsonb_array_length(v_allowed) > 0 and not v_courier_allowed then
      raise exception 'This promo is not applicable to the selected delivery courier' using errcode = 'P0001';
    end if;

    select count(*) into v_usage_count
    from public.promo_redemptions
    where promo_id = v_promo.id and released_at is null;

    if v_promo.total_usage_limit is not null and v_promo.total_usage_limit > 0 and v_usage_count >= v_promo.total_usage_limit then
      raise exception 'This promo code has reached its total usage limit' using errcode = 'P0001';
    end if;

    select count(*) into v_customer_usage_count
    from public.promo_redemptions
    where promo_id = v_promo.id and customer_id = v_customer_id and released_at is null;

    if v_promo.usage_limit_per_customer is not null and v_promo.usage_limit_per_customer > 0
       and v_customer_usage_count >= v_promo.usage_limit_per_customer then
      raise exception 'You have already redeemed this promo code (per-customer limit reached)' using errcode = 'P0001';
    end if;

    if v_device_id is not null then
      select count(*) into v_device_usage_count
      from public.promo_redemptions
      where promo_id = v_promo.id and device_id = v_device_id and customer_id <> v_customer_id;
      if v_device_usage_count > 0 then
        raise exception 'Promo abuse detected: this promo code has already been claimed on this device under another account' using errcode = 'P0001';
      end if;
    end if;

    v_discount_value := greatest(0, coalesce(v_promo.discount_value, 0));

    if lower(coalesce(v_promo.discount_type, 'fixed')) = 'fixed' then
      v_promo_discount := least(v_subtotal, v_discount_value);
    elsif lower(coalesce(v_promo.discount_type, 'fixed')) = 'percentage' then
      v_promo_discount := least(v_subtotal, round((v_subtotal * v_discount_value / 100.0) * 100) / 100);
      if v_promo.max_discount_amount is not null and v_promo.max_discount_amount > 0 then
        v_promo_discount := least(v_promo_discount, v_promo.max_discount_amount);
      end if;
    elsif lower(coalesce(v_promo.discount_type, 'fixed')) = 'free_shipping' then
      v_shipping_subsidy := v_delivery_fee;
    elsif lower(coalesce(v_promo.discount_type, 'fixed')) = 'shipping_discount' then
      v_cap := coalesce(nullif((v_promo_meta->>'cappedShippingDiscount')::numeric, 0), v_discount_value);
      v_shipping_subsidy := least(v_delivery_fee, greatest(0, v_cap));
    elsif lower(coalesce(v_promo.discount_type, 'fixed')) = 'coins_cashback' then
      v_pct := coalesce(nullif(v_discount_value, 0), nullif((v_promo_meta->>'cashbackPercentage')::numeric, 0), 0);
      v_cashback_points := floor((v_subtotal * greatest(0, v_pct)) / 100);
      if v_promo.max_discount_amount is not null and v_promo.max_discount_amount > 0 then
        v_cashback_points := least(v_cashback_points, v_promo.max_discount_amount);
      end if;
    end if;
  end if;

  v_net_delivery_fee := greatest(0, v_delivery_fee - v_shipping_subsidy);

  if v_delivery_payment_method = 'upon_delivery' then
    v_payable_before_credits := greatest(0, v_subtotal - v_promo_discount) + v_charges_total;
    v_payable_on_delivery := v_net_delivery_fee;
  elsif v_delivery_payment_method = 'upon_checkout' then
    v_payable_before_credits := greatest(0, v_subtotal - v_promo_discount) + v_charges_total + v_net_delivery_fee;
    v_payable_on_delivery := 0;
  else
    raise exception 'Delivery payment method is required' using errcode = 'P0001';
  end if;

  v_available_credits := greatest(0, coalesce(v_customer.store_credits, 0));
  v_credits_used := least(v_available_credits, v_requested_credits, greatest(0, v_payable_before_credits));
  v_payable_now := greatest(0, v_payable_before_credits - v_credits_used);
  v_total_amount := greatest(0, v_payable_now + v_payable_on_delivery);
  v_purchasing_points_amount := floor(v_subtotal / 100) * 5;

  if v_referrer_user_id is not null or v_referrer_member_id is not null then
    select * into v_referrer
    from public.customers
    where (v_referrer_user_id is not null and id = v_referrer_user_id)
       or (v_referrer_member_id is not null and upper(prime_member_id) = upper(v_referrer_member_id))
    order by id limit 1 for update;

    if found and v_referrer.id = v_customer_id then
      v_referrer_user_id := null;
      v_referrer_member_id := null;
    elsif found then
      v_referrer_user_id := v_referrer.id;
      v_referrer_member_id := v_referrer.prime_member_id;
    else
      v_referrer_user_id := null;
      v_referrer_member_id := null;
    end if;
  end if;

  v_existing_referrer_member_id := nullif(v_customer.referred_by_member_id, '');
  if v_existing_referrer_member_id is not null then
    v_referrer_user_id := null;
    v_referrer_member_id := v_existing_referrer_member_id;
  end if;

  insert into public.orders (
    id, order_number, customer_id, customer_name, customer_phone, tg_user_id, prime_member_id,
    items, subtotal, delivery_fee, discount_amount, applied_promo_code, points_discount,
    charges_breakdown, total_amount, payable_now, payable_on_delivery, status, payment_status,
    payment_method_id, payment_method_name, payment_proof_image, ocr_analysis, review_status,
    requires_manual_review, delivery_address, courier_id, courier_name, tracking_number, notes,
    fingerprint_snapshot, created_at, updated_at, store_credits_used, promo_shipping_subsidy,
    cashback_points_amount, purchasing_points_amount, referred_by_user_id, referred_by_member_id,
    referral_points_status, referral_points_credit_after, referral_points_amount
  )
  values (
    coalesce(nullif(p_order->>'id', ''), p_order_number), p_order_number, v_customer_id,
    coalesce(p_order->>'customerName', p_order->>'receiverName', v_customer.tg_name, ''),
    coalesce(p_order->>'customerPhone', p_order->>'receiverPhone', v_customer.phone_number, ''),
    coalesce(v_customer.tg_user_id, ''), coalesce(v_customer.prime_member_id, ''),
    v_canonical_items, v_subtotal, v_delivery_fee, v_promo_discount,
    case when v_promo_code <> '' then v_promo_code else null end, 0, v_charges_breakdown,
    v_total_amount, v_payable_now, v_payable_on_delivery, 'Pending', 'Unpaid',
    v_payment_method_id, v_payment_method_name, '', null, 'Pending Manual Review', true,
    coalesce(p_order->'deliveryAddress', '{}'::jsonb), v_courier_id,
    coalesce(p_order->>'courierName', ''), coalesce(p_order->>'trackingNumber', ''),
    coalesce(p_order->>'notes', ''), p_order->'fingerprintSnapshot', now(), now(),
    v_credits_used, v_shipping_subsidy, v_cashback_points, v_purchasing_points_amount,
    v_referrer_user_id, v_referrer_member_id,
    case when v_referrer_user_id is not null then 'pending_30m' else 'none' end,
    case when v_referrer_user_id is not null then now() + interval '30 minutes' else null end,
    case when v_referrer_user_id is not null then 50 else 0 end
  );

  if v_credits_used > 0 then
    update public.customers
    set store_credits = greatest(0, coalesce(store_credits, 0) - v_credits_used), updated_at = now()
    where id = v_customer_id;

    insert into public.point_transactions (id,user_id,type,amount,order_id,description,created_at)
    values (
      'tx-credit-order-' || p_order_number, v_customer_id, 'store_credit_usage', -v_credits_used, p_order_number,
      'Used ₱' || to_char(v_credits_used, 'FM9999999990.00') || ' Store Credits on Order #' || p_order_number, now()
    )
    on conflict (id) do nothing;
  end if;

  if v_referrer_user_id is not null and nullif(v_customer.referred_by_member_id, '') is null then
    update public.customers
    set referred_by = v_referrer_member_id, referred_by_user_id = v_referrer_user_id,
        referred_by_member_id = v_referrer_member_id, updated_at = now()
    where id = v_customer_id;
  end if;

  if v_promo_code <> '' then
    v_promo_redemption_discount := greatest(0, v_promo_discount + v_shipping_subsidy);
    insert into public.promo_redemptions (
      id,promo_code,promo_id,customer_id,order_id,device_id,discount_amount,used_at
    )
    values (
      'promo-redemption-' || p_order_number, v_promo_code, v_promo_id, v_customer_id,
      p_order_number, v_device_id, v_promo_redemption_discount, now()
    )
    on conflict (id) do nothing;

    select count(*) into v_usage_count from public.promo_redemptions where promo_id = v_promo_id;
    update public.promos set usage_count = v_usage_count, updated_at = now() where id = v_promo_id;
  end if;

  return jsonb_build_object(
    'success', true, 'id', coalesce(nullif(p_order->>'id',''), p_order_number), 'orderNumber', p_order_number,
    'items', v_canonical_items, 'subtotal', v_subtotal, 'deliveryFee', v_delivery_fee,
    'promoDiscount', v_promo_discount, 'discountAmount', v_promo_discount, 'shippingSubsidy', v_shipping_subsidy,
    'cashbackPoints', v_cashback_points, 'storeCreditsUsed', v_credits_used, 'totalAmount', v_total_amount,
    'payableNow', v_payable_now, 'payableOnDelivery', v_payable_on_delivery,
    'promoCode', case when v_promo_code <> '' then v_promo_code else null end,
    'promoId', v_promo_id,
    'customerTier', v_customer_tier, 'referralCode', v_referrer_member_id
  );
end;
$function$

