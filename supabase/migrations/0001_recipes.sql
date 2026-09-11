-- The recipe catalog.
--
-- What a recipe is lives here: its name, its full content and a preview. Who
-- owns it does not. That belongs to RecipeBook, on the chain, and this table
-- deliberately has no author column that could disagree with it. The backpack
-- asks the chain which recipes an address owns, then reads their content here.
--
-- A recipe's id is the hash of its content, the same id RecipeBook records, so
-- anything read from this table can be checked against the id it is filed
-- under. The catalog can be incomplete; it cannot quietly be wrong.

create table if not exists public.recipes (
  id            text primary key check (id ~ '^0x[0-9a-f]{64}$'),
  name          text not null,
  recipe        jsonb not null,
  preview_path  text,
  created_at    timestamptz not null default now()
);

-- Anyone may read the catalog. Nobody may write to it with the public key:
-- writes come from the agent, with the secret key, which bypasses these rules.
alter table public.recipes enable row level security;

drop policy if exists "the catalog is public" on public.recipes;
create policy "the catalog is public" on public.recipes
  for select to anon, authenticated
  using (true);

-- Previews, served publicly. Uploads use the secret key as well.
insert into storage.buckets (id, name, public)
values ('previews', 'previews', true)
on conflict (id) do nothing;
