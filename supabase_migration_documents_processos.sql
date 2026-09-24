-- Cria a aba "Processos" dentro de Documentos como uma seção de verdade
-- (mesmo nível de "Pastas" e "Treinamentos"), reaproveitando 100% da
-- estrutura de pastas/documentos que já existe — nenhuma tabela nova.
--
-- Rode DEPOIS de supabase_migration_documents.sql (esse aqui só funciona se
-- `doc_folders`/`documents` já existirem).
--
-- Como funciona: adiciona uma coluna `is_processos_root` em `doc_folders` e
-- cria UMA única pasta especial ("Processos", na raiz) marcada com essa
-- coluna. Ela é o "teto" técnico de toda a árvore de Processos — tudo que
-- for criado dentro dela (fluxogramas de RFID, outros procedimentos, e
-- subpastas à vontade) usa exatamente o mesmo CRUD, upload, privacidade e
-- arrastar-e-soltar que a aba Pastas já tem, sem nenhum código duplicado.
-- Essa pasta nunca aparece na listagem normal de Pastas nem pode ser
-- renomeada/excluída pela grade — ela só existe como ponto de entrada da
-- aba Processos.

-- Defensivo: garante que a coluna de privacidade já exista antes do insert
-- abaixo, mesmo que supabase_migration_documents_privacy.sql ainda não
-- tenha sido rodada neste banco (idempotente — não faz nada se já existir).
alter table doc_folders add column if not exists is_private boolean not null default false;

alter table doc_folders add column if not exists is_processos_root boolean not null default false;

-- Garante no máximo uma pasta-raiz de Processos, mesmo que a migração seja
-- rodada mais de uma vez por engano.
create unique index if not exists doc_folders_processos_root_uniq
  on doc_folders (is_processos_root) where is_processos_root;

insert into doc_folders (name, parent_id, created_by, is_private, is_processos_root)
select 'Processos', null, null, false, true
where not exists (select 1 from doc_folders where is_processos_root);
