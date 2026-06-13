create extension if not exists "pgcrypto";

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  volume numeric,
  unit text,
  category text,
  is_favorite boolean default false,
  created_at timestamptz default now()
);

create table if not exists price_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  store_name text,
  price numeric not null,
  member_name text,
  created_at timestamptz default now()
);


create table if not exists approved_accounts (
  account_name text primary key,
  created_by text,
  created_at timestamptz default now()
);

insert into approved_accounts (account_name, created_by)
values ('kazuki', 'system'), ('Yoshino', 'kazuki')
on conflict (account_name) do nothing;


create table if not exists support_settings (
  id text primary key default 'default',
  paypay_id text,
  paypay_url text,
  message text,
  updated_by text,
  updated_at timestamptz default now()
);

insert into support_settings (id, message, updated_by)
values ('default', '無料で便利に使えるアプリを目指しています。応援いただけると開発継続の励みになります。', 'system')
on conflict (id) do nothing;

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  item_name text not null,
  quantity text,
  memo text,
  family_code text default 'default',
  member_name text,
  purchased boolean default false,
  created_at timestamptz default now()
);

alter table products add column if not exists is_favorite boolean default false;
alter table price_records add column if not exists member_name text;
alter table shopping_items add column if not exists product_id uuid references products(id) on delete set null;
alter table shopping_items add column if not exists family_code text default 'default';
alter table shopping_items add column if not exists member_name text;
update shopping_items set family_code = 'default' where family_code is null;
create index if not exists idx_shopping_items_family_code on shopping_items(family_code);
create index if not exists idx_products_is_favorite on products(is_favorite);
create index if not exists idx_price_records_product_created on price_records(product_id, created_at desc);

alter table products enable row level security;
alter table price_records enable row level security;
alter table shopping_items enable row level security;
alter table approved_accounts enable row level security;
alter table support_settings enable row level security;

drop policy if exists "public products" on products;
drop policy if exists "public price records" on price_records;
drop policy if exists "public shopping items" on shopping_items;
drop policy if exists "public approved accounts" on approved_accounts;
drop policy if exists "public support settings" on support_settings;

create policy "public products" on products for all using (true) with check (true);
create policy "public price records" on price_records for all using (true) with check (true);
create policy "public shopping items" on shopping_items for all using (true) with check (true);
create policy "public approved accounts" on approved_accounts for all using (true) with check (true);
create policy "public support settings" on support_settings for all using (true) with check (true);

alter table products add column if not exists image_data text;
