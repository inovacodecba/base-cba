-- ============================================================================
-- Inventário CBA — troca os Locais genéricos pelas áreas reais da planta
-- Rode DEPOIS de já ter rodado o supabase_migration_sectors.sql.
-- Painel Supabase > SQL Editor > New query > Run.
-- ============================================================================
--
-- Troca a lista fixa de Locais (Escritório / Armário / Central de Reparos)
-- pelas áreas reais da planta que já existem no Mapa de Equipamentos de Rede
-- (mesmo texto usado no campo "área" de cada equipamento, ver
-- src/constants.js: EQUIPAMENTOS0) — assim o Cadastro de Locais passa a
-- refletir os lugares de verdade da fábrica, em vez de uma lista genérica de
-- "tipos de armazenamento".
--
-- "Almoxarifado" entra como base (é literalmente o almoxarifado); as outras 4
-- são áreas externas de produção — mesma lógica que já existia antes com
-- Escritório/Armário/Central de Reparos sendo todas "base".
--
-- Remover as 3 antigas NÃO apaga histórico: cada item guarda o local como
-- texto solto (não é uma referência/chave estrangeira pra esta tabela), então
-- itens já cadastrados em "Escritório" etc. continuam mostrando esse texto —
-- só deixam de aparecer como opção pra novos cadastros/filtros (mesmo efeito
-- do botão "Remover" que já existe na tela Locais).

insert into public.sectors (name, is_base)
values
  ('Almoxarifado', true),
  ('Fundição 1', false),
  ('Fundição 2', false),
  ('TP', false),
  ('Vias', false)
on conflict (name) do nothing;

delete from public.sectors where name in ('Escritório', 'Armário', 'Central de Reparos');
