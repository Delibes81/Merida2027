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
  id        text primary key,
  name      text not null,
  adult     boolean not null default true,
  household text not null,  -- con quién hace cuentas: pareja o por su cuenta
  with_from date not null default '2027-02-25',  -- días que pasa con el grupo
  with_to   date not null default '2027-03-02',
  sort      int not null default 0
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

-- Datos de cada hospedaje (anuncio, dirección, horarios, costo).
create table if not exists public.stays (
  id         text primary key,  -- 'camioneta', 'hacienda', 'chuburna' o 'merida'
  name       text check (char_length(name) <= 80),
  url        text check (url is null or (char_length(url) <= 500 and url ~* '^https?://')),
  address    text check (char_length(address) <= 200),
  checkin    time,
  checkout   time,
  total      numeric(10, 2) check (total is null or total >= 0),
  booked_by  text references public.members (id),
  notes      text check (char_length(notes) <= 600),
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

insert into public.members (id, name, adult, household, with_to, sort) values
  ('liliana', 'Liliana', true,  'dl',      '2027-03-02', 1),
  ('delibes', 'Delibes', true,  'dl',      '2027-03-02', 2),
  ('alex',    'Alex',    false, 'dl',      '2027-03-02', 3),  -- en la base por si vuelve; la página no lo muestra
  ('jorge',   'Jorge',   true,  'jz',      '2027-03-02', 4),
  ('zamy',    'Zamy',    true,  'jz',      '2027-03-02', 5),
  ('chang',   'Chang',   true,  'cs',      '2027-03-02', 6),
  ('sonia',   'Sonia',   true,  'cs',      '2027-03-02', 7),
  ('takeshi', 'Takeshi', true,  'takeshi', '2027-02-28', 8),  -- se va el domingo
  ('caro',    'Caro',    true,  'caro',    '2027-03-02', 9),
  ('lore',    'Lore',    true,  'lore',    '2027-03-02', 10)
on conflict (id) do update set name = excluded.name, adult = excluded.adult,
  household = excluded.household, with_to = excluded.with_to, sort = excluded.sort;

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
alter table public.stays       enable row level security;

revoke all on public.members, public.devices, public.trip_secret, public.todos,
              public.flights, public.expenses, public.rsvps, public.stays from anon;
revoke all on public.trip_secret from authenticated;

grant select                 on public.members  to authenticated;
grant select                 on public.devices  to authenticated;
grant select, insert, update on public.todos    to authenticated;
grant select, insert, update, delete on public.flights to authenticated;
grant select, insert, update on public.stays    to authenticated;
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

-- Cualquiera del grupo puede capturar el vuelo de otra persona (parejas).
drop policy if exists flights_read on public.flights;
create policy flights_read on public.flights for select to authenticated
  using (public.my_member() is not null);
drop policy if exists flights_insert on public.flights;
create policy flights_insert on public.flights for insert to authenticated
  with check (updated_by = public.my_member());
drop policy if exists flights_update on public.flights;
create policy flights_update on public.flights for update to authenticated
  using (public.my_member() is not null) with check (updated_by = public.my_member());

drop policy if exists flights_delete on public.flights;
create policy flights_delete on public.flights for delete to authenticated
  using (public.my_member() is not null);

drop policy if exists stays_read on public.stays;
create policy stays_read on public.stays for select to authenticated
  using (public.my_member() is not null);
drop policy if exists stays_insert on public.stays;
create policy stays_insert on public.stays for insert to authenticated
  with check (updated_by = public.my_member());
drop policy if exists stays_update on public.stays;
create policy stays_update on public.stays for update to authenticated
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

-- ─────────────────── Avisos, pendientes personales, documentos y cuentas ───────────────────

-- Las reservas incluyen la camioneta además de los tres hospedajes.
alter table public.stays drop constraint if exists stays_id_check;
alter table public.stays add constraint stays_id_check
  check (id in ('camioneta', 'hacienda', 'chuburna', 'merida'));

-- Pendientes que cada quien marca por su cuenta (confirmar, vuelo, cabaña).
create table if not exists public.todo_checks (
  todo_id    text not null check (char_length(todo_id) <= 40),
  member_id  text not null references public.members (id),
  created_at timestamptz not null default now(),
  primary key (todo_id, member_id)
);

-- Muro de avisos.
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 1 and 500),
  author     text not null references public.members (id),
  created_at timestamptz not null default now()
);

