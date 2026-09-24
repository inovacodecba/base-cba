-- ============================================================================
-- Inventário CBA — colunas de posição no "Mapa" para a tabela "sectors"
-- Rode DEPOIS de já ter rodado o supabase_migration_sectors.sql anterior.
-- Painel Supabase > SQL Editor > New query > Run.
--
-- Guarda a posição (x/y relativos, de 0 a 1) que cada Local ocupa no mapa
-- esquemático da tela "Mapa". Fica null até alguém posicionar aquele local
-- pela primeira vez — o app trata "sem posição" mostrando o local numa lista
-- separada abaixo do mapa, ainda clicável para posicionar.
-- ============================================================================

alter table public.sectors
  add column if not exists map_x double precision,
  add column if not exists map_y double precision;
