-- ============================================================================
-- Inventário CBA — nova tabela "categories" (Categorias)
-- Rode este script no Supabase: Painel > SQL Editor > New query > Run.
-- Sem isso, o app usa uma lista local fixa (Rede/Ferramentas/Eletrônicos/
-- Impressão/EPI/Diversos) como fallback e a tela "Categorias" não terá onde
-- salvar as mudanças. Mesmo padrão da tabela "sectors" (Locais).
-- ============================================================================

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Semeia as 6 categorias que já existem hoje no app. Não faz nada se a
-- tabela já tiver dados.
insert into public.categories (name)
values
  ('Rede'),
  ('Ferramentas'),
  ('Eletrônicos'),
  ('Impressão'),
  ('EPI'),
  ('Diversos')
on conflict (name) do nothing;

-- RLS: mesmo padrão já usado pelas tabelas "team" e "sectors" (acesso
-- liberado para a chave anon/publishable, já que o controle de acesso do
-- app é feito por login próprio, não pelo Supabase Auth).
alter table public.categories enable row level security;

create policy "categories_select_anon" on public.categories
  for select to anon, authenticated using (true);

create policy "categories_insert_anon" on public.categories
  for insert to anon, authenticated with check (true);

create policy "categories_update_anon" on public.categories
  for update to anon, authenticated using (true) with check (true);

create policy "categories_delete_anon" on public.categories
  for delete to anon, authenticated using (true);
