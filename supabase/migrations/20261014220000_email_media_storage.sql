insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-media',
  'email-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists email_media_insert on storage.objects;
drop policy if exists email_media_select on storage.objects;
drop policy if exists email_media_update on storage.objects;
drop policy if exists email_media_delete on storage.objects;

create policy email_media_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'email-media' and private.can_write_product_media(name));

create policy email_media_select on storage.objects
for select to authenticated
using (bucket_id = 'email-media' and private.can_write_product_media(name));

create policy email_media_update on storage.objects
for update to authenticated
using (bucket_id = 'email-media' and private.can_write_product_media(name))
with check (bucket_id = 'email-media' and private.can_write_product_media(name));

create policy email_media_delete on storage.objects
for delete to authenticated
using (bucket_id = 'email-media' and private.can_write_product_media(name));
