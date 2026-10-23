-- =====================================================================================================
-- OFICINA VIRTUAL · esquema completo de Supabase (pega TODO este archivo en Supabase → SQL Editor → Run).
-- Es idempotente: puedes ejecutarlo más de una vez. No contiene datos de ningún proyecto.
--
-- DESPUÉS de ejecutarlo, añade tu correo como administrador (UNA vez, con el mismo correo que OWNER_EMAIL):
--     insert into public.oficina_admins (email) values ('tu-correo@ejemplo.com');
-- =====================================================================================================

-- ===== 0) Administradores de la oficina =====
create table if not exists public.oficina_admins (email text primary key check (email = lower(email)));
alter table public.oficina_admins enable row level security;   -- sin políticas: solo la función de abajo lee la tabla
revoke all on public.oficina_admins from anon, authenticated;
create or replace function public.oficina_is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.oficina_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;
revoke all on function public.oficina_is_admin() from public, anon;
grant execute on function public.oficina_is_admin() to authenticated, service_role;

-- ===== Leads (opcional: la cabra analista de leads los lee; vacía por defecto) =====
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  type text, payload jsonb not null default '{}'::jsonb, status text not null default 'nuevo', score int,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select to authenticated using (public.oficina_is_admin());

-- ===== TODO_CORRER_87_A_91_OFICINA_TODO =====

