-- Run in the Supabase SQL editor after reviewing. This does not rewrite product JSON.
-- Size and stock changes are applied by the app the next time it reads the store,
-- and they are saved on the next order or admin save. Review per-size quantities in /admin/products.

alter table public.radiant_store enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'radiant_store'
  loop
    execute format('drop policy if exists %I on public.radiant_store', r.policyname);
  end loop;
end $$;

revoke all on table public.radiant_store from anon, authenticated;

-- Product photos stay readable at their public URLs. Do not add an INSERT policy for anon.
insert into storage.buckets (id, name, public)
values ('radiant-uploads', 'radiant-uploads', true)
on conflict (id) do nothing;
