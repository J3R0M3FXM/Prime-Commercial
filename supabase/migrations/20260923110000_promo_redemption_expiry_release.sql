begin;

alter table public.promo_redemptions
  add column if not exists released_at timestamptz;

create index if not exists promo_redemptions_active_promo_idx
  on public.promo_redemptions (promo_id)
  where released_at is null;

create index if not exists promo_redemptions_active_customer_idx
  on public.promo_redemptions (promo_id, customer_id)
  where released_at is null;

create index if not exists promo_redemptions_active_device_idx
  on public.promo_redemptions (promo_id, device_id)
  where released_at is null;

create or replace function public.release_promo_redemptions_for_order(
  p_order_id text,
  p_released_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  redemption record;
  released_count integer := 0;
begin
  for redemption in
    update public.promo_redemptions
    set released_at = coalesce(p_released_at, now())
    where order_id = p_order_id
      and released_at is null
    returning promo_id
  loop
    released_count := released_count + 1;

    if redemption.promo_id is not null then
      update public.promos
      set usage_count = (
        select count(*)
        from public.promo_redemptions
        where promo_id = redemption.promo_id
          and released_at is null
      ),
          updated_at = coalesce(p_released_at, now())
      where id = redemption.promo_id;
    end if;
  end loop;

  return jsonb_build_object('releasedCount', released_count);
end;
$$;

revoke execute on function public.release_promo_redemptions_for_order(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.release_promo_redemptions_for_order(text, timestamptz)
  to service_role;

update public.promo_redemptions pr
set released_at = o.expired_at
from public.orders o
where pr.order_id = o.id
  and lower(coalesce(o.status,'')) = 'expired'
  and pr.released_at is null
  and o.expired_at is not null;

update public.promos p
set usage_count = (
  select count(*)
  from public.promo_redemptions pr
  where pr.promo_id = p.id
    and pr.released_at is null
),
updated_at = now();

do $patch$
declare
  v_def text;
  v_new_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_order_with_loyalty'
    and pg_get_function_identity_arguments(p.oid) = 'p_order jsonb, p_order_number text';

  if v_def is null then
    raise exception 'create_order_with_loyalty function not found';
  end if;

  v_new_def := replace(
    v_def,
    $old1$from public.promo_redemptions
    where promo_id = v_promo.id;$old1$,
    $new1$from public.promo_redemptions
    where promo_id = v_promo.id
      and released_at is null;$new1$
  );

  v_new_def := replace(
    v_new_def,
    $old2$from public.promo_redemptions
    where promo_id = v_promo.id and customer_id = v_customer_id;$old2$,
    $new2$from public.promo_redemptions
    where promo_id = v_promo.id
      and customer_id = v_customer_id
      and released_at is null;$new2$
  );

  v_new_def := replace(
    v_new_def,
    $old3$from public.promo_redemptions
    where promo_id = v_promo.id
      and device_id = v_device_id
      and customer_id <> v_customer_id;$old3$,
    $new3$from public.promo_redemptions
    where promo_id = v_promo.id
      and device_id = v_device_id
      and customer_id <> v_customer_id
      and released_at is null;$new3$
  );

  if v_new_def = v_def then
    raise exception 'No promo redemption count queries were updated in create_order_with_loyalty';
  end if;

  execute v_new_def;
end
$patch$;

do $patch$
declare
  v_def text;
  v_new_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'expire_unpaid_orders'
    and pg_get_function_identity_arguments(p.oid) = 'p_limit integer';

  if v_def is null then
    raise exception 'expire_unpaid_orders function not found';
  end if;

  v_new_def := replace(
    v_def,
    $old$  loop
    begin
      if jsonb_typeof(ord.items)$old$,
    $new$  loop
    begin
      v_error := null;
      if jsonb_typeof(ord.items)$new$
  );

  v_new_def := replace(
    v_new_def,
    $old$      update public.orders
      set status='Expired',
          payment_status='Expired',
          review_status='Expired',
          requires_manual_review=false,
          expired_at=v_now,
          inventory_released_at=v_now,
          inventory_release_error=null,$old$,
    $new$      begin
        perform public.release_promo_redemptions_for_order(ord.id, v_now);
      exception when others then
        v_error := left(coalesce(v_error || '; ', '') || 'Promo redemption release failed: ' || sqlerrm,500);
      end;

      update public.orders
      set status='Expired',
          payment_status='Expired',
          review_status='Expired',
          requires_manual_review=false,
          expired_at=v_now,
          inventory_released_at=v_now,
          inventory_release_error=v_error,$new$
  );

  v_new_def := replace(
    v_new_def,
    $old$      update public.orders
      set status='Expired',
          payment_status='Expired',
          review_status='Expired',
          requires_manual_review=false,
          expired_at=v_now,
          inventory_released_at=null,$old$,
    $new$      begin
        perform public.release_promo_redemptions_for_order(ord.id, v_now);
      exception when others then
        v_error := left(coalesce(v_error || '; ', '') || 'Promo redemption release failed: ' || sqlerrm,500);
      end;

      update public.orders
      set status='Expired',
          payment_status='Expired',
          review_status='Expired',
          requires_manual_review=false,
          expired_at=v_now,
          inventory_released_at=null,$new$
  );

  if v_new_def = v_def then
    raise exception 'No expiry promo release logic was inserted';
  end if;

  execute v_new_def;
end
$patch$;

commit;
