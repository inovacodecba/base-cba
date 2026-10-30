-- Mapa de equipamentos v2 (30/10/2026) — registro do que foi aplicado direto
-- no Supabase (migração `mapa_v2_equipamentos` + importação do KMZ
-- "Equipamentos e alcançe do amplimax (3).kmz"). Só registro.
--
-- • equipamentos_rede.dados (jsonb): { lados: [{lado:'A', mac, ip, obs}], chip }
--   — MAC e final do IP de cada lado do totem, vindos do KMZ.
-- • equipamentos_rede.categorias (text[]): 'veicular' e/ou 'materiais'
--   (mesma separação dos mapas A0; Pátio Modelo Híbrido nas duas).
-- • tarefas.equipamento_id: tarefa ligada a um equipamento do Mapa.
-- Importação: os 87 existentes foram casados por nome (+ ponto mais perto)
-- e atualizados (posição, dados, categorias); entraram 6 totens novos na
-- área "Portaria e Pátio" (Portaria, Balança externa, Entrada/Saída Pátio 1 e 2).

alter table public.equipamentos_rede
  add column if not exists dados jsonb not null default '{}'::jsonb,
  add column if not exists categorias text[] not null default '{}'::text[],
  add column if not exists updated_at timestamptz not null default now();
alter table public.equipamentos_rede add constraint equipamentos_rede_categorias_check
  check (categorias <@ array['veicular','materiais']::text[]);

alter table public.tarefas
  add column if not exists equipamento_id bigint references public.equipamentos_rede(id) on delete set null;
create index if not exists tarefas_equipamento_id_idx on public.tarefas(equipamento_id) where equipamento_id is not null;
