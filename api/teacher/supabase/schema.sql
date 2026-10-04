-- MateTube · esquema inicial para Supabase
-- Ejecutá este archivo completo desde Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Estudiante',
  bio text not null default 'Aprendiendo matemática en MateTube.',
  avatar_color text not null default '#6ea8fe',
  is_teacher boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 60),
  constraint profiles_bio_length check (char_length(bio) <= 360)
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text not null default 'Matemática',
  grade text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  media_path text not null unique,
  media_url text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_title_length check (char_length(title) between 1 and 110),
  constraint videos_subject_length check (char_length(subject) <= 50),
  constraint videos_grade_length check (char_length(grade) <= 40),
  constraint videos_description_length check (char_length(description) <= 1000),
  constraint videos_tags_limit check (cardinality(tags) <= 8)
);

create index if not exists videos_public_created_idx on public.videos (visibility, created_at desc);
create index if not exists videos_owner_idx on public.videos (owner_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists comments_video_created_idx on public.comments (video_id, created_at asc);

create table if not exists public.video_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table if not exists public.channel_subscriptions (
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, channel_id),
  constraint no_self_subscription check (subscriber_id <> channel_id)
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 70),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, title)
);

create table if not exists public.playlist_items (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (playlist_id, video_id)
);

create table if not exists public.watch_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  watched_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists videos_touch_updated_at on public.videos;
create trigger videos_touch_updated_at before update on public.videos
for each row execute function public.touch_updated_at();
drop trigger if exists playlists_touch_updated_at on public.playlists;
create trigger playlists_touch_updated_at before update on public.playlists
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data ->> 'full_name', 60), ''), nullif(left(split_part(new.email, '@', 1), 60), ''), 'Estudiante')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Crear el perfil de los usuarios que ya existieran al ejecutar la migración.
insert into public.profiles (id, display_name)
select id, coalesce(nullif(left(raw_user_meta_data ->> 'full_name', 60), ''), nullif(left(split_part(email, '@', 1), 60), ''), 'Estudiante')
from auth.users
on conflict (id) do nothing;

-- Bucket público: los videos se leen por URL, pero solo docentes cargan en su propia carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 104857600, array['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.comments enable row level security;
alter table public.video_likes enable row level security;
alter table public.channel_subscriptions enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.watch_history enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Perfiles públicos" on public.profiles;
create policy "Perfiles públicos" on public.profiles for select using (true);
revoke update on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_color) on public.profiles to authenticated;
drop policy if exists "Editar perfil propio sin cambiar rol" on public.profiles;
create policy "Editar perfil propio sin cambiar rol" on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Ver videos públicos o propios" on public.videos;
create policy "Ver videos públicos o propios" on public.videos for select using (visibility = 'public' or auth.uid() = owner_id);
drop policy if exists "Docentes publican sus videos" on public.videos;
create policy "Docentes publican sus videos" on public.videos for insert
with check (auth.uid() = owner_id and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_teacher));
drop policy if exists "Docentes editan sus videos" on public.videos;
create policy "Docentes editan sus videos" on public.videos for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_teacher));
drop policy if exists "Docentes eliminan sus videos" on public.videos;
create policy "Docentes eliminan sus videos" on public.videos for delete using (auth.uid() = owner_id);

drop policy if exists "Leer comentarios de videos públicos" on public.comments;
create policy "Leer comentarios de videos públicos" on public.comments for select using (exists (select 1 from public.videos v where v.id = video_id and (v.visibility = 'public' or v.owner_id = auth.uid())));
drop policy if exists "Crear comentarios propios" on public.comments;
create policy "Crear comentarios propios" on public.comments for insert with check (
  auth.uid() = author_id
  and exists (select 1 from public.videos v where v.id = video_id and v.visibility = 'public')
);
drop policy if exists "Eliminar comentarios propios" on public.comments;
create policy "Eliminar comentarios propios" on public.comments for delete using (auth.uid() = author_id);

drop policy if exists "Gestionar likes propios" on public.video_likes;
create policy "Gestionar likes propios" on public.video_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Gestionar suscripciones propias" on public.channel_subscriptions;
create policy "Gestionar suscripciones propias" on public.channel_subscriptions for all using (auth.uid() = subscriber_id) with check (auth.uid() = subscriber_id);
drop policy if exists "Gestionar playlists propias" on public.playlists;
create policy "Gestionar playlists propias" on public.playlists for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Gestionar items de playlists propias" on public.playlist_items;
create policy "Gestionar items de playlists propias" on public.playlist_items for all using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
drop policy if exists "Gestionar historial propio" on public.watch_history;
create policy "Gestionar historial propio" on public.watch_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Crear reportes propios" on public.reports;
create policy "Crear reportes propios" on public.reports for insert with check (auth.uid() = reporter_id);

drop policy if exists "Lectura pública de videos" on storage.objects;
create policy "Lectura pública de videos" on storage.objects for select using (bucket_id = 'videos');
drop policy if exists "Docentes suben en su carpeta" on storage.objects;
create policy "Docentes suben en su carpeta" on storage.objects for insert with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_teacher)
);
drop policy if exists "Docentes actualizan sus archivos" on storage.objects;
create policy "Docentes actualizan sus archivos" on storage.objects for update using (
  bucket_id = 'videos' and owner_id::text = auth.uid()::text
);
drop policy if exists "Docentes eliminan sus archivos" on storage.objects;
create policy "Docentes eliminan sus archivos" on storage.objects for delete using (
  bucket_id = 'videos' and owner_id::text = auth.uid()::text
);

create or replace function public.record_video_view(p_video_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.videos set view_count = view_count + 1 where id = p_video_id and visibility = 'public';
end;
$$;
grant execute on function public.record_video_view(uuid) to anon, authenticated;
