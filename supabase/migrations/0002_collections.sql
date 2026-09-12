-- Copies got from the marketplace.
--
-- Getting a recipe means the agent crafts it for you and its author is paid on
-- RecipeBook. The payment is on the chain; who it was for is not, because today
-- the agent pays and the chain sees the agent. So the collector is noted here,
-- written only by the agent. Once each person pays for their own crafts, the
-- chain will say this by itself and this table can go.

create table if not exists public.collections (
  id           bigserial primary key,
  collector    text not null check (collector ~ '^0x[0-9a-f]{40}$'),
  recipe_id    text not null references public.recipes (id),
  chain        text,
  transaction  text,
  created_at   timestamptz not null default now()
);

create index if not exists collections_by_collector on public.collections (collector);

-- Anyone may read who collected what; only the agent, with the secret key, may
-- write it.
alter table public.collections enable row level security;

drop policy if exists "collections are public" on public.collections;
create policy "collections are public" on public.collections
  for select to anon, authenticated
  using (true);
