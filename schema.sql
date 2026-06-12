create extension if not exists "pgcrypto";

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  volume numeric,
  unit text,
  category text,
  created_at timestamptz default now()
);

create table if not exists price_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  store_name text,
  price numeric not null,
  created_at timestamptz default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  item_name text not null,
  quantity text,
  memo text,
  purchased boolean default false,
  created_at timestamptz default now()
);

alter table shopping_items add column if not exists product_id uuid references products(id) on delete set null;

alter table products enable row level security;
alter table price_records enable row level security;
alter table shopping_items enable row level security;

drop policy if exists "public products" on products;
drop policy if exists "public price records" on price_records;
drop policy if exists "public shopping items" on shopping_items;

create policy "public products" on products for all using (true) with check (true);
create policy "public price records" on price_records for all using (true) with check (true);
create policy "public shopping items" on shopping_items for all using (true) with check (true);
