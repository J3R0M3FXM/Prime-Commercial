alter table public.products
  add constraint products_stock_nonnegative check (stock >= 0);

create or replace function public.validate_product_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  variant jsonb;
  variant_stock bigint;
  variant_total bigint := 0;
begin
  if new.stock < 0 then
    raise exception 'Product stock cannot be negative';
  end if;

  if jsonb_typeof(new.bundle_config->'variants') = 'array'
     and jsonb_array_length(new.bundle_config->'variants') > 0 then
    for variant in
      select value
      from jsonb_array_elements(new.bundle_config->'variants')
    loop
      if not (variant ? 'stock') then
        raise exception 'Every product variant must define stock';
      end if;

      begin
        variant_stock := (variant->>'stock')::bigint;
      exception when others then
        raise exception 'Product variant stock must be an integer';
      end;

      if variant_stock < 0 then
        raise exception 'Product variant stock cannot be negative';
      end if;

      variant_total := variant_total + variant_stock;
    end loop;

    if variant_total <> new.stock then
      raise exception 'Product stock (%) must equal the sum of variant stock (%)', new.stock, variant_total;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_product_inventory on public.products;

create trigger trg_validate_product_inventory
before insert or update of stock, bundle_config
on public.products
for each row
execute function public.validate_product_inventory();

revoke execute on function public.validate_product_inventory() from public, anon, authenticated;
