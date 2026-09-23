alter table public.customers
  add column if not exists referral_points numeric not null default 0,
  add column if not exists referred_by_user_id text,
  add column if not exists referred_by_member_id text;

alter table public.orders
  add column if not exists store_credits_used numeric not null default 0,
  add column if not exists promo_shipping_subsidy numeric not null default 0,
  add column if not exists cashback_points_amount numeric not null default 0,
  add column if not exists cashback_points_awarded_at timestamptz,
  add column if not exists cashback_points_reversed_at timestamptz,
  add column if not exists purchasing_points_amount numeric not null default 0,
  add column if not exists purchasing_points_awarded_at timestamptz,
  add column if not exists purchasing_points_reversed_at timestamptz,
  add column if not exists customer_aggregate_updated_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists referred_by_user_id text,
  add column if not exists referred_by_member_id text,
  add column if not exists referral_points_status text not null default 'none',
  add column if not exists referral_points_credit_after timestamptz,
  add column if not exists referral_points_credited_at timestamptz,
  add column if not exists referral_points_amount numeric not null default 0;

create index if not exists orders_customer_status_created_idx
  on public.orders (customer_id, status, created_at desc);
create index if not exists orders_referral_pending_idx
  on public.orders (referral_points_status, referral_points_credit_after)
  where referral_points_status = 'pending_30m';
create index if not exists promo_redemptions_promo_customer_idx
  on public.promo_redemptions (promo_id, customer_id);
create index if not exists promo_redemptions_promo_device_idx
  on public.promo_redemptions (promo_id, device_id);

