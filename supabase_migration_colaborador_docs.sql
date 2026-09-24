-- ============================================================================
-- Inventário CBA — tabela "colaborador_docs" (Documentos > "Documentos da
-- Equipe"): controle de validade de documentos por colaborador (ASO, Ficha
-- de EPI, treinamentos de segurança do trabalho na CBA etc.).
-- Rode no Supabase: Painel > SQL Editor > New query > Run.
--
-- Substitui a planilha "MATRIZ DOCUMENTAL – BANCO DE DOCUMENTOS" que a
-- empresa usava no Google Sheets — os 25 registros reais (com "Documento"
-- preenchido) foram importados abaixo como ponto de partida. Linhas em
-- branco/modelo da planilha original (sem nome de documento) não foram
-- trazidas. O status (Válido / Vence em breve / Vencido) NÃO é armazenado —
-- é calculado no app a partir de "data_vencimento" comparado com hoje, pra
-- nunca ficar desatualizado (a planilha original tinha esse problema: a
-- coluna "Dias p/ Vencer" ficava com valores quebrados como "-46246" quando
-- a data de vencimento estava em branco).
--
-- Mesmo padrão de acesso já usado no resto do projeto (RLS liberado pra
-- anon/authenticated — ver REVISAO-COMPLETA-2026-08-10.md). A privacidade
-- "cada colaborador só vê o próprio registro + o admin vê tudo" é uma
-- checagem de INTERFACE, feita no app — não é uma trava real do banco.
-- ============================================================================

create table if not exists public.colaborador_docs (
  id bigint generated always as identity primary key,
  colaborador text not null,       -- precisa bater exatamente com o nome usado no login (tabela "team")
  documento text not null,          -- nome do documento/treinamento (ex.: "ASO", "Trabalho em Altura - CBA")
  data_emissao date,
  data_vencimento date,
  observacoes text,
  responsavel text,                 -- pessoa/RH responsável por esse documento (texto livre, não é login do sistema)
  email_colaborador text,           -- guardado pra uso futuro (aviso por e-mail — ainda não implementado)
  email_responsavel text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists colaborador_docs_colaborador_idx on public.colaborador_docs(colaborador);

alter table public.colaborador_docs enable row level security;
create policy "colaborador_docs select" on public.colaborador_docs for select to anon, authenticated using (true);
create policy "colaborador_docs insert" on public.colaborador_docs for insert to anon, authenticated with check (true);
create policy "colaborador_docs update" on public.colaborador_docs for update to anon, authenticated using (true) with check (true);
create policy "colaborador_docs delete" on public.colaborador_docs for delete to anon, authenticated using (true);

-- Semeia com os registros reais importados da planilha em 13/08/2026. Não
-- faz nada se a tabela já tiver dados (evita duplicar caso rode 2x).
insert into public.colaborador_docs
  (colaborador, documento, data_emissao, data_vencimento, responsavel, email_colaborador, email_responsavel)
select * from (values
  ('Lucas Davi', 'Ficha de Entrega de EPIs', date '2025-10-24', date '2026-06-06', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Lucas Davi', 'ASO', date '2025-10-31', date '2026-10-30', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),

  ('Alisson Mendonça', 'Ficha de Entrega de EPIs', null, date '2026-06-25', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Alisson Mendonça', 'ASO', date '2025-07-31', date '2026-07-30', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Alisson Mendonça', 'Ambiente Confinado - CBA', date '2024-04-15', date '2026-04-14', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Alisson Mendonça', 'Bloqueio e Isolamento de Energias - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'Compliance CBA', date '2024-04-15', date '2099-04-15', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Alisson Mendonça', 'Ferramentas Manuais - CBA', date '2025-04-25', date '2027-04-24', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Alisson Mendonça', 'Animais Peçonhentos - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'Gerenciamento de Produtos Químicos - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'Integração Setorizada', date '2025-05-20', date '2033-08-19', null, null, null),
  ('Alisson Mendonça', 'Movimentação de Carga Suspensa - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'PG VM AL SSMA 054', date '2026-04-30', date '2028-04-29', null, null, null),
  ('Alisson Mendonça', 'PG-VM-AL-SSMA 47 – Integração de Terceiros', date '2025-04-16', date '2099-04-15', null, null, null),
  ('Alisson Mendonça', 'Materiais Fundidos - CBA', date '2025-04-25', date '2027-04-24', null, null, null),
  ('Alisson Mendonça', 'Sistemas Pressurizados - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'Trabalho a Quente - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'Trabalho em Altura - CBA', date '2024-04-15', date '2026-04-14', null, null, null),
  ('Alisson Mendonça', 'Veículos e Equipamentos Móveis - CBA', date '2026-04-24', date '2028-04-23', null, null, null),

  ('Lucas Dias', 'Ficha de Entrega de EPIs', null, date '2027-04-22', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Lucas Dias', 'ASO', null, null, 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),

  ('Francisco Rufino', 'Ficha de Entrega de EPIs', null, date '2026-09-18', 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Francisco Rufino', 'ASO', null, null, 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),

  ('Thiago Santana', 'Ficha de Entrega de EPIs', null, null, 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com'),
  ('Thiago Santana', 'ASO', null, null, 'Leandra Freitas', 'franciscorufino@inovacode.com.br', 'financeiroinovacode@gmail.com')
) as v(colaborador, documento, data_emissao, data_vencimento, responsavel, email_colaborador, email_responsavel)
where not exists (select 1 from public.colaborador_docs);
