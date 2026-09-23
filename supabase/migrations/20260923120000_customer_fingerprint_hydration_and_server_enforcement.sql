begin;

alter table public.promo_redemptions
  add column if not exists hardware_id text,
  add column if not exists device_fingerprint_id text,
  add column if not exists server_fingerprint_id text;

create index if not exists promo_redemptions_active_hardware_idx
  on public.promo_redemptions (promo_id, hardware_id)
  where released_at is null and hardware_id is not null;

create index if not exists promo_redemptions_active_device_fp_idx
  on public.promo_redemptions (promo_id, device_fingerprint_id)
  where released_at is null and device_fingerprint_id is not null;

create index if not exists promo_redemptions_active_server_fp_idx
  on public.promo_redemptions (promo_id, server_fingerprint_id)
  where released_at is null and server_fingerprint_id is not null;

-- Backfill stable device and server fingerprints into existing customer telemetry.
update public.customers c
set fingerprints = rebuilt.fingerprints,
    updated_at = now()
from (
  select
    c2.id,
    jsonb_agg(
      fp || jsonb_build_object(
        'deviceFingerprintId',
        case
          when coalesce(fp->>'deviceId','') <> ''
            or coalesce(fp->>'hardwareId','') <> ''
            or coalesce(fp->>'platform','') <> ''
            or coalesce(fp->>'browser','') <> ''
            or coalesce(fp->>'screenResolution','') <> ''
          then 'DEVFP_' || substr(
            encode(
              digest(
                lower(concat_ws(
                  '|',
                  coalesce(fp->>'deviceId',''),
                  coalesce(fp->>'hardwareId',''),
                  coalesce(fp->>'browser',''),
                  coalesce(fp->>'platform',''),
                  coalesce(fp->>'screenResolution',''),
                  coalesce(fp->>'availScreen',''),
                  coalesce(fp->>'pixelRatio',''),
                  coalesce(fp->>'timezone',''),
                  coalesce(fp->>'language',''),
                  coalesce(fp->>'languages',''),
                  coalesce(fp->>'graphics',''),
                  coalesce(fp->>'vendor',''),
                  coalesce(fp->>'canvasHash',''),
                  coalesce(fp->>'hardwareConcurrency',''),
                  coalesce(fp->>'deviceMemory',''),
                  coalesce(fp->>'touchSupport','')
                )),
                'sha256'
              ),
              'hex'
            ),
            1, 32
          )
          else null
        end,
        'serverFingerprintId',
        case
          when coalesce(fp->>'ipSession','') <> ''
            or coalesce(fp->>'browser','') <> ''
          then 'SRVFP_' || substr(
            encode(
              digest(
                lower(concat_ws(
                  '|',
                  coalesce(fp->>'ipSession',''),
                  coalesce(fp->>'browser','')
                )),
                'sha256'
              ),
              'hex'
            ),
            1, 32
          )
          else null
        end
      )
      order by coalesce(fp->>'lastSeen', fp->>'createdAt', fp->>'capturedAt', fp->>'timestamp', '')
    ) as fingerprints
  from public.customers c2
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c2.fingerprints) = 'array' then c2.fingerprints else '[]'::jsonb end
  ) fp
  group by c2.id
) rebuilt
where c.id = rebuilt.id;

-- Hydrate historical order snapshots with identifiers already associated with the customer.
with matches as (
  select o.id, fp.fp
  from public.orders o
  join public.customers c on c.id = o.customer_id
  cross join lateral (
    select value as fp
    from jsonb_array_elements(case when jsonb_typeof(c.fingerprints)='array' then c.fingerprints else '[]'::jsonb end)
    where (o.fingerprint_snapshot->>'sessionToken' is not null and value->>'sessionToken' = o.fingerprint_snapshot->>'sessionToken')
       or (o.fingerprint_snapshot->>'deviceId' is not null and value->>'deviceId' = o.fingerprint_snapshot->>'deviceId')
    order by
      case
        when o.fingerprint_snapshot->>'sessionToken' is not null
         and value->>'sessionToken' = o.fingerprint_snapshot->>'sessionToken' then 0
        else 1
      end,
      coalesce(value->>'lastSeen',value->>'createdAt',value->>'capturedAt','') desc
    limit 1
  ) fp
  where jsonb_typeof(o.fingerprint_snapshot)='object'
)
update public.orders o
set fingerprint_snapshot = o.fingerprint_snapshot || jsonb_build_object(
      'hardwareId', coalesce(nullif(o.fingerprint_snapshot->>'hardwareId',''), matches.fp->>'hardwareId'),
      'deviceFingerprintId', coalesce(nullif(o.fingerprint_snapshot->>'deviceFingerprintId',''), matches.fp->>'deviceFingerprintId'),
      'serverFingerprintId', coalesce(nullif(o.fingerprint_snapshot->>'serverFingerprintId',''), matches.fp->>'serverFingerprintId')
    ),
    updated_at = greatest(o.updated_at, now())