-- ===== 87_OFICINA =====
-- SQL 87 · Oficina virtual (Dirección + CIRO + agentes). Se puede ejecutar varias veces.
-- Solo el administrador (CEO) ve sus tareas. Crear y cambiar de estado solo por funciones que validan las transiciones; nadie puede "completar" sin resultado.
create table if not exists public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  instruccion text not null check (char_length(instruccion) between 1 and 2000),
  agente text not null check (char_length(agente) between 2 and 40),
  area text not null check (area in ('direccion','estrategia','tecnologia','crecimiento')),
  nivel text not null check (nivel in ('A','B','C','D')),
  estado text not null check (estado in ('pendiente','planificada','en_curso','en_revision','requiere_aprobacion','completada','bloqueada','fallida','cancelada')),
  resultado text check (resultado is null or char_length(resultado) <= 20000),
  error text check (error is null or char_length(error) <= 300),
  canal text not null default 'interno' check (canal in ('interno','whatsapp','telefono','email')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists office_tasks_owner_idx on public.office_tasks(owner, created_at desc);
create table if not exists public.office_log (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.office_tasks(id) on delete set null,
  evento text not null check (char_length(evento) <= 60),
  detalle text check (detalle is null or char_length(detalle) <= 300),
  at timestamptz not null default now()
);
create index if not exists office_log_owner_idx on public.office_log(owner, at desc);
alter table public.office_tasks enable row level security;
alter table public.office_log enable row level security;
drop policy if exists "office tasks read" on public.office_tasks;
create policy "office tasks read" on public.office_tasks for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists "office log read" on public.office_log;
create policy "office log read" on public.office_log for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.office_tasks, public.office_log from anon;
revoke insert, update, delete on public.office_tasks, public.office_log from authenticated;

create or replace function public.office_create(p_instruccion text, p_agente text, p_area text, p_nivel text, p_estado text, p_resultado text, p_error text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_estado not in ('en_revision','requiere_aprobacion','fallida','pendiente') then raise exception 'ESTADO'; end if;
  if p_estado in ('en_revision','requiere_aprobacion') and (p_resultado is null or char_length(trim(p_resultado)) = 0) then raise exception 'SIN_RESULTADO'; end if;
  if (select count(*) from office_tasks where owner = uid) >= 1000 then raise exception 'LIMIT'; end if;
  insert into office_tasks(owner, instruccion, agente, area, nivel, estado, resultado, error)
  values (uid, p_instruccion, p_agente, p_area, p_nivel, p_estado, p_resultado, left(p_error, 300)) returning id into rid;
  insert into office_log(owner, task_id, evento, detalle) values (uid, rid, 'creada', p_agente || ' · ' || p_estado);
  return rid;
end $$;

create or replace function public.office_set_estado(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t office_tasks%rowtype; ok boolean;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into t from office_tasks where id = p_id and owner = uid;
  if not found then raise exception 'NOTFOUND'; end if;
  ok := case t.estado
    when 'pendiente' then p_estado in ('planificada','en_curso','cancelada','bloqueada')
    when 'planificada' then p_estado in ('en_curso','cancelada','bloqueada')
    when 'en_curso' then p_estado in ('en_revision','requiere_aprobacion','fallida','bloqueada','cancelada')
    when 'en_revision' then p_estado in ('completada','requiere_aprobacion','en_curso','fallida','cancelada')
    when 'requiere_aprobacion' then p_estado in ('completada','en_curso','cancelada')
    when 'bloqueada' then p_estado in ('en_curso','cancelada')
    when 'fallida' then p_estado in ('pendiente','cancelada')
    else false end;
  if not ok then raise exception 'TRANSICION'; end if;
  if p_estado = 'completada' and (t.resultado is null or char_length(trim(t.resultado)) = 0) then raise exception 'SIN_RESULTADO'; end if;
  update office_tasks set estado = p_estado, updated_at = now() where id = p_id;
  insert into office_log(owner, task_id, evento, detalle) values (uid, p_id, 'estado', t.estado || ' → ' || p_estado);
end $$;
revoke all on function public.office_create(text, text, text, text, text, text, text), public.office_set_estado(uuid, text) from public, anon;
grant execute on function public.office_create(text, text, text, text, text, text, text), public.office_set_estado(uuid, text) to authenticated;

-- ===== 88_OFICINA_CICLO =====
-- SQL 88 · Oficina 24/7: reintentos, ajustes (pausa, presupuesto diario) y resumen. Ejecutar DESPUÉS del 87.
alter table public.office_tasks add column if not exists intentos int not null default 0;
alter table public.office_tasks add column if not exists prox_intento timestamptz;

create table if not exists public.office_settings (
  owner uuid primary key,
  pausa boolean not null default false,
  presupuesto_dia int not null default 40 check (presupuesto_dia between 0 and 500),
  resumen_hora int not null default 7 check (resumen_hora between 0 and 23),
  updated_at timestamptz not null default now()
);
alter table public.office_settings enable row level security;
drop policy if exists office_settings_sel on public.office_settings;
create policy office_settings_sel on public.office_settings for select to authenticated
  using (owner = auth.uid() and public.oficina_is_admin());
revoke insert, update, delete on public.office_settings from authenticated;

create or replace function public.office_set_ajustes(p_pausa boolean, p_presupuesto int, p_hora int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  insert into public.office_settings(owner, pausa, presupuesto_dia, resumen_hora, updated_at)
  values (auth.uid(), coalesce(p_pausa,false), greatest(0,least(500,coalesce(p_presupuesto,40))), greatest(0,least(23,coalesce(p_hora,7))), now())
  on conflict (owner) do update set pausa = excluded.pausa, presupuesto_dia = excluded.presupuesto_dia,
    resumen_hora = excluded.resumen_hora, updated_at = now();
  insert into public.office_log(owner, task_id, evento, detalle) values (auth.uid(), null, 'ajustes', 'pausa='||coalesce(p_pausa,false)||' presupuesto='||p_presupuesto);
end $$;
revoke all on function public.office_set_ajustes(boolean,int,int) from public;
grant execute on function public.office_set_ajustes(boolean,int,int) to authenticated;

-- ===== 89_OFICINA_CONOCIMIENTO =====
-- SQL 89 · Oficina: biblioteca de conocimiento por agente. Requiere SQL 87. Se puede ejecutar varias veces.
-- Solo el administrador ve y gestiona su conocimiento. agente NULL = lo usan todos los agentes.
create table if not exists public.office_kb (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  agente text check (agente is null or char_length(agente) between 2 and 40),
  titulo text not null check (char_length(titulo) between 1 and 80),
  contenido text not null check (char_length(contenido) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists office_kb_owner_idx on public.office_kb(owner, created_at desc);
alter table public.office_kb enable row level security;
drop policy if exists "office kb read" on public.office_kb;
create policy "office kb read" on public.office_kb for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.office_kb from anon;
revoke insert, update, delete on public.office_kb from authenticated;

create or replace function public.office_kb_add(p_agente text, p_titulo text, p_contenido text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  if (select count(*) from office_kb where owner = uid) >= 200 then raise exception 'LIMIT'; end if;
  insert into office_kb(owner, agente, titulo, contenido)
  values (uid, nullif(trim(p_agente), ''), trim(p_titulo), trim(p_contenido)) returning id into rid;
  insert into office_log(owner, task_id, evento, detalle) values (uid, null, 'conocimiento', 'añadido: ' || left(trim(p_titulo), 80));
  return rid;
end $$;

create or replace function public.office_kb_del(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  delete from office_kb where id = p_id and owner = uid;
  insert into office_log(owner, task_id, evento, detalle) values (uid, null, 'conocimiento', 'borrado');
end $$;
revoke all on function public.office_kb_add(text, text, text), public.office_kb_del(uuid) from public, anon;
grant execute on function public.office_kb_add(text, text, text), public.office_kb_del(uuid) to authenticated;

-- ===== 90_OFICINA_DELEGACION =====
-- SQL 90 · Oficina: delegación entre agentes, conexiones, eventos enriquecidos, latido del ciclo y contrato de datos (office_snapshot).
-- Requiere SQL 87, 88 y 89. NO ejecutar en producción sin revisar docs/OFICINA_FASE1.md. Idempotente (se puede repetir).
-- Reversión: TODO_REVERTIR_90_OFICINA_DELEGACION.sql

-- 1) Tareas: quién delega, tarea padre y verificación humana.
alter table public.office_tasks add column if not exists parent_id uuid references public.office_tasks(id) on delete set null;
alter table public.office_tasks add column if not exists delegada_por text check (delegada_por is null or char_length(delegada_por) between 2 and 40);
alter table public.office_tasks add column if not exists verificado boolean not null default false;
alter table public.office_tasks add column if not exists verificado_at timestamptz;
alter table public.office_tasks drop constraint if exists office_tasks_verificado_chk;
alter table public.office_tasks add constraint office_tasks_verificado_chk check (not verificado or estado = 'completada');
create index if not exists office_tasks_parent_idx on public.office_tasks(parent_id) where parent_id is not null;
create index if not exists office_tasks_agente_idx on public.office_tasks(owner, agente, estado);

-- 2) Eventos: se amplía office_log (no se crea una tabla paralela). evento = tipo de evento.
alter table public.office_log add column if not exists agente text check (agente is null or char_length(agente) between 2 and 40);
alter table public.office_log add column if not exists connection_id uuid;
alter table public.office_log add column if not exists payload jsonb;
alter table public.office_log add column if not exists idempotency_key text check (idempotency_key is null or char_length(idempotency_key) <= 120);
create unique index if not exists office_log_idem_uidx on public.office_log(owner, idempotency_key) where idempotency_key is not null;
create index if not exists office_log_task_idx on public.office_log(task_id, at desc);

-- 3) Conexiones: una relación operativa vigente entre dos agentes por una tarea concreta.
-- Regla: un agente NO puede conectarse consigo mismo; no hay duplicados por (tarea, origen, destino).
create table if not exists public.office_connections (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.office_tasks(id) on delete cascade,
  from_agente text not null check (char_length(from_agente) between 2 and 40),
  to_agente text not null check (char_length(to_agente) between 2 and 40),
  status text not null default 'paused' check (status in ('active','paused','completed','failed','cancelled')),
  direction text not null default 'one-way' check (direction in ('one-way','two-way')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint office_conn_distinct check (from_agente <> to_agente),
  constraint office_conn_closed check ((status in ('completed','failed','cancelled')) = (closed_at is not null))
);
create unique index if not exists office_conn_uniq on public.office_connections(task_id, from_agente, to_agente);
create index if not exists office_conn_owner_idx on public.office_connections(owner, status, updated_at desc);

-- 4) Latido del ciclo 24/7 (lo escribe el servidor con la service role en cada ciclo).
create table if not exists public.office_heartbeat (
  owner uuid primary key references auth.users(id) on delete cascade,
  ultimo_ciclo_at timestamptz not null default now(),
  ejecutadas int not null default 0,
  fallos int not null default 0,
  bloqueadas int not null default 0
);

-- 5) Seguridad: solo el administrador dueño LEE; nadie escribe desde el cliente (escriben funciones y la service role).
alter table public.office_connections enable row level security;
alter table public.office_heartbeat enable row level security;
drop policy if exists "office conn read" on public.office_connections;
create policy "office conn read" on public.office_connections for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists "office hb read" on public.office_heartbeat;
create policy "office hb read" on public.office_heartbeat for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.office_connections, public.office_heartbeat from anon;
revoke insert, update, delete on public.office_connections, public.office_heartbeat from authenticated;

-- 6) Disparador: mantiene la conexión de delegación y su evento en la MISMA transacción que la tarea.
-- Delegante = delegada_por, o CIRO por defecto (CIRO enruta toda orden del CEO). Tareas de CIRO sin delegante no crean conexión.
create or replace function public.office_sync_conexion() returns trigger
language plpgsql security definer set search_path = public as $$
declare de text; st text; cid uuid; prev text; ev text; terminal boolean;
begin
  if new.agente = 'ciro' and new.delegada_por is null then return new; end if;
  de := coalesce(new.delegada_por, 'ciro');
  if de = new.agente then return new; end if;
  st := case new.estado
    when 'en_curso' then 'active'
    when 'completada' then 'completed'
    when 'fallida' then 'failed'
    when 'cancelada' then 'cancelled'
    else 'paused' end;   -- pendiente, planificada, en_revision, requiere_aprobacion, bloqueada
  terminal := st in ('completed','failed','cancelled');
  select id, status into cid, prev from office_connections where task_id = new.id and from_agente = de and to_agente = new.agente;
  if cid is null then
    insert into office_connections(owner, task_id, from_agente, to_agente, status, closed_at)
    values (new.owner, new.id, de, new.agente, st, case when terminal then now() end) returning id into cid;
    ev := 'agent.connection_started';
  elsif prev is distinct from st then
    update office_connections set status = st, updated_at = now(), closed_at = case when terminal then coalesce(closed_at, now()) else null end where id = cid;
    ev := case when terminal then 'agent.connection_closed' when st = 'paused' then 'agent.connection_paused' else 'agent.connection_started' end;
  else
    return new;
  end if;
  insert into office_log(owner, task_id, evento, agente, connection_id, detalle, payload, idempotency_key)
  values (new.owner, new.id, ev, new.agente, cid, de || ' → ' || new.agente || ' · ' || st,
          jsonb_build_object('from', de, 'to', new.agente, 'status', st, 'motivo', case when new.delegada_por is null then 'enrutado por CIRO (reglas de enrutado, sin IA)' else 'delegación registrada' end),
          'conn:' || cid || ':' || st || ':' || extract(epoch from new.updated_at)::text)
  on conflict (owner, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end $$;
revoke all on function public.office_sync_conexion() from public, anon, authenticated;
drop trigger if exists office_tasks_sync_conexion on public.office_tasks;
create trigger office_tasks_sync_conexion after insert or update of estado, agente, delegada_por on public.office_tasks for each row execute function public.office_sync_conexion();

-- 7) Completar = verificación humana del CEO (misma regla que antes + marca verificado).
create or replace function public.office_set_estado(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t office_tasks%rowtype; ok boolean;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into t from office_tasks where id = p_id and owner = uid;
  if not found then raise exception 'NOTFOUND'; end if;
  ok := case t.estado
    when 'pendiente' then p_estado in ('planificada','en_curso','cancelada','bloqueada')
    when 'planificada' then p_estado in ('en_curso','cancelada','bloqueada')
    when 'en_curso' then p_estado in ('en_revision','requiere_aprobacion','fallida','bloqueada','cancelada')
    when 'en_revision' then p_estado in ('completada','requiere_aprobacion','en_curso','fallida','cancelada')
    when 'requiere_aprobacion' then p_estado in ('completada','en_curso','cancelada')
    when 'bloqueada' then p_estado in ('en_curso','cancelada')
    when 'fallida' then p_estado in ('pendiente','cancelada')
    else false end;
  if not ok then raise exception 'TRANSICION'; end if;
  if p_estado = 'completada' and (t.resultado is null or char_length(trim(t.resultado)) = 0) then raise exception 'SIN_RESULTADO'; end if;
  update office_tasks set estado = p_estado, updated_at = now(),
    verificado = (p_estado = 'completada'), verificado_at = case when p_estado = 'completada' then now() end
  where id = p_id;
  insert into office_log(owner, task_id, evento, detalle) values (uid, p_id, 'estado', t.estado || ' → ' || p_estado);
end $$;
revoke all on function public.office_set_estado(uuid, text) from public, anon;
grant execute on function public.office_set_estado(uuid, text) to authenticated;

-- 8) Contrato de datos para la oficina 3D. Solo el administrador dueño. Sin resultados completos, prompts ni claves.
create or replace function public.office_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); hb timestamptz; res jsonb;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  select ultimo_ciclo_at into hb from office_heartbeat where owner = uid;
  res := jsonb_build_object(
    'servidor_ahora', now(),
    'latido', jsonb_build_object(
      'ultimo_ciclo_at', hb,
      'antiguedad_s', case when hb is null then null else extract(epoch from (now() - hb))::int end,
      'estado', case when hb is null then 'desconocido' when now() - hb > interval '45 minutes' then 'sin_senal' else 'ok' end),
    'tareas', coalesce((select jsonb_agg(x) from (
        select id, agente, area, nivel, estado, parent_id, delegada_por, verificado, intentos, error,
               (resultado is not null) as tiene_resultado, left(instruccion, 120) as instruccion, created_at, updated_at
        from office_tasks where owner = uid order by updated_at desc limit 100) x), '[]'::jsonb),
    'conexiones', coalesce((select jsonb_agg(c) from (
        select id, task_id, from_agente, to_agente, status, direction, created_at, updated_at, closed_at
        from office_connections where owner = uid and (status in ('active','paused') or closed_at > now() - interval '1 day')
        order by updated_at desc limit 100) c), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(e) from (
        select id, evento as tipo, agente, task_id, connection_id, detalle, at
        from office_log where owner = uid order by at desc limit 50) e), '[]'::jsonb));
  return res;
end $$;
revoke all on function public.office_snapshot() from public, anon;
grant execute on function public.office_snapshot() to authenticated;

-- ===== 91_OFICINA_DECISIONES =====
-- SQL 91 · Oficina: decisiones del CEO (aceptar / rechazar) con registro. Ejecutar DESPUÉS del 90. No borra datos.
create table if not exists public.office_decisiones (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  task_id uuid not null references public.office_tasks(id) on delete cascade,
  decision text not null check (decision in ('aceptada','rechazada')),
  nota text check (nota is null or char_length(nota) <= 500),
  estado_previo text not null,
  at timestamptz not null default now()
);
alter table public.office_decisiones enable row level security;
drop policy if exists office_decisiones_sel on public.office_decisiones;
create policy office_decisiones_sel on public.office_decisiones for select to authenticated
  using (owner = auth.uid() and public.oficina_is_admin());
revoke insert, update, delete on public.office_decisiones from authenticated;

create or replace function public.office_decidir(p_id uuid, p_decision text, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t office_tasks%rowtype;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_decision not in ('aceptada','rechazada') then raise exception 'DECISION'; end if;
  select * into t from office_tasks where id = p_id and owner = uid for update;
  if not found then raise exception 'NOTFOUND'; end if;
  if t.estado not in ('requiere_aprobacion','en_revision') then raise exception 'TRANSICION'; end if;
  if p_decision = 'aceptada' then
    if t.resultado is null or char_length(trim(t.resultado)) = 0 then raise exception 'SIN_RESULTADO'; end if;
    update office_tasks set estado = 'completada', verificado = true, verificado_at = now(), updated_at = now() where id = p_id;
  else
    update office_tasks set estado = 'cancelada', verificado = false, updated_at = now() where id = p_id;
  end if;
  insert into office_decisiones(owner, task_id, decision, nota, estado_previo) values (uid, p_id, p_decision, left(p_nota, 500), t.estado);
  insert into office_log(owner, task_id, evento, detalle) values (uid, p_id, 'decision', p_decision || coalesce(' · ' || left(p_nota, 200), ''));
end $$;
revoke all on function public.office_decidir(uuid, text, text) from public, anon;
grant execute on function public.office_decidir(uuid, text, text) to authenticated;

-- Quitar pausa y asegurar presupuesto para quien tenga tareas (el SQL editor no tiene sesión, por eso no usa office_set_ajustes).
insert into public.office_settings(owner, pausa, presupuesto_dia)
select distinct owner, false, 40 from public.office_tasks
on conflict (owner) do update set pausa = false,
  presupuesto_dia = case when public.office_settings.presupuesto_dia <= 0 then 40 else public.office_settings.presupuesto_dia end,
  updated_at = now();

select owner, pausa, presupuesto_dia from public.office_settings;

-- ===== TODO_CORRER_92_OFICINA_ARCHIVOS =====
-- 92 · Fábrica creativa: archivos persistentes (carteles, y luego imágenes/vídeos).
-- Bucket PRIVADO: solo se abre con enlaces firmados temporales generados por el servidor tras comprobar que eres el dueño.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oficina-archivos', 'oficina-archivos', false, 8388608, array['image/png','image/jpeg','video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/png','image/jpeg','video/mp4'];

create table if not exists public.office_files (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.office_tasks(id) on delete set null,
  tipo text not null check (tipo in ('cartel','imagen','video')),
  nombre text not null check (char_length(nombre) between 1 and 120),
  ruta text not null unique check (char_length(ruta) <= 300),
  mime text not null check (mime in ('image/png','image/jpeg','video/mp4')),
  bytes int not null check (bytes between 1 and 8388608),
  sha256 text not null check (char_length(sha256) = 64),
  proveedor text not null default 'codigo' check (char_length(proveedor) <= 60),
  brief jsonb,
  created_at timestamptz not null default now()
);
create index if not exists office_files_owner_idx on public.office_files(owner, created_at desc);
alter table public.office_files enable row level security;
drop policy if exists office_files_select on public.office_files;
create policy office_files_select on public.office_files for select to authenticated using (owner = auth.uid());
drop policy if exists office_files_delete on public.office_files;
create policy office_files_delete on public.office_files for delete to authenticated using (owner = auth.uid());
-- Sin políticas de insert/update: solo el servidor (service role) crea registros, tras validar el archivo.
revoke all on public.office_files from anon;
grant select, delete on public.office_files to authenticated;
-- El bucket no tiene políticas para usuarios: nadie lee ni escribe directamente; todo pasa por el servidor.

-- ===== TODO_CORRER_93_KIT_MARCA =====
-- 93 · Kit de marca (Hiring Studio). Una fila por marca; hoy solo la crea y ve el administrador que la posee.
-- Preparado para empresas: más adelante se añade company_id y políticas por miembro de empresa.
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 60),
  color_primario text not null default '#0B2A5B' check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  color_secundario text not null default '#06142E' check (color_secundario ~ '^#[0-9A-Fa-f]{6}$'),
  color_acento text not null default '#FFD100' check (color_acento ~ '^#[0-9A-Fa-f]{6}$'),
  estilo text not null default 'corporativo' check (char_length(estilo) <= 14),
  logo_url text check (logo_url is null or (char_length(logo_url) <= 500 and logo_url ~ '^https://')),
  eslogan text check (eslogan is null or char_length(eslogan) <= 80),
  sector text check (sector is null or char_length(sector) <= 40),
  localidad text check (localidad is null or char_length(localidad) <= 60),
  contacto text check (contacto is null or char_length(contacto) <= 70),
  url text check (url is null or (char_length(url) <= 200 and url ~ '^https://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_kits_owner_idx on public.brand_kits(owner, updated_at desc);
alter table public.brand_kits enable row level security;
drop policy if exists brand_kits_select on public.brand_kits;
create policy brand_kits_select on public.brand_kits for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists brand_kits_insert on public.brand_kits;
create policy brand_kits_insert on public.brand_kits for insert to authenticated with check (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists brand_kits_update on public.brand_kits;
create policy brand_kits_update on public.brand_kits for update to authenticated using (owner = auth.uid() and public.oficina_is_admin()) with check (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists brand_kits_delete on public.brand_kits;
create policy brand_kits_delete on public.brand_kits for delete to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.brand_kits from anon;
grant select, insert, update, delete on public.brand_kits to authenticated;

-- ===== TODO_CORRER_94_A_96_TODO =====
-- 94 · Estudio de marketing: historial de piezas generadas (versiones recuperables). Solo el administrador dueño las ve y las gestiona.
create table if not exists public.marketing_piezas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  kit_id uuid references public.brand_kits(id) on delete set null,
  modo text not null check (char_length(modo) <= 20),
  canal text not null check (char_length(canal) <= 20),
  tono text not null check (char_length(tono) <= 20),
  objetivo text not null check (char_length(objetivo) <= 20),
  entrada text not null check (char_length(entrada) <= 3000),
  salida jsonb not null,
  proveedor text check (proveedor is null or char_length(proveedor) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists marketing_piezas_owner_idx on public.marketing_piezas(owner, created_at desc);
alter table public.marketing_piezas enable row level security;
drop policy if exists marketing_piezas_select on public.marketing_piezas;
create policy marketing_piezas_select on public.marketing_piezas for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists marketing_piezas_insert on public.marketing_piezas;
create policy marketing_piezas_insert on public.marketing_piezas for insert to authenticated with check (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists marketing_piezas_delete on public.marketing_piezas;
create policy marketing_piezas_delete on public.marketing_piezas for delete to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.marketing_piezas from anon;
grant select, insert, delete on public.marketing_piezas to authenticated;
-- 95 · Perfil de marca con memoria editable, reglas y versiones. No destructivo. Requiere 93 (brand_kits).
create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  datos jsonb not null default '{}'::jsonb check (jsonb_typeof(datos)='object' and pg_column_size(datos) < 60000),
  revision int not null default 1,
  updated_at timestamptz not null default now(),
  unique (kit_id)
);
create table if not exists public.brand_rules (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  termino text not null check (char_length(termino) between 2 and 120),
  severidad text not null default 'estricta' check (severidad in ('estricta','estilo')),
  alternativa text not null default '' check (char_length(alternativa) <= 160),
  excepcion text not null default '' check (char_length(excepcion) <= 200),
  created_at timestamptz not null default now()
);
create table if not exists public.brand_profile_versions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kit_id uuid not null references public.brand_kits(id) on delete cascade,
  revision int not null,
  datos jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists brand_rules_kit on public.brand_rules(kit_id);
create index if not exists brand_versions_kit on public.brand_profile_versions(kit_id, revision desc);
do $$ declare t text; begin
  foreach t in array array['brand_profiles','brand_rules','brand_profile_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner = auth.uid() and public.oficina_is_admin())', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner = auth.uid() and public.oficina_is_admin())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner = auth.uid() and public.oficina_is_admin()) with check (owner = auth.uid() and public.oficina_is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner = auth.uid() and public.oficina_is_admin())', t||'_del', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Comprobación (debe dar true,true,true):
select to_regclass('public.brand_profiles') is not null as perfiles, to_regclass('public.brand_rules') is not null as reglas, to_regclass('public.brand_profile_versions') is not null as versiones;
-- 96 · Campañas multicanal con piezas, estados y versiones. No destructivo. Requiere 93 (brand_kits).
create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kit_id uuid references public.brand_kits(id) on delete set null,
  titulo text not null check (char_length(titulo) between 1 and 140),
  entrada jsonb not null default '{}'::jsonb,
  estrategia jsonb not null default '{}'::jsonb,
  proveedor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.campana_piezas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campana_id uuid not null references public.campanas(id) on delete cascade,
  canal text not null check (char_length(canal) between 1 and 20),
  titulo text not null default '' check (char_length(titulo) <= 200),
  texto text not null default '' check (char_length(texto) <= 8000),
  cta text not null default '' check (char_length(cta) <= 200),
  visual text not null default '' check (char_length(visual) <= 1200),
  estado text not null default 'borrador' check (estado in ('borrador','revision','aprobado','programado','publicado')),
  publicacion_url text,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  -- "publicado" solo con una publicación real confirmada (enlace https).
  constraint publicado_requiere_url check (estado <> 'publicado' or publicacion_url ~* '^https://')
);
create table if not exists public.campana_pieza_versiones (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pieza_id uuid not null references public.campana_piezas(id) on delete cascade,
  version int not null,
  texto text not null,
  created_at timestamptz not null default now()
);
create index if not exists campanas_owner on public.campanas(owner, created_at desc);
create index if not exists campana_piezas_c on public.campana_piezas(campana_id);
create index if not exists campana_versiones_p on public.campana_pieza_versiones(pieza_id, version desc);
do $$ declare t text; begin
  foreach t in array array['campanas','campana_piezas','campana_pieza_versiones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner = auth.uid() and public.oficina_is_admin())', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner = auth.uid() and public.oficina_is_admin())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner = auth.uid() and public.oficina_is_admin()) with check (owner = auth.uid() and public.oficina_is_admin())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner = auth.uid() and public.oficina_is_admin())', t||'_del', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Comprobación (debe dar true,true,true):
select to_regclass('public.campanas') is not null as campanas, to_regclass('public.campana_piezas') is not null as piezas, to_regclass('public.campana_pieza_versiones') is not null as versiones;

-- ===== TODO_CORRER_97_A_99_TODO =====
-- 97 · Cuotas por plan y libro de consumo (servidor). No destructivo. Los límites se editan aquí (tabla plan_limits), no en el código.
create table if not exists public.plan_limits (
  plan text not null check (char_length(plan) between 1 and 40),
  operacion text not null check (char_length(operacion) between 1 and 40),
  limite int not null check (limite >= 0),
  periodo text not null default 'mes' check (periodo in ('dia','mes')),
  coste_unidad numeric not null default 0 check (coste_unidad >= 0),
  primary key (plan, operacion)
);
create table if not exists public.owner_plan (
  owner uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'interno' check (char_length(plan) between 1 and 40)
);
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  operacion text not null check (char_length(operacion) between 1 and 40),
  unidades int not null default 1 check (unidades > 0),
  coste_estimado numeric,
  estado text not null default 'ok' check (estado in ('ok','reembolsado')),
  ref text check (ref is null or char_length(ref) <= 80),
  created_at timestamptz not null default now(),
  unique (owner, ref)
);
create index if not exists usage_events_owner_op on public.usage_events(owner, operacion, created_at desc);

insert into public.plan_limits(plan, operacion, limite, periodo, coste_unidad) values
  ('interno','texto',300,'mes',0), ('interno','campana',40,'mes',0), ('interno','pieza',200,'mes',0), ('interno','imagen',100,'mes',0)
on conflict (plan, operacion) do nothing;

alter table public.plan_limits enable row level security;
alter table public.owner_plan enable row level security;
alter table public.usage_events enable row level security;
drop policy if exists plan_limits_sel on public.plan_limits;
create policy plan_limits_sel on public.plan_limits for select to authenticated using (public.oficina_is_admin());
drop policy if exists owner_plan_sel on public.owner_plan;
create policy owner_plan_sel on public.owner_plan for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
drop policy if exists usage_events_sel on public.usage_events;
create policy usage_events_sel on public.usage_events for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.plan_limits, public.owner_plan, public.usage_events from anon, authenticated;
grant select on public.plan_limits, public.owner_plan, public.usage_events to authenticated;

-- Consumo atómico: el bloqueo por (usuario, operación) impide gastar dos veces el mismo saldo con llamadas simultáneas.
create or replace function public.usage_consume(p_owner uuid, p_op text, p_units int default 1, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_per text; v_coste numeric; v_used int; v_id uuid; v_ex record;
begin
  if p_owner is null or p_op is null or p_units is null or p_units < 1 then return jsonb_build_object('ok', false, 'motivo', 'datos_no_validos'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_op, 0));
  if p_ref is not null then
    select id, estado into v_ex from public.usage_events where owner = p_owner and ref = p_ref;
    if found then return jsonb_build_object('ok', v_ex.estado = 'ok', 'id', v_ex.id, 'repetido', true); end if;
  end if;
  select coalesce((select plan from public.owner_plan where owner = p_owner), 'interno') into v_plan;
  select limite, periodo, coste_unidad into v_lim, v_per, v_coste from public.plan_limits where plan = v_plan and operacion = p_op;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'operacion_no_incluida', 'plan', v_plan); end if;
  select coalesce(sum(unidades), 0) into v_used from public.usage_events where owner = p_owner and operacion = p_op and estado = 'ok' and created_at >= date_trunc(case v_per when 'dia' then 'day' else 'month' end, now());
  if v_used + p_units > v_lim then return jsonb_build_object('ok', false, 'motivo', 'limite', 'usado', v_used, 'limite', v_lim, 'periodo', v_per, 'plan', v_plan); end if;
  insert into public.usage_events(owner, operacion, unidades, coste_estimado, ref) values (p_owner, p_op, p_units, case when v_coste > 0 then v_coste * p_units else null end, p_ref) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'usado', v_used + p_units, 'limite', v_lim, 'periodo', v_per, 'plan', v_plan);