create or replace function public.current_customer_tier(p_customer_id text, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  first_ts timestamptz;
  cycle_start timestamptz;
  diff_days numeric;
  cycle_index bigint;
  spend numeric := 0;
begin
  select min(coalesce(delivered_at, created_at))
    into first_ts
  from public.orders
  where customer_id = p_customer_id
    and lower(coalesce(status, '')) in ('completed', 'delivered');

  if first_ts is null then
    return 'SILVER';
  end if;

  diff_days := greatest(0, extract(epoch from (p_now - first_ts)) / 86400.0);
  cycle_index := floor(diff_days / 30.0)::bigint;
  cycle_start := first_ts + make_interval(days => (cycle_index * 30)::integer);

  select coalesce(sum(greatest(0, subtotal)), 0)
    into spend
  from public.orders
  where customer_id = p_customer_id
    and lower(coalesce(status, '')) in ('completed', 'delivered')
    and coalesce(delivered_at, created_at) >= cycle_start
    and coalesce(delivered_at, created_at) < cycle_start + interval '30 days';

  if spend >= 20000 then
    return 'TITANIUM';
  elsif spend >= 15000 then
    return 'PLATINUM';
  elsif spend >= 10000 then
    return 'GOLD';
  elsif spend >= 5000 then
    return 'BRONZE';
  else
    return 'SILVER';
  end if;
end;
$function$;

create or replace function public.create_order_with_loyalty(p_order jsonb, p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
  v_promo_meta jsonb := '{}'::jsonb;
  v_customer_tier text;
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

    select id, name, price, stock, is_active, bundle_config
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

    v_bundle := case when jsonb_typeof(v_product.bundle_config) = 'object' then v_product.bundle_config else '{}'::jsonb end;
    v_variants := case when jsonb_typeof(v_bundle->'variants') = 'array' then v_bundle->'variants' else '[]'::jsonb end;
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
          v_product.name, coalesce(v_variants->v_variant_index->>'name', v_variant_id), v_stock, v_quantity using errcode = 'P0002';
      end if;

      v_updated_variants := jsonb_set(v_variants, array[v_variant_index::text, 'stock'], to_jsonb(v_stock - v_quantity), true);

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
          v_product.name, v_stock, v_quantity using errcode = 'P0002';
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

  if v_promo_code <> '' then
    select * into v_promo
    from public.promos
    where upper(code) = v_promo_code
    for update;

    if not found then raise exception 'Promo code does not exist or is invalid' using errcode = 'P0001'; end if;

    begin
      v_meta_text := coalesce(v_promo.description, '');
      if left(trim(v_meta_text), 1) = '{' then v_promo_meta := v_meta_text::jsonb; end if;
      if jsonb_typeof(v_promo_meta) <> 'object' then v_promo_meta := '{}'::jsonb; end if;
    exception when others then
      v_promo_meta := '{}'::jsonb;
    end;

    if not coalesce(v_promo.is_active, false) then raise exception 'This promo code is currently inactive' using errcode = 'P0001'; end if;
    if v_promo.start_date is not null and now() < v_promo.start_date then raise exception 'This promo code is not active yet' using errcode = 'P0001'; end if;
    if v_promo.end_date is not null and now() > v_promo.end_date then raise exception 'This promo code has expired' using errcode = 'P0001'; end if;

    v_pht := now() at time zone 'Asia/Manila';
    v_pht_day := extract(dow from v_pht)::integer;
    v_pht_date := extract(day from v_pht)::integer;
    v_pht_hour := extract(hour from v_pht)::integer;

    v_allowed := coalesce(v_promo_meta->'activeDaysOfWeek', '[0,1,2,3,4,5,6]'::jsonb);
    if jsonb_typeof(v_allowed) = 'array' and jsonb_array_length(v_allowed) between 1 and 6 then
      if not exists (select 1 from jsonb_array_elements_text(v_allowed) d where d::integer = v_pht_day) then
        raise exception 'This promo is not valid today' using errcode = 'P0001';
      end if;
    end if;

    if coalesce((v_promo_meta->>'isPaydayOnly')::boolean, false)
       and not ((v_pht_date between 14 and 16) or v_pht_date >= 28) then
      raise exception 'This promo is exclusive to the Payday Sale window' using errcode = 'P0001';
    end if;

    begin
      if nullif(v_promo_meta->>'flashHourStart', '') is not null then v_start_hour := (v_promo_meta->>'flashHourStart')::integer; end if;
      if nullif(v_promo_meta->>'flashHourEnd', '') is not null then v_end_hour := (v_promo_meta->>'flashHourEnd')::integer; end if;
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

    select count(*) into v_completed_orders
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
      if jsonb_typeof(v_allowed) = 'array' and jsonb_array_length(v_allowed) > 0
         and not exists (select 1 from jsonb_array_elements_text(v_allowed) t where upper(trim(t)) = v_customer_tier) then
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

    select count(*) into v_usage_count from public.promo_redemptions where promo_id = v_promo.id;
    if v_promo.total_usage_limit is not null and v_promo.total_usage_limit > 0 and v_usage_count >= v_promo.total_usage_limit then
      raise exception 'This promo code has reached its total usage limit' using errcode = 'P0001';
    end if;

    select count(*) into v_customer_usage_count
    from public.promo_redemptions
    where promo_id = v_promo.id and customer_id = v_customer_id;
    if v_promo.usage_limit_per_customer is not null and v_promo.usage_limit_per_customer > 0
       and v_customer_usage_count >= v_promo.usage_limit_per_customer then
      raise exception 'You have already redeemed this promo code (per-customer limit reached)' using errcode = 'P0001';
    end if;

    if v_device_id is not null then
      select count(*) into v_device_usage_count
      from public.promo_redemptions
      where promo_id = v_promo.id and device_id = v_device_id and customer_id <> v_customer_id;
      if v_device_usage_count > 0 then
        raise exception 'Promo abuse detected: this promo code has already been claimed on this device under another account'
          using errcode = 'P0001';
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
    elsif lower(coalesce(v_promo.discount_type, 'shipping_discount')) = 'shipping_discount' then
      v_cap := coalesce(nullif((v_promo_meta->>'cappedShippingDiscount')::numeric, 0), v_discount_value);
      v_shipping_subsidy := least(v_delivery_fee, greatest(0, v_cap));
    elsif lower(coalesce(v_promo.discount_type, 'coins_cashback')) = 'coins_cashback' then
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
    select *
      into v_referrer
    from public.customers
    where (v_referrer_user_id is not null and id = v_referrer_user_id)
       or (v_referrer_member_id is not null and upper(prime_member_id) = upper(v_referrer_member_id))
    order by id
    limit 1
    for update;

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
    coalesce(p_order->'deliveryAddress', '{}'::jsonb), v_courier_id, coalesce(p_order->>'courierName', ''),
    coalesce(p_order->>'trackingNumber', ''), coalesce(p_order->>'notes', ''), p_order->'fingerprintSnapshot',
    now(), now(), v_credits_used, v_shipping_subsidy, v_cashback_points, v_purchasing_points_amount,
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
      'tx-credit-order-' || p_order_number, v_customer_id, 'store_credit_usage', -v_credits_used,
      p_order_number,
      'Used ₱' || to_char(v_credits_used, 'FM9999999990.00') || ' Store Credits on Order #' || p_order_number, now()
    )
    on conflict (id) do nothing;
  end if;

  if v_referrer_user_id is not null and nullif(v_customer.referred_by_member_id, '') is null then
    update public.customers
    set referred_by = v_referrer_member_id,
        referred_by_user_id = v_referrer_user_id,
        referred_by_member_id = v_referrer_member_id,
        updated_at = now()
    where id = v_customer_id;
  end if;

  if v_promo_code <> '' then
    v_promo_redemption_discount := greatest(0, v_promo_discount + v_shipping_subsidy);
    insert into public.promo_redemptions (
      id,promo_code,promo_id,customer_id,order_id,device_id,discount_amount,used_at
    )
    values (
      'promo-redemption-' || p_order_number, v_promo_code, v_promo.id, v_customer_id, p_order_number,
      v_device_id, v_promo_redemption_discount, now()
    )
    on conflict (id) do nothing;

    select count(*) into v_usage_count from public.promo_redemptions where promo_id = v_promo.id;
    update public.promos set usage_count = v_usage_count, updated_at = now() where id = v_promo.id;
  end if;

  return jsonb_build_object(
    'success', true, 'id', coalesce(nullif(p_order->>'id',''), p_order_number), 'orderNumber', p_order_number,
    'items', v_canonical_items, 'subtotal', v_subtotal, 'deliveryFee', v_delivery_fee,
    'promoDiscount', v_promo_discount, 'discountAmount', v_promo_discount, 'shippingSubsidy', v_shipping_subsidy,
    'cashbackPoints', v_cashback_points, 'storeCreditsUsed', v_credits_used, 'totalAmount', v_total_amount,
    'payableNow', v_payable_now, 'payableOnDelivery', v_payable_on_delivery,
    'promoCode', case when v_promo_code <> '' then v_promo_code else null end,
    'promoId', case when v_promo_code <> '' then v_promo.id else null end,
    'customerTier', v_customer_tier, 'referralCode', v_referrer_member_id
  );
end;
$function$;

create or replace function public.award_order_loyalty(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  ord record;
  cust record;
  purchase_points numeric := 0;
  cashback_points numeric := 0;
  now_ts timestamptz := now();
  updated_totals boolean := false;
begin
  select * into ord from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('success', false, 'awarded', false, 'reason', 'order_not_found'); end if;
  if lower(coalesce(ord.status, '')) not in ('completed', 'delivered') then
    return jsonb_build_object('success', true, 'awarded', false, 'reason', 'order_not_complete');
  end if;

  select * into cust from public.customers where id = ord.customer_id for update;
  if not found then return jsonb_build_object('success', false, 'awarded', false, 'reason', 'customer_not_found'); end if;

  update public.orders
  set delivered_at = coalesce(delivered_at, now_ts), updated_at = now_ts
  where id = ord.id;

  purchase_points := floor(greatest(0, coalesce(ord.subtotal, 0)) / 100) * 5;
  cashback_points := greatest(0, coalesce(ord.cashback_points_amount, 0));

  if ord.purchasing_points_awarded_at is null then
    update public.orders
    set purchasing_points_amount = purchase_points, purchasing_points_awarded_at = now_ts, updated_at = now_ts
    where id = ord.id;

    if purchase_points > 0 then
      insert into public.point_transactions (id,user_id,type,amount,order_id,description,created_at)
      values (
        'tx-purchase-' || ord.id, ord.customer_id, 'purchasing', purchase_points, ord.id,
        '5 Purchasing Points per ₱100 item spend for Order #' || coalesce(ord.order_number, ord.id), now_ts
      )
      on conflict (id) do nothing;

      update public.customers
      set points = greatest(0, coalesce(points, 0) + purchase_points), updated_at = now_ts
      where id = ord.customer_id;
    end if;
  end if;

  if cashback_points > 0 and ord.cashback_points_awarded_at is null then
    insert into public.point_transactions (id,user_id,type,amount,order_id,description,created_at)
    values (
      'tx-cashback-' || ord.id, ord.customer_id, 'purchasing', cashback_points, ord.id,
      'Promo cashback points for Order #' || coalesce(ord.order_number, ord.id), now_ts
    )
    on conflict (id) do nothing;

    update public.customers
    set points = greatest(0, coalesce(points, 0) + cashback_points), updated_at = now_ts
    where id = ord.customer_id;

    update public.orders
    set cashback_points_awarded_at = now_ts, updated_at = now_ts
    where id = ord.id;
  end if;

  if ord.customer_aggregate_updated_at is null then
    update public.customers
    set total_orders = coalesce(total_orders, 0) + 1,
        lifetime_spent = coalesce(lifetime_spent, 0) + greatest(0, coalesce(ord.total_amount, 0)),
        updated_at = now_ts
    where id = ord.customer_id;

    update public.orders
    set customer_aggregate_updated_at = now_ts, updated_at = now_ts
    where id = ord.id;
    updated_totals := true;
  end if;

  return jsonb_build_object(
    'success', true, 'awarded', true, 'purchasingPoints', purchase_points,
    'cashbackPoints', cashback_points, 'aggregateUpdated', updated_totals
  );
end;
$function$;

create or replace function public.process_matured_referrals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  ord record;
  refcust record;
  processed integer := 0;
  reward numeric;
  now_ts timestamptz := now();
begin
  for ord in
    select *
    from public.orders
    where referral_points_status = 'pending_30m'
      and referral_points_credit_after is not null
      and referral_points_credit_after <= now_ts
    order by referral_points_credit_after asc
    for update skip locked
    limit 100
  loop
    reward := greatest(0, coalesce(ord.referral_points_amount, 50));

    select *
      into refcust
    from public.customers
    where (ord.referred_by_user_id is not null and id = ord.referred_by_user_id)
       or (ord.referred_by_member_id is not null and upper(prime_member_id) = upper(ord.referred_by_member_id))
    order by (id = ord.referred_by_user_id) desc, id
    limit 1
    for update;

    if found and refcust.id <> ord.customer_id and reward > 0 then
      insert into public.point_transactions (id,user_id,type,amount,order_id,description,created_at)
      values (
        'tx-referral-' || ord.id, refcust.id, 'referral', reward, ord.id,
        '50 Referral Points for Order #' || coalesce(ord.order_number, ord.id), now_ts
      )
      on conflict (id) do nothing;

      update public.customers
      set referral_points = greatest(0, coalesce(referral_points, 0) + reward), updated_at = now_ts
      where id = refcust.id;

      update public.orders
      set referral_points_status = 'credited',
          referral_points_credited_at = now_ts,
          updated_at = now_ts
      where id = ord.id;

      processed := processed + 1;
    else
      update public.orders
      set referral_points_status = 'rejected', updated_at = now_ts
      where id = ord.id;
    end if;
  end loop;

  return jsonb_build_object('success', true, 'processed', processed);
end;
$function$;

create or replace function public.convert_points_to_store_credits(p_customer_id text,p_points_type text,p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  cust record;
  amount integer;
  current_points numeric;
  new_points numeric;
  new_credits numeric;
begin
  amount := floor(coalesce(p_amount, 0));
  if amount <= 0 then raise exception 'Please specify a valid amount of points to convert' using errcode = 'P0001'; end if;
  if p_points_type not in ('purchasing','referral') then raise exception 'Invalid points type' using errcode = 'P0001'; end if;

  select * into cust from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0001'; end if;

  current_points := case when p_points_type = 'referral'
    then greatest(0, coalesce(cust.referral_points, 0))
    else greatest(0, coalesce(cust.points, 0)) end;

  if current_points < amount then
    raise exception 'Insufficient Points. Available: %', current_points using errcode = 'P0001';
  end if;

  new_points := current_points - amount;
  new_credits := greatest(0, coalesce(cust.store_credits, 0) + amount);

  if p_points_type = 'referral' then
    update public.customers set referral_points = new_points, store_credits = new_credits, updated_at = now() where id = p_customer_id;
  else
    update public.customers set points = new_points, store_credits = new_credits, updated_at = now() where id = p_customer_id;
  end if;

  insert into public.point_transactions (id,user_id,type,amount,order_id,description,created_at)
  values (
    'tx-conv-' || replace(gen_random_uuid()::text, '-', ''),
    p_customer_id,
    case when p_points_type = 'referral' then 'conversion_referral' else 'conversion_purchasing' end,
    amount,
    null,
    'Converted ' || amount || ' Points to ₱' || amount || ' Store Credits',
    now()
  );

  return jsonb_build_object(
    'success', true, 'pointsType', p_points_type, 'convertedAmount', amount,
    'newPointsBalance', new_points, 'newCreditsBalance', new_credits
  );
end;
$function$;

create or replace function public.handle_order_loyalty_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if (tg_op = 'INSERT' and lower(coalesce(new.status, '')) in ('completed', 'delivered'))
     or (tg_op = 'UPDATE' and new.status is distinct from old.status
         and lower(coalesce(new.status, '')) in ('completed', 'delivered')) then
    perform public.award_order_loyalty(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_orders_loyalty_status on public.orders;
create trigger trg_orders_loyalty_status
after insert or update of status on public.orders
for each row execute function public.handle_order_loyalty_status();

revoke all on function public.current_customer_tier(text, timestamptz) from public;
revoke all on function public.create_order_with_loyalty(jsonb, text) from public;
revoke all on function public.award_order_loyalty(text) from public;
revoke all on function public.process_matured_referrals() from public;
revoke all on function public.convert_points_to_store_credits(text, text, numeric) from public;

grant execute on function public.current_customer_tier(text, timestamptz) to service_role;
grant execute on function public.create_order_with_loyalty(jsonb, text) to service_role;
grant execute on function public.award_order_loyalty(text) to service_role;
grant execute on function public.process_matured_referrals() to service_role;
grant execute on function public.convert_points_to_store_credits(text, text, numeric) to service_role;

update public.orders
set delivered_at = coalesce(delivered_at, created_at),
    updated_at = coalesce(updated_at, now())
where lower(coalesce(status, '')) in ('completed', 'delivered')
  and delivered_at is null;

select public.award_order_loyalty(id)
from public.orders
where lower(coalesce(status, '')) in ('completed', 'delivered')
  and purchasing_points_awarded_at is null;
