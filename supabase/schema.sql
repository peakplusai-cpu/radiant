-- Run once in the Supabase SQL editor.
create table if not exists public.radiant_store (
  id int primary key check (id = 1),
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.radiant_store (id) values (1) on conflict (id) do nothing;

-- Only the server (service role key) touches this table.
alter table public.radiant_store enable row level security;

insert into storage.buckets (id, name, public)
values ('radiant-uploads', 'radiant-uploads', true)
on conflict (id) do nothing;
