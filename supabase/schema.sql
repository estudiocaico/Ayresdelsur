-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA: Ayres del Sur - Sistema de Preventa
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. EXTENSION UUID ──────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 2. PROFILES (extiende auth.users de Supabase) ─────────────────────────
create table profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  role  text not null check (role in ('admin', 'cliente')) default 'cliente'
);

-- Trigger: crear perfil automaticamente al registrar usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role) values (new.id, 'cliente');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 3. CLIENTES ────────────────────────────────────────────────────────────
create table clientes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique references auth.users(id) on delete cascade,
  nombre_negocio  text not null,
  razon_social    text,
  cuit            text,
  direccion       text not null,
  telefono        text,
  email           text not null,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── 4. CATEGORIAS ──────────────────────────────────────────────────────────
create table categorias (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  parent_id   uuid references categorias(id) on delete set null,
  imagen_url  text,
  created_at  timestamptz not null default now()
);

-- ── 5. PRODUCTOS ───────────────────────────────────────────────────────────
create table productos (
  id              uuid primary key default uuid_generate_v4(),
  codigo_interno  text unique not null,
  ean             text,
  nombre          text not null,
  descripcion     text,
  categoria_id    uuid references categorias(id) on delete set null,
  precio          numeric(12, 2) not null check (precio >= 0),
  unidad          text not null default 'unidad' check (unidad in ('unidad', 'caja', 'pack')),
  imagen_url      text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Trigger: actualizar updated_at automaticamente
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger productos_updated_at
  before update on productos
  for each row execute function update_updated_at();

-- ── 6. VARIANTES DE PRODUCTO ───────────────────────────────────────────────
create table variantes_producto (
  id                uuid primary key default uuid_generate_v4(),
  producto_id       uuid not null references productos(id) on delete cascade,
  nombre_variante   text not null default 'Variante',
  valor             text not null,
  precio_adicional  numeric(12, 2) not null default 0
);

-- ── 7. PREPEDIDOS ──────────────────────────────────────────────────────────
create table prepedidos (
  id                 uuid primary key default uuid_generate_v4(),
  numero_referencia  text unique not null,
  cliente_id         uuid not null references clientes(id) on delete restrict,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'revisado', 'cerrado', 'cancelado')),
  total              numeric(12, 2) not null default 0,
  notas_admin        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger prepedidos_updated_at
  before update on prepedidos
  for each row execute function update_updated_at();

-- ── 8. ITEMS DE PREPEDIDO ──────────────────────────────────────────────────
create table items_prepedido (
  id               uuid primary key default uuid_generate_v4(),
  prepedido_id     uuid not null references prepedidos(id) on delete cascade,
  producto_id      uuid not null references productos(id) on delete restrict,
  variante_id      uuid references variantes_producto(id) on delete set null,
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  numeric(12, 2) not null,
  subtotal         numeric(12, 2) not null
);

-- ── 9. INDICES ─────────────────────────────────────────────────────────────
create index idx_productos_categoria    on productos(categoria_id);
create index idx_productos_activo       on productos(activo);
create index idx_prepedidos_cliente     on prepedidos(cliente_id);
create index idx_prepedidos_estado      on prepedidos(estado);
create index idx_prepedidos_created     on prepedidos(created_at desc);
create index idx_items_prepedido        on items_prepedido(prepedido_id);
create index idx_variantes_producto_id  on variantes_producto(producto_id);

-- ── 10. ROW LEVEL SECURITY (RLS) ───────────────────────────────────────────
alter table profiles          enable row level security;
alter table clientes          enable row level security;
alter table categorias        enable row level security;
alter table productos         enable row level security;
alter table variantes_producto enable row level security;
alter table prepedidos        enable row level security;
alter table items_prepedido   enable row level security;

-- Helper: saber si el usuario actual es admin
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: obtener cliente_id del usuario actual
create or replace function my_cliente_id()
returns uuid language sql security definer stable as $$
  select id from clientes where user_id = auth.uid() limit 1;
$$;

-- PROFILES
create policy "Ver propio perfil"   on profiles for select using (id = auth.uid());
create policy "Admin ve todos"      on profiles for select using (is_admin());

-- CLIENTES
create policy "Cliente ve su perfil" on clientes for select using (user_id = auth.uid());
create policy "Admin gestiona todo"  on clientes for all using (is_admin());

-- CATEGORIAS (lectura publica para usuarios autenticados, escritura solo admin)
create policy "Ver categorias"     on categorias for select using (auth.uid() is not null);
create policy "Admin edita cats"   on categorias for all using (is_admin());

-- PRODUCTOS (lectura publica autenticada, escritura admin)
create policy "Ver productos activos" on productos for select using (auth.uid() is not null and activo = true);
create policy "Admin ve todos prods"  on productos for select using (is_admin());
create policy "Admin edita prods"     on productos for all using (is_admin());

-- VARIANTES
create policy "Ver variantes"    on variantes_producto for select using (auth.uid() is not null);
create policy "Admin edita vars" on variantes_producto for all using (is_admin());

-- PREPEDIDOS
create policy "Cliente ve sus pedidos"  on prepedidos for select using (cliente_id = my_cliente_id());
create policy "Cliente crea pedidos"    on prepedidos for insert with check (cliente_id = my_cliente_id());
create policy "Admin gestiona pedidos"  on prepedidos for all using (is_admin());

-- ITEMS PREPEDIDO
create policy "Cliente ve sus items"   on items_prepedido for select
  using (prepedido_id in (select id from prepedidos where cliente_id = my_cliente_id()));
create policy "Cliente inserta items"  on items_prepedido for insert
  with check (prepedido_id in (select id from prepedidos where cliente_id = my_cliente_id()));
create policy "Admin gestiona items"   on items_prepedido for all using (is_admin());
