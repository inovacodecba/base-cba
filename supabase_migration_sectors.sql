-- ============================================================================
-- Inventário CBA — nova tabela "sectors" (Locais)
-- Rode este script no Supabase: Painel > SQL Editor > New query > Run.
-- Sem isso, o app usa uma lista local fixa (Escritório/Armário/Central de
-- Reparos) como fallback e a tela "Locais" não terá onde salvar as mudanças.
-- ============================================================================

create table if not exists public.sectors (
  id bigint generated always as identity primary key,
  name text not null unique,
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);

-- Semeia os 3 locais que já existem hoje no app, todos marcados como "base"
-- (fazem parte do almoxarifado). Não faz nada se a tabela já tiver dados.
insert into public.sectors (name, is_base)
values
  ('Escritório', true),
  ('Armário', true),
  ('Central de Reparos', true)
on conflict (name) do nothing;

-- RLS: mesmo padrão já usado pela tabela "team" (acesso liberado para a
-- chave anon/publishable, já que o controle de acesso do app é feito por
-- login próprio, não pelo Supabase Auth). Ajuste aqui se decidir apertar
-- as políticas de "team" no futuro — o ideal é manter as duas iguais.
alter table public.sectors enable row level security;

create policy "sectors_select_anon" on public.sectors
  for select to anon, authenticated using (true);

create policy "sectors_insert_anon" on public.sectors
  for insert to anon, authenticated with check (true);

create policy "sectors_update_anon" on public.sectors
  for update to anon, authenticated using (true) with check (true);

create policy "sectors_delete_anon" on public.sectors
  for delete to anon, authenticated using (true);