-- Documentos del viaje. El archivo vive en Storage (bucket privado "viaje").
create table if not exists public.docs (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null check (ref in ('camioneta', 'hacienda', 'chuburna', 'merida', 'general')),
  title       text not null check (char_length(title) between 1 and 80),
  path        text not null unique check (char_length(path) <= 200),
  mime        text,
  size        int,
  uploaded_by text not null references public.members (id),
  created_at  timestamptz not null default now()
);

-- Un gasto puede traer el monto exacto de cada quien (cuentas divididas por consumo).
alter table public.expenses add column if not exists shares jsonb;

-- Cuentas para dividir por consumo: la cuenta, sus renglones y quién pidió cada uno.
create table if not exists public.tickets (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 80),
  paid_by    text not null references public.members (id),
  tip        numeric(10, 2) not null default 0 check (tip >= 0),
  expense_id uuid references public.expenses (id) on delete set null,  -- con gasto = cuenta cerrada
  created_by text not null references public.members (id),
  created_at timestamptz not null default now()
);
create table if not exists public.ticket_items (
  id        uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 80),
  amount    numeric(10, 2) not null check (amount > 0),
  sort      int not null default 0
);
create table if not exists public.ticket_claims (
  item_id   uuid not null references public.ticket_items (id) on delete cascade,
  member_id text not null references public.members (id),
  primary key (item_id, member_id)
);

alter table public.todo_checks   enable row level security;
alter table public.posts         enable row level security;
alter table public.docs          enable row level security;
alter table public.tickets       enable row level security;
alter table public.ticket_items  enable row level security;
alter table public.ticket_claims enable row level security;

revoke all on public.todo_checks, public.posts, public.docs, public.tickets,
              public.ticket_items, public.ticket_claims from anon;
grant select, insert, delete         on public.todo_checks   to authenticated;
grant select, insert, delete         on public.posts         to authenticated;
grant select, insert, delete         on public.docs          to authenticated;
grant select, insert, update, delete on public.tickets       to authenticated;
grant select, insert, delete         on public.ticket_items  to authenticated;
grant select, insert, delete         on public.ticket_claims to authenticated;

drop policy if exists todo_checks_read on public.todo_checks;
create policy todo_checks_read on public.todo_checks for select to authenticated
  using (public.my_member() is not null);
drop policy if exists todo_checks_insert on public.todo_checks;
create policy todo_checks_insert on public.todo_checks for insert to authenticated
  with check (member_id = public.my_member());
drop policy if exists todo_checks_delete on public.todo_checks;
create policy todo_checks_delete on public.todo_checks for delete to authenticated
  using (member_id = public.my_member());

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
  using (public.my_member() is not null);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (author = public.my_member());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (author = public.my_member());

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated
  using (public.my_member() is not null);
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated
  with check (uploaded_by = public.my_member());
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated
  using (uploaded_by = public.my_member());

drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated
  using (public.my_member() is not null);
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (created_by = public.my_member());
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (public.my_member() is not null) with check (public.my_member() is not null);
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated
  using (created_by = public.my_member());

-- Renglones y quién pidió qué: cualquiera del grupo los ajusta (también por alguien sin celular a la mano).
drop policy if exists ticket_items_all on public.ticket_items;
create policy ticket_items_all on public.ticket_items for all to authenticated
  using (public.my_member() is not null) with check (public.my_member() is not null);
drop policy if exists ticket_claims_all on public.ticket_claims;
create policy ticket_claims_all on public.ticket_claims for all to authenticated
  using (public.my_member() is not null) with check (public.my_member() is not null);

-- Archivos: bucket privado, 10 MB por archivo, solo PDF e imágenes, solo para el grupo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('viaje', 'viaje', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists viaje_read on storage.objects;
create policy viaje_read on storage.objects for select to authenticated
  using (bucket_id = 'viaje' and public.my_member() is not null);
drop policy if exists viaje_insert on storage.objects;
create policy viaje_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'viaje' and public.my_member() is not null);
drop policy if exists viaje_delete on storage.objects;
create policy viaje_delete on storage.objects for delete to authenticated
  using (bucket_id = 'viaje' and public.my_member() is not null);

-- ─────────────────────────────── Tiempo real ───────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['todos', 'flights', 'expenses', 'rsvps', 'stays', 'todo_checks',
                           'posts', 'docs', 'tickets', 'ticket_items', 'ticket_claims'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
