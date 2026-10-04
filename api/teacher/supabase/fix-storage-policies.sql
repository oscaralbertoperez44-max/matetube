-- Corrección para Supabase Storage: evita comparar text con uuid.
-- Ejecutá este archivo una vez en SQL Editor si schema.sql mostró ERROR 42883.

drop policy if exists "Docentes actualizan sus archivos" on storage.objects;
create policy "Docentes actualizan sus archivos" on storage.objects for update using (
  bucket_id = 'videos' and owner_id::text = auth.uid()::text
);

drop policy if exists "Docentes eliminan sus archivos" on storage.objects;
create policy "Docentes eliminan sus archivos" on storage.objects for delete using (
  bucket_id = 'videos' and owner_id::text = auth.uid()::text
);
