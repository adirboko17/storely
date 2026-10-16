-- A product that already appears on an order still has to be removable.
-- The order keeps its title and price; only the variant link is cleared.

create or replace function public.delete_store_products(target_store uuid, product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if product_ids is null or cardinality(product_ids) = 0 then
    raise exception 'לא נבחרו מוצרים' using errcode = '22023';
  end if;

  update public.order_items as item
  set variant_id = null
  from public.product_variants as variant_row
  where item.store_id = target_store
    and variant_row.store_id = target_store
    and item.variant_id = variant_row.id
    and variant_row.product_id = any (product_ids);

  delete from public.inventory_movements as movement
  using public.inventory_items as inventory, public.product_variants as variant_row
  where movement.store_id = target_store
    and inventory.store_id = target_store
    and variant_row.store_id = target_store
    and movement.inventory_item_id = inventory.id
    and inventory.variant_id = variant_row.id
    and variant_row.product_id = any (product_ids);

  delete from public.inventory_items as inventory
  using public.product_variants as variant_row
  where inventory.store_id = target_store
    and variant_row.store_id = target_store
    and inventory.variant_id = variant_row.id
    and variant_row.product_id = any (product_ids);

  delete from public.product_variants as variant_row
  where variant_row.store_id = target_store
    and variant_row.product_id = any (product_ids);

  delete from public.product_media as media
  where media.store_id = target_store
    and media.product_id = any (product_ids);

  delete from public.collection_products as link
  where link.store_id = target_store
    and link.product_id = any (product_ids);

  delete from public.products as product
  where product.store_id = target_store
    and product.id = any (product_ids);
  get diagnostics removed = row_count;

  if removed <> cardinality(product_ids) then
    raise exception 'המוצר לא נמצא' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_store_products(uuid, uuid[]) from public, anon;
grant execute on function public.delete_store_products(uuid, uuid[]) to authenticated;
