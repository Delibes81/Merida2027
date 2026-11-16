-- Mérida 2027 · esquema de la base de datos
--
-- Cómo usarlo: en Supabase abre SQL Editor, pega este archivo completo y dale Run.
-- Se puede correr varias veces sin romper nada.
--
-- Después de correrlo, define el código del grupo (una sola vez, en el mismo editor):
--
--     select set_trip_code('elige-un-codigo-largo');
--
-- Ese código es lo que cada quien escribe para entrar. No lo guardes en el repositorio.

-- ─────────────────────────────── Tablas ───────────────────────────────

create table if not exists public.members (
  id    text primary key,
  name  text not null,
  adult boolean not null default true,
  sort  int not null default 0
);

-- Un dispositivo (sesión anónima de Supabase) ligado a una persona del grupo.
create table if not exists public.devices (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  member_id text not null references public.members (id),
  joined_at timestamptz not null default now()
);

-- Código del grupo. Nadie puede leer esta tabla desde la página.
create table if not exists public.trip_secret (
  id   boolean primary key default true check (id),
  code text not null
);

create table if not exists public.todos (
  id         text primary key,
  done       boolean not null default false,
  done_by    text references public.members (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.flights (
  member_id  text primary key references public.members (id),
  arr_date   date,
  arr_time   time,
  arr_flight text check (char_length(arr_flight) <= 20),
  dep_date   date,
  dep_time   time,
  dep_flight text check (char_length(dep_flight) <= 20),
  updated_by text references public.members (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  concept    text not null check (char_length(concept) between 1 and 80),
  amount     numeric(10, 2) not null check (amount > 0),
  paid_by    text not null references public.members (id),
  split      text[] not null check (cardinality(split) > 0),
  created_by text not null references public.members (id),
  created_at timestamptz not null default now()
);

create table if not exists public.rsvps (
  activity   text not null check (char_length(activity) <= 40),
  member_id  text not null references public.members (id),
  created_at timestamptz not null default now(),
  primary key (activity, member_id)
);

-- ─────────────────────────────── El grupo ───────────────────────────────

insert into public.members (id, name, adult, sort) values
  ('liliana', 'Liliana', true, 1),
  ('delibes', 'Delibes', true, 2),
  ('alex',    'Alex',    false, 3),
  ('jorge',   'Jorge',   true, 4),
  ('zamy',    'Zamy',    true, 5),
  ('chang',   'Chang',   true, 6),
  ('sonia',   'Sonia',   true, 7),
  ('takeshi', 'Takeshi', true, 8),
  ('caro',    'Caro',    true, 9),
  ('lore',    'Lore',    true, 10)
on conflict (id) do update set name = excluded.name, adult = excluded.adult, sort = excluded.sort;

-- ─────────────────────────────── Funciones ───────────────────────────────

-- Quién es la persona detrás de la sesión actual (null si no ha entrado).
create or replace function public.my_member()
returns text
language sql stable security definer
set search_path = public
as $$
  select member_id from public.devices where user_id = auth.uid()
$$;

-- Entrar al grupo: valida el código y liga este dispositivo a una persona.
create or replace function public.join_trip(p_code text, p_member text)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sin_sesion';
  end if;
  if not exists (
    select 1 from public.trip_secret
    where lower(btrim(code)) = lower(btrim(coalesce(p_code, '')))
  ) then
    perform pg_sleep(1);  -- frena los intentos a ciegas
    raise exception 'codigo_incorrecto';
  end if;
  if not exists (select 1 from public.members where id = p_member) then
    raise exception 'persona_desconocida';
  end if;
  insert into public.devices (user_id, member_id)
  values (auth.uid(), p_member)
  on conflict (user_id) do update set member_id = excluded.member_id, joined_at = now();
  return p_member;
end
$$;

-- Salir en este dispositivo.
create or replace function public.leave_trip()
returns void
language sql security definer
set search_path = public
as $$
  delete from public.devices where user_id = auth.uid()
$$;

-- Definir o cambiar el código del grupo. Solo corre desde el SQL Editor.
create or replace function public.set_trip_code(p_code text)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if char_length(btrim(coalesce(p_code, ''))) < 6 then
    raise exception 'El código debe tener al menos 6 caracteres';
  end if;
  insert into public.trip_secret (id, code) values (true, btrim(p_code))
  on conflict (id) do update set code = excluded.code;
  return 'Código guardado';
end
$$;

revoke all on function public.set_trip_code(text) from public, anon, authenticated;
revoke all on function public.join_trip(text, text) from public, anon;
revoke all on function public.leave_trip() from public, anon;
revoke all on function public.my_member() from public, anon;
grant execute on function public.join_trip(text, text) to authenticated;
grant execute on function public.leave_trip() to authenticated;
grant execute on function public.my_member() to authenticated;

-- ─────────────────────────────── Permisos ───────────────────────────────
-- Todo queda cerrado salvo para quien ya entró con el código.

alter table public.members     enable row level security;
alter table public.devices     enable row level security;
alter table public.trip_secret enable row level security;
alter table public.todos       enable row level security;
alter table public.flights     enable row level security;
alter table public.expenses    enable row level security;
alter table public.rsvps       enable row level security;

revoke all on public.members, public.devices, public.trip_secret, public.todos,
              public.flights, public.expenses, public.rsvps from anon;
revoke all on public.trip_secret from authenticated;

grant select                 on public.members  to authenticated;
grant select                 on public.devices  to authenticated;
grant select, insert, update on public.todos    to authenticated;
grant select, insert, update on public.flights  to authenticated;
grant select, insert, delete on public.expenses to authenticated;
grant select, insert, delete on public.rsvps    to authenticated;

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (public.my_member() is not null);

drop policy if exists devices_own on public.devices;
create policy devices_own on public.devices for select to authenticated
  using (user_id = auth.uid());

drop policy if exists todos_read on public.todos;
create policy todos_read on public.todos for select to authenticated
  using (public.my_member() is not null);
drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos for insert to authenticated
  with check (public.my_member() is not null);
drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos for update to authenticated
  using (public.my_member() is not null) with check (public.my_member() is not null);

-- Cualquiera del grupo puede capturar el vuelo de otra persona (familias, parejas).
drop policy if exists flights_read on public.flights;
create policy flights_read on public.flights for select to authenticated
  using (public.my_member() is not null);
drop policy if exists flights_insert on public.flights;
create policy flights_insert on public.flights for insert to authenticated
  with check (updated_by = public.my_member());
drop policy if exists flights_update on public.flights;
create policy flights_update on public.flights for update to authenticated
  using (public.my_member() is not null) with check (updated_by = public.my_member());

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (public.my_member() is not null);
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (created_by = public.my_member());
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (created_by = public.my_member());

drop policy if exists rsvps_read on public.rsvps;
create policy rsvps_read on public.rsvps for select to authenticated
  using (public.my_member() is not null);
drop policy if exists rsvps_insert on public.rsvps;
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (member_id = public.my_member());
drop policy if exists rsvps_delete on public.rsvps;
create policy rsvps_delete on public.rsvps for delete to authenticated
  using (member_id = public.my_member());

-- ─────────────────────────────── Tiempo real ───────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['todos', 'flights', 'expenses', 'rsvps'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
