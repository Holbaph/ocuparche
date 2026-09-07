-- Ocuparche — esquema de base de datos (Supabase / Postgres)
-- Pega todo este archivo en Supabase → SQL Editor → New query → Run.
-- Es seguro volver a correrlo si algo falló a mitad de camino.
--
-- Modelo (multi-cuenta / freemium):
--   cuentas     — una por cada admin que se registra solo. Tiene un plan
--                 ('free' o 'completo') que se activa con un código.
--   profiles    — una fila por persona (admin o invitado), siempre ligada a
--                 una cuenta. es_dueño=true solo para la cuenta del negocio
--                 (la única que puede generar códigos de activación).
--   pacientes   — los hij@s en tratamiento, uno o varios por cuenta.
--   registros   — un registro por paciente y día: qué ojo y a qué hora.
--   configuracion — duración del parche, una fila por paciente.
--   push_subscriptions — dispositivos suscritos a avisos, por persona.
--   codigos_activacion — códigos de un solo uso que activan el plan completo.

create extension if not exists "pgcrypto";

-- ---------- cuentas ----------
create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','completo')),
  activado_en timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cuentas enable row level security;

drop policy if exists "cuentas: ver la propia" on public.cuentas;
create policy "cuentas: ver la propia" on public.cuentas
  for select using (
    admin_id = auth.uid()
    or id = (select cuenta_id from public.profiles where id = auth.uid())
  );
-- No hay policy de insert/update/delete para cuentas: se crean solo desde el
-- trigger de alta (handle_new_user) y se actualizan solo desde las Edge
-- Functions (con service role) al invitar o redimir un código.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  email text not null,
  nombre text not null,
  role text not null default 'admin' check (role in ('admin','user')),
  es_dueño boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists profiles_cuenta_idx on public.profiles (cuenta_id);

alter table public.profiles enable row level security;

-- Función auxiliar: la cuenta de quien llama. SECURITY DEFINER a propósito:
-- una política de profiles que consultara profiles directamente para saber
-- "mi cuenta" caería en recursión de RLS: esta función corre con permisos
-- de su dueña (sin RLS) y corta ese ciclo. La usan también las políticas de
-- pacientes/registros/configuracion más abajo.
create or replace function public.mi_cuenta_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select cuenta_id from public.profiles where id = auth.uid()
$$;

drop policy if exists "profiles: ver mi cuenta" on public.profiles;
create policy "profiles: ver mi cuenta" on public.profiles
  for select using (cuenta_id = public.mi_cuenta_id());

drop policy if exists "profiles: editar mi propia fila" on public.profiles;
create policy "profiles: editar mi propia fila" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Alta: cada auth.users nuevo crea su perfil. Si trae cuenta_id en los
-- metadatos (lo pone la Edge Function invite-user), se une a esa cuenta como
-- 'user'; si no, es un alta libre y se crea una cuenta nueva de la que queda
-- como 'admin'. El correo del dueño del negocio queda marcado es_dueño.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_cuenta_id uuid;
  v_role text;
