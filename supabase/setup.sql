-- make-my-own-social — run once in the SQL editor of a NEW Supabase project.
-- Then sign up on the site with your own email and run the last statement
-- (at the bottom) to make that account the owner.

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'friend',
  is_owner boolean not null default false,
  is_close_friend boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid default auth.uid() references public.profiles on delete cascade,
  section text not null check (section in ('daily', 'ai', 'acting', 'work')),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'close')),
  caption text not null default '' check (char_length(caption) <= 4000),
  image_path text,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.likes (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  primary key (post_id, user_id)
);

-- ---------- helpers (private schema: not callable over the API) ----------
create schema if not exists private;
grant usage on schema private to anon, authenticated;
create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from profiles where id = auth.uid()), false)
$$;

create or replace function private.is_close() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner or is_close_friend from profiles where id = auth.uid()), false)
$$;

create or replace function private.can_see_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where id = p and (visibility = 'everyone' or private.is_close()))
$$;

-- new auth user -> profile row (name comes from the sign-up form)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'friend'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- people may rename themselves, but only the owner flips the flags
create or replace function private.guard_profile_flags() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.is_owner is distinct from old.is_owner then raise exception 'not allowed'; end if;
    if new.is_close_friend is distinct from old.is_close_friend and not private.is_owner() then
      raise exception 'only the owner can change close friends';
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_flags();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.likes    enable row level security;

create policy "profiles readable" on public.profiles for select using (true);
create policy "update self or owner" on public.profiles for update
  using (id = auth.uid() or private.is_owner()) with check (id = auth.uid() or private.is_owner());

create policy "see allowed posts" on public.posts for select
  using (visibility = 'everyone' or private.is_close());
create policy "owner writes posts" on public.posts for insert with check (private.is_owner() and author_id = auth.uid());
create policy "owner edits posts" on public.posts for update using (private.is_owner());
create policy "owner deletes posts" on public.posts for delete using (private.is_owner());

create policy "see comments on visible posts" on public.comments for select using (private.can_see_post(post_id));
create policy "members comment" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and private.can_see_post(post_id));
create policy "delete own or owner" on public.comments for delete using (user_id = auth.uid() or private.is_owner());

create policy "see likes on visible posts" on public.likes for select using (private.can_see_post(post_id));
create policy "members like" on public.likes for insert to authenticated
  with check (user_id = auth.uid() and private.can_see_post(post_id));
create policy "unlike own" on public.likes for delete using (user_id = auth.uid());

-- ---------- storage: one private bucket, read through signed URLs ----------
insert into storage.buckets (id, name, public) values ('media', 'media', false)
  on conflict (id) do nothing;

create policy "read media of visible posts" on storage.objects for select
  using (bucket_id = 'media' and (
    private.is_owner()
    or exists (select 1 from public.posts p where p.image_path = storage.objects.name
               and (p.visibility = 'everyone' or private.is_close()))
  ));
create policy "owner uploads media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.is_owner());
create policy "owner deletes media" on storage.objects for delete
  using (bucket_id = 'media' and private.is_owner());



-- people: the owner's list of friends' social sites (public to read)
create table public.people (
  url text primary key check (url ~ '^https://[a-z0-9.-]+$'),
  added_at timestamptz not null default now()
);
alter table public.people enable row level security;
create policy "people readable" on public.people for select using (true);
create policy "owner adds people" on public.people for insert with check (private.is_owner());
create policy "owner removes people" on public.people for delete using (private.is_owner());

-- posts can exist before the owner signs up (seeded photos)
alter table public.posts alter column author_id drop not null;

-- profiles: which site vouched for this person (set only by the server)
alter table public.profiles add column site_url text;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, site_url)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'friend'),
          nullif(new.raw_app_meta_data->>'site_url', ''));
  return new;
end $$;

create or replace function private.guard_profile_flags() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.is_owner is distinct from old.is_owner then raise exception 'not allowed'; end if;
    if new.site_url is distinct from old.site_url then raise exception 'not allowed'; end if;
    if new.is_close_friend is distinct from old.is_close_friend and not private.is_owner() then
      raise exception 'only the owner can change close friends';
    end if;
  end if;
  return new;
end $$;

-- one-time codes this site hands out when its owner logs in somewhere else
create table private.connect_codes (
  code text primary key,
  aud text not null,
  created_at timestamptz not null default now()
);

create or replace function public.create_connect_code(p_aud text) returns text
language plpgsql security definer set search_path = public, private, extensions as $$
declare c text;
begin
  if not private.is_owner() then raise exception 'only the owner can log in elsewhere'; end if;
  if p_aud !~ '^https://[a-z0-9.-]+$' then raise exception 'bad site address'; end if;
  delete from private.connect_codes where created_at < now() - interval '10 minutes';
  c := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.connect_codes (code, aud) values (c, p_aud);
  return c;
end $$;
revoke execute on function public.create_connect_code(text) from public, anon;
grant execute on function public.create_connect_code(text) to authenticated;

-- single use, two minutes, only for the site it was made for
create or replace function public.consume_connect_code(p_code text, p_aud text) returns json
language plpgsql security definer set search_path = public, private as $$
declare n text;
begin
  delete from private.connect_codes
   where code = p_code and aud = p_aud and created_at > now() - interval '2 minutes';
  if not found then return json_build_object('ok', false); end if;
  select display_name into n from profiles where is_owner order by created_at limit 1;
  return json_build_object('ok', true, 'name', n);
end $$;
revoke execute on function public.consume_connect_code(text, text) from public;
grant execute on function public.consume_connect_code(text, text) to anon, authenticated;


-- Where a post was also sent (Instagram, LinkedIn).
alter table public.posts add column if not exists shared_to jsonb not null default '{}'::jsonb;

-- ---------- last step: after you sign up on your site, make yourself the owner ----------
-- update public.profiles set is_owner = true
--   where id = (select id from auth.users where email = 'you@example.com');