from matches
where o.id = matches.id
  and matches.fp is not null;

update public.promo_redemptions pr
set hardware_id = coalesce(pr.hardware_id, nullif(trim(o.fingerprint_snapshot->>'hardwareId'), '')),
    device_fingerprint_id = coalesce(pr.device_fingerprint_id, nullif(trim(o.fingerprint_snapshot->>'deviceFingerprintId'), '')),
    server_fingerprint_id = coalesce(pr.server_fingerprint_id, nullif(trim(o.fingerprint_snapshot->>'serverFingerprintId'), ''))
from public.orders o
where pr.order_id = o.id;

create or replace function public.enforce_promo_device_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot jsonb;
  order_customer_id text;
  order_promo_code text;
  snapshot_device_id text;
  snapshot_hardware_id text;
  snapshot_device_fingerprint_id text;
  snapshot_server_fingerprint_id text;
begin
  if new.order_id is not null then
    select customer_id, applied_promo_code, fingerprint_snapshot
      into order_customer_id, order_promo_code, snapshot
    from public.orders
    where id = new.order_id;

    if order_customer_id is not null then
      new.customer_id := order_customer_id;
    end if;

    if nullif(trim(coalesce(order_promo_code,'')), '') is not null then
      new.promo_code := upper(trim(order_promo_code));
      select id into new.promo_id
      from public.promos
      where upper(code)=upper(trim(order_promo_code))
      limit 1;
    elsif new.promo_code is null or nullif(trim(new.promo_code), '') is null then
      raise exception 'Promo redemption must reference an order with a promo code' using errcode='P0001';
    end if;

    if jsonb_typeof(snapshot)='object' then
      snapshot_device_id := nullif(trim(coalesce(snapshot->>'deviceId','')), '');
      snapshot_hardware_id := nullif(trim(coalesce(snapshot->>'hardwareId','')), '');
      snapshot_device_fingerprint_id := nullif(trim(coalesce(snapshot->>'deviceFingerprintId','')), '');
      snapshot_server_fingerprint_id := nullif(trim(coalesce(snapshot->>'serverFingerprintId','')), '');

      new.device_id := coalesce(snapshot_device_id, nullif(trim(new.device_id), ''));
      new.hardware_id := coalesce(snapshot_hardware_id, nullif(trim(new.hardware_id), ''));
      new.device_fingerprint_id := coalesce(snapshot_device_fingerprint_id, nullif(trim(new.device_fingerprint_id), ''));
      new.server_fingerprint_id := coalesce(snapshot_server_fingerprint_id, nullif(trim(new.server_fingerprint_id), ''));
    end if;
  end if;

  if new.promo_id is not null and new.customer_id is not null then
    if exists (
      select 1
      from public.promo_redemptions r
      where r.promo_id = new.promo_id
        and r.released_at is null
        and r.customer_id is distinct from new.customer_id
        and (
          (new.device_fingerprint_id is not null and r.device_fingerprint_id = new.device_fingerprint_id)
          or (new.hardware_id is not null and r.hardware_id = new.hardware_id)
          or (new.device_id is not null and r.device_id = new.device_id)
          or (
            new.device_fingerprint_id is null
            and new.hardware_id is null
            and new.device_id is null
            and new.server_fingerprint_id is not null
            and r.server_fingerprint_id = new.server_fingerprint_id
          )
        )
    ) then
      raise exception 'Promo abuse detected: this promo code has already been claimed from the same device fingerprint'
        using errcode='P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_promo_device_fingerprint on public.promo_redemptions;

create trigger trg_enforce_promo_device_fingerprint
before insert on public.promo_redemptions
for each row
execute function public.enforce_promo_device_fingerprint();

revoke execute on function public.enforce_promo_device_fingerprint() from public, anon, authenticated;
grant execute on function public.enforce_promo_device_fingerprint() to service_role;

commit;