end $$;
create or replace function public.usage_refund(p_owner uuid, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin update public.usage_events set estado = 'reembolsado' where owner = p_owner and ref = p_ref and estado = 'ok'; get diagnostics n = row_count; return n > 0; end $$;
-- Solo el servidor (service_role) puede consumir o reembolsar: un usuario no puede falsear su consumo.
revoke all on function public.usage_consume(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.usage_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.usage_consume(uuid, text, int, text) to service_role;
grant execute on function public.usage_refund(uuid, text) to service_role;
-- Comprobación (debe dar true,true,true,4):
select to_regclass('public.usage_events') is not null as libro, to_regprocedure('public.usage_consume(uuid,text,integer,text)') is not null as funcion, to_regclass('public.plan_limits') is not null as limites, (select count(*) from public.plan_limits where plan='interno') as limites_interno;
-- 98 · Control de la oficina: parada global (DETENER OFICINA), registro real de ciclos y auditoría. No destructivo. Requiere 87, 88 y 90.
create table if not exists public.office_control (
  id int primary key default 1 check (id = 1),
  detenida boolean not null default false,
  motivo text check (motivo is null or char_length(motivo) <= 300),
  por uuid references auth.users(id) on delete set null,
  desde timestamptz,
  umbral_ciclo_min int not null default 45 check (umbral_ciclo_min between 5 and 1440),
  umbral_atasco_min int not null default 20 check (umbral_atasco_min between 5 and 240),
  max_errores_seguidos int not null default 3 check (max_errores_seguidos between 1 and 50),
  updated_at timestamptz not null default now()
);
insert into public.office_control(id) values (1) on conflict (id) do nothing;

create table if not exists public.office_control_hist (
  id bigint generated always as identity primary key,
  accion text not null check (accion in ('detener','reanudar')),
  por uuid references auth.users(id) on delete set null,
  motivo text check (motivo is null or char_length(motivo) <= 300),
  detalle text check (detalle is null or char_length(detalle) <= 300),
  at timestamptz not null default now()
);

-- Un registro por ciclo real. El índice único garantiza que no haya dos ciclos en marcha a la vez.
create table if not exists public.office_ciclos (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null default now(),
  fin timestamptz,
  origen text not null default 'cron' check (origen in ('cron','manual')),
  resultado text check (resultado in ('ok','error','parada','omitido','interrumpido')),
  ejecutadas int not null default 0, fallos int not null default 0, bloqueadas int not null default 0, ideas int not null default 0,
  sin_ia boolean not null default false,
  error text check (error is null or char_length(error) <= 300)
);
create unique index if not exists office_ciclos_uno_en_marcha on public.office_ciclos ((true)) where fin is null;
create index if not exists office_ciclos_inicio on public.office_ciclos(inicio desc);

alter table public.office_control enable row level security;
alter table public.office_control_hist enable row level security;
alter table public.office_ciclos enable row level security;
drop policy if exists office_control_sel on public.office_control;
create policy office_control_sel on public.office_control for select to authenticated using (public.oficina_is_admin());
drop policy if exists office_control_hist_sel on public.office_control_hist;
create policy office_control_hist_sel on public.office_control_hist for select to authenticated using (public.oficina_is_admin());
drop policy if exists office_ciclos_sel on public.office_ciclos;
create policy office_ciclos_sel on public.office_ciclos for select to authenticated using (public.oficina_is_admin());
revoke all on public.office_control, public.office_control_hist, public.office_ciclos from anon, authenticated;
grant select on public.office_control, public.office_control_hist, public.office_ciclos to authenticated;

-- DETENER OFICINA: se valida en el servidor. Las tareas pendientes/planificadas quedan "bloqueada" con la marca [PARADA] (recuperables);
-- las que ya están en curso NO se tocan (no se puede abortar una petición externa): se devuelve su número para avisar.
create or replace function public.office_detener(p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; v_curso int; m text;
begin
  if uid is null or not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  m := left(coalesce(nullif(trim(p_motivo), ''), 'Sin motivo indicado'), 300);
  update public.office_control set detenida = true, motivo = m, por = uid, desde = now(), updated_at = now() where id = 1;
  update public.office_tasks set estado = 'bloqueada', error = '[PARADA] Interrumpida por DETENER OFICINA', updated_at = now()
    where owner = uid and estado in ('pendiente','planificada');
  get diagnostics n = row_count;
  select count(*) into v_curso from public.office_tasks where owner = uid and estado = 'en_curso';
  insert into public.office_control_hist(accion, por, motivo, detalle) values ('detener', uid, m, n || ' tareas interrumpidas; ' || v_curso || ' en curso sin poder detenerse');
  insert into public.office_log(owner, task_id, evento, detalle) values (uid, null, 'parada', left(m, 280));
  return jsonb_build_object('ok', true, 'interrumpidas', n, 'en_curso', v_curso);
end $$;

-- REANUDAR: quita la parada y devuelve a la cola SOLO las tareas interrumpidas por la parada que no produjeron resultado.
create or replace function public.office_reanudar(p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; m text;
begin
  if uid is null or not public.oficina_is_admin() then raise exception 'FORBIDDEN'; end if;
  m := left(coalesce(nullif(trim(p_motivo), ''), 'Reanudada por el administrador'), 300);
  update public.office_control set detenida = false, motivo = null, desde = null, updated_at = now() where id = 1;
  update public.office_tasks set estado = 'pendiente', error = null, prox_intento = null, updated_at = now()
    where owner = uid and estado = 'bloqueada' and error like '[PARADA]%' and (resultado is null or char_length(trim(resultado)) = 0);
  get diagnostics n = row_count;
  insert into public.office_control_hist(accion, por, motivo, detalle) values ('reanudar', uid, m, n || ' tareas devueltas a la cola');
  insert into public.office_log(owner, task_id, evento, detalle) values (uid, null, 'reanudada', left(m, 280));
  return jsonb_build_object('ok', true, 'recuperadas', n);
end $$;
revoke all on function public.office_detener(text), public.office_reanudar(text) from public, anon;
grant execute on function public.office_detener(text), public.office_reanudar(text) to authenticated;
-- Comprobación (debe dar true,true,true,true):
select to_regclass('public.office_control') is not null as control, to_regclass('public.office_ciclos') is not null as ciclos, to_regprocedure('public.office_detener(text)') is not null as detener, (select count(*) from public.office_control) = 1 as fila_unica;
-- SQL 99 · Entregables de texto/datos enlazados a la tarea que los generó (los carteles/imágenes ya enlazan por office_files.task_id, SQL 92).
create table if not exists public.office_entregables (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.office_tasks(id) on delete cascade,
  agente text not null check (char_length(agente) <= 60),
  tipo text not null check (tipo in ('informe','analisis','campana','documento','evidencia')),
  nombre text not null check (char_length(nombre) between 1 and 160),
  mime text not null default 'text/markdown' check (mime in ('text/markdown','text/plain','application/json')),
  contenido text not null check (char_length(contenido) between 1 and 200000),
  bytes int not null,
  sha256 text not null check (char_length(sha256) = 64),
  version int not null default 1,
  validacion text not null default 'pendiente' check (validacion in ('pendiente','validado','rechazado')),
  fuentes jsonb,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists office_entregables_task on public.office_entregables(task_id, created_at desc);
create index if not exists office_entregables_owner on public.office_entregables(owner, created_at desc);
alter table public.office_entregables enable row level security;
drop policy if exists office_entregables_sel on public.office_entregables;
create policy office_entregables_sel on public.office_entregables for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.office_entregables from anon, authenticated;
grant select on public.office_entregables to authenticated;
-- Sin insert/update para usuarios: solo el servidor (service role) guarda entregables tras validarlos.
select to_regclass('public.office_entregables') is not null as entregables, exists(select 1 from information_schema.columns where table_name='office_files' and column_name='task_id') as files_task_id;

-- ===== TODO_CORRER_100_COSTES =====
-- SQL 100 · Libro de costes por tarea/agente y tarifas versionadas. No destructivo. Requiere 87 y 99.
create table if not exists public.office_tarifas (
  id bigint generated always as identity primary key,
  proveedor text not null check (char_length(proveedor) <= 60),
  modelo text not null check (char_length(modelo) <= 120),
  eur_por_1k_entrada numeric not null check (eur_por_1k_entrada >= 0),
  eur_por_1k_salida numeric not null check (eur_por_1k_salida >= 0),
  vigente_desde date not null default current_date,
  fuente text check (fuente is null or char_length(fuente) <= 300),
  unique (proveedor, modelo, vigente_desde)
);
create table if not exists public.office_costes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.office_tasks(id) on delete set null,
  agente text not null check (char_length(agente) <= 60),
  proveedor text not null default 'desconocido',
  modelo text not null default 'desconocido',
  operacion text not null default 'llm' check (char_length(operacion) <= 40),
  llamadas int not null default 1,
  tokens_entrada int, tokens_salida int,
  tokens_origen text not null default 'estimado' check (tokens_origen in ('estimado','confirmado')),
  coste_eur numeric,
  coste_origen text not null default 'sin_tarifa' check (coste_origen in ('sin_tarifa','estimado','confirmado')),
  duracion_ms int,
  estado text not null default 'ok' check (estado in ('ok','fallo')),
  created_at timestamptz not null default now()
);
create index if not exists office_costes_owner on public.office_costes(owner, created_at desc);
create index if not exists office_costes_task on public.office_costes(task_id);
alter table public.office_tarifas enable row level security;
alter table public.office_costes enable row level security;
drop policy if exists office_tarifas_sel on public.office_tarifas;
create policy office_tarifas_sel on public.office_tarifas for select to authenticated using (public.oficina_is_admin());
drop policy if exists office_costes_sel on public.office_costes;
create policy office_costes_sel on public.office_costes for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.office_tarifas, public.office_costes from anon, authenticated;
grant select on public.office_tarifas, public.office_costes to authenticated;
-- Solo el servidor (service role) escribe costes. Las tarifas se añaden a mano (con su fuente); no se inventan precios.
select to_regclass('public.office_costes') is not null as costes, to_regclass('public.office_tarifas') is not null as tarifas;

-- ===== TODO_CORRER_101_INFORMES =====
-- SQL 101 · Informe diario del CEO (historial). No destructivo. Requiere 87.
create table if not exists public.office_informes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  fecha date not null,
  contenido text not null check (char_length(contenido) between 1 and 100000),
  datos jsonb,
  origen text not null default 'ciclo' check (origen in ('ciclo','manual')),
  created_at timestamptz not null default now(),
  unique (owner, fecha)
);
create index if not exists office_informes_owner on public.office_informes(owner, fecha desc);
alter table public.office_informes enable row level security;
drop policy if exists office_informes_sel on public.office_informes;
create policy office_informes_sel on public.office_informes for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.office_informes from anon, authenticated;
grant select on public.office_informes to authenticated;
-- Solo el servidor (service role) crea o regenera informes; salen de registros reales (tareas, entregables, costes, ciclos).
select to_regclass('public.office_informes') is not null as informes;

-- ===== TODO_CORRER_102_ARREGLO_CUOTA =====
-- SQL 102 · Arreglo de cuota: date_trunc no entiende 'mes'/'dia'. No destructivo (solo reemplaza la función).
create or replace function public.usage_consume(p_owner uuid, p_op text, p_units int default 1, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_per text; v_coste numeric; v_used int; v_id uuid; v_ex record;
begin
  if p_owner is null or p_op is null or p_units is null or p_units < 1 then return jsonb_build_object('ok', false, 'motivo', 'datos_no_validos'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_op, 0));
  if p_ref is not null then
    select id, estado into v_ex from public.usage_events where owner = p_owner and ref = p_ref;
    if found then return jsonb_build_object('ok', v_ex.estado = 'ok', 'id', v_ex.id, 'repetido', true); end if;
  end if;
  select coalesce((select plan from public.owner_plan where owner = p_owner), 'interno') into v_plan;
  select limite, periodo, coste_unidad into v_lim, v_per, v_coste from public.plan_limits where plan = v_plan and operacion = p_op;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'operacion_no_incluida', 'plan', v_plan); end if;
  select coalesce(sum(unidades), 0) into v_used from public.usage_events where owner = p_owner and operacion = p_op and estado = 'ok' and created_at >= date_trunc(case v_per when 'dia' then 'day' else 'month' end, now());
  if v_used + p_units > v_lim then return jsonb_build_object('ok', false, 'motivo', 'limite', 'usado', v_used, 'limite', v_lim, 'periodo', v_per, 'plan', v_plan); end if;
  insert into public.usage_events(owner, operacion, unidades, coste_estimado, ref) values (p_owner, p_op, p_units, case when v_coste > 0 then v_coste * p_units else null end, p_ref) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'usado', v_used + p_units, 'limite', v_lim, 'periodo', v_per, 'plan', v_plan);
end $$;
select public.usage_consume('00000000-0000-0000-0000-000000000000'::uuid,'__no_existe__',1,null)->>'motivo' as prueba;



-- ===== Intelligence (investigación con fuentes) =====
-- SQL 103 · Intelligence Network (investigaciones y diagnóstico). No destructivo. Requiere 87 (oficina_is_admin).
create table if not exists public.intel_jobs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  proyecto text not null default 'proyecto' check (char_length(proyecto) between 1 and 80),
  agente text not null check (char_length(agente) between 1 and 60),
  pregunta text not null check (char_length(pregunta) between 3 and 1000),
  objetivo text check (objetivo is null or char_length(objetivo) <= 500),
  fuentes text[] not null default '{}',
  urls text[] not null default '{}',
  profundidad text not null default 'normal' check (profundidad in ('rapida','normal','profunda')),
  estado text not null default 'en_cola' check (estado in ('en_cola','en_curso','completada','parcial','fallida','cancelada','bloqueada')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  intentos int not null default 0,
  informe text,
  elementos jsonb,
  registros jsonb,
  omitidas jsonb,
  motivo text,
  guardado boolean not null default false,
  ms int,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (owner, idempotency_key)
);
create index if not exists intel_jobs_owner on public.intel_jobs(owner, created_at desc);
alter table public.intel_jobs enable row level security;
drop policy if exists intel_jobs_sel on public.intel_jobs;
drop policy if exists intel_jobs_ins on public.intel_jobs;
drop policy if exists intel_jobs_upd on public.intel_jobs;
create policy intel_jobs_sel on public.intel_jobs for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
create policy intel_jobs_ins on public.intel_jobs for insert to authenticated with check (owner = auth.uid() and public.oficina_is_admin());
create policy intel_jobs_upd on public.intel_jobs for update to authenticated using (owner = auth.uid() and public.oficina_is_admin()) with check (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.intel_jobs from anon, authenticated;
grant select, insert, update on public.intel_jobs to authenticated;

create table if not exists public.intel_diagnostico (
  owner uuid primary key references auth.users(id) on delete cascade,
  datos jsonb not null,
  comprobado timestamptz not null default now()
);
alter table public.intel_diagnostico enable row level security;
drop policy if exists intel_diag_sel on public.intel_diagnostico;
drop policy if exists intel_diag_ins on public.intel_diagnostico;
drop policy if exists intel_diag_upd on public.intel_diagnostico;
create policy intel_diag_sel on public.intel_diagnostico for select to authenticated using (owner = auth.uid() and public.oficina_is_admin());
create policy intel_diag_ins on public.intel_diagnostico for insert to authenticated with check (owner = auth.uid() and public.oficina_is_admin());
create policy intel_diag_upd on public.intel_diagnostico for update to authenticated using (owner = auth.uid() and public.oficina_is_admin()) with check (owner = auth.uid() and public.oficina_is_admin());
revoke all on public.intel_diagnostico from anon, authenticated;
grant select, insert, update on public.intel_diagnostico to authenticated;
select to_regclass('public.intel_jobs') is not null as jobs, to_regclass('public.intel_diagnostico') is not null as diagnostico;


-- ===== Estudio de vídeo: configuración y conexiones =====
create table if not exists studio_config (
  owner uuid primary key default auth.uid(),
  modo text not null default 'SUPERVISADO' check (modo in ('TEST','SUPERVISADO','AUTONOMO')),
  presupuesto_mes_eur numeric not null default 50,
  gasto_mes_eur numeric not null default 0,
  updated_at timestamptz not null default now()
);
alter table studio_config enable row level security;
drop policy if exists studio_config_own on studio_config;
create policy studio_config_own on studio_config for all using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists studio_conexiones (
  id text primary key,
  habilitada boolean not null default true,
  ultimo_ok timestamptz,
  detalle text,
  updated_at timestamptz not null default now()
);
alter table studio_conexiones enable row level security;
-- Sin políticas: solo se accede desde el servidor (clave de servicio), nunca desde el navegador.