begin
  v_cuenta_id := nullif(new.raw_user_meta_data->>'cuenta_id', '')::uuid;

  if v_cuenta_id is null then
    insert into public.cuentas (admin_id) values (new.id) returning id into v_cuenta_id;
    v_role := 'admin';
  else
    v_role := 'user';
  end if;

  insert into public.profiles (id, cuenta_id, email, nombre, role, es_dueño)
  values (
    new.id,
    v_cuenta_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    v_role,
    (lower(new.email) = 'phernandez@softcorp.cl')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- pacientes ----------
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

create index if not exists pacientes_cuenta_idx on public.pacientes (cuenta_id);

alter table public.pacientes enable row level security;

drop policy if exists "pacientes: acceso por cuenta" on public.pacientes;
create policy "pacientes: acceso por cuenta" on public.pacientes
  for all using (cuenta_id = public.mi_cuenta_id())
  with check (cuenta_id = public.mi_cuenta_id());

-- Límite del plan gratis: 1 solo paciente por cuenta. Un trigger (no la RLS)
-- porque así el conteo es siempre exacto, sin ambigüedades de orden.
create or replace function public.check_limite_pacientes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
  v_count int;
begin
  select plan into v_plan from public.cuentas where id = new.cuenta_id;
  select count(*) into v_count from public.pacientes where cuenta_id = new.cuenta_id;
  if coalesce(v_plan, 'free') <> 'completo' and v_count >= 1 then
    raise exception 'plan_gratis_limite_pacientes';
  end if;
  return new;
end;
$$;

drop trigger if exists before_insert_paciente_limite on public.pacientes;
create trigger before_insert_paciente_limite
  before insert on public.pacientes
  for each row execute function public.check_limite_pacientes();

-- ---------- registros ----------
create table if not exists public.registros (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  fecha date not null,
  ojo text not null check (ojo in ('derecho','izquierdo')),
  hora timestamptz not null default now(),
  registrado_por uuid references public.profiles(id) on delete set null,
  notificado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (paciente_id, fecha)
);

create index if not exists registros_paciente_fecha_idx on public.registros (paciente_id, fecha desc);

alter table public.registros enable row level security;

drop policy if exists "registros: acceso por cuenta" on public.registros;
create policy "registros: acceso por cuenta" on public.registros
  for all using (
    exists (select 1 from public.pacientes p where p.id = paciente_id and p.cuenta_id = public.mi_cuenta_id())
  )
  with check (
    exists (select 1 from public.pacientes p where p.id = paciente_id and p.cuenta_id = public.mi_cuenta_id())
  );

-- ---------- configuracion (duración del parche, por paciente) ----------
create table if not exists public.configuracion (
  paciente_id uuid primary key references public.pacientes(id) on delete cascade,
  duracion_minutos int not null default 120 check (duracion_minutos > 0),
  updated_at timestamptz not null default now()
);

alter table public.configuracion enable row level security;

drop policy if exists "configuracion: acceso por cuenta" on public.configuracion;
create policy "configuracion: acceso por cuenta" on public.configuracion
  for all using (
    exists (select 1 from public.pacientes p where p.id = paciente_id and p.cuenta_id = public.mi_cuenta_id())
  )
  with check (
    exists (select 1 from public.pacientes p where p.id = paciente_id and p.cuenta_id = public.mi_cuenta_id())
  );

-- ---------- push_subscriptions (una por dispositivo) ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: cada quien las suyas" on public.push_subscriptions;
create policy "push_subscriptions: cada quien las suyas" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- codigos_activacion ----------
create table if not exists public.codigos_activacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  usado boolean not null default false,
  usado_por_cuenta uuid references public.cuentas(id),
  usado_en timestamptz,
  nota text,
  creado_por uuid references public.profiles(id),
  creado_en timestamptz not null default now()
);

alter table public.codigos_activacion enable row level security;

-- Solo el dueño del negocio (es_dueño=true) puede ver y generar códigos.
-- Nadie puede "canjear" uno directamente por acá — eso lo hace la Edge
-- Function redimir-codigo con la service role, para poder tocar la cuenta de
-- OTRA persona (activar su plan) sin abrirle ese permiso a todo el mundo.
drop policy if exists "codigos: solo el dueño" on public.codigos_activacion;
create policy "codigos: solo el dueño" on public.codigos_activacion
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and es_dueño = true)
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and es_dueño = true)
  );

-- ---------- realtime ----------
-- Sin esto, la sincronización en vivo entre dispositivos no avisa cambios
-- (ver el mismo problema que tuvimos en Ojitos de Mili). Se puede hacer
-- también a mano en Database → Replication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registros'
  ) then
    alter publication supabase_realtime add table public.registros;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pacientes'
  ) then
    alter publication supabase_realtime add table public.pacientes;
  end if;
end $$;
