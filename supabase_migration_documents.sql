-- Aba "Documentos" — pastas e arquivos anexados (veículos, contratos, notas
-- fiscais, etc.). Rode este script inteiro no SQL Editor do Supabase.
--
-- Segue o MESMO padrão de acesso já usado em sectors/categories/equipamentos_rede
-- neste projeto (RLS liberado para anon/authenticated). Isso é consistente com
-- o resto do sistema hoje, mas é um ponto já sinalizado na revisão geral do
-- site (REVISAO-COMPLETA-2026-08-10.md) como algo a endurecer mais pra frente,
-- junto com as outras tabelas.

-- 1) Pastas (suporta pasta dentro de pasta via parent_id)
create table if not exists doc_folders (
  id bigint generated always as identity primary key,
  name text not null,
  parent_id bigint references doc_folders(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists doc_folders_parent_idx on doc_folders(parent_id);

alter table doc_folders enable row level security;
create policy "doc_folders select" on doc_folders for select to anon, authenticated using (true);
create policy "doc_folders insert" on doc_folders for insert to anon, authenticated with check (true);
create policy "doc_folders update" on doc_folders for update to anon, authenticated using (true) with check (true);
create policy "doc_folders delete" on doc_folders for delete to anon, authenticated using (true);

-- 2) Documentos (metadados; o arquivo em si fica no Storage, ver bucket abaixo)
create table if not exists documents (
  id bigint generated always as identity primary key,
  name text not null,
  folder_id bigint references doc_folders(id) on delete cascade,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists documents_folder_idx on documents(folder_id);

alter table documents enable row level security;
create policy "documents select" on documents for select to anon, authenticated using (true);
create policy "documents insert" on documents for insert to anon, authenticated with check (true);
create policy "documents update" on documents for update to anon, authenticated using (true) with check (true);
create policy "documents delete" on documents for delete to anon, authenticated using (true);

-- 3) Bucket de Storage para os arquivos em si.
--    Público: o link direto funciona sem precisar gerar URL assinada a cada
--    visualização/download — consistente com o modelo de acesso atual do
--    resto do sistema (a chave pública do Supabase já fica exposta no site).
insert into storage.buckets (id, name, public)
values ('documentos-cba', 'documentos-cba', true)
on conflict (id) do nothing;

create policy "documentos-cba select" on storage.objects for select to anon, authenticated
  using (bucket_id = 'documentos-cba');
create policy "documentos-cba insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documentos-cba');
create policy "documentos-cba update" on storage.objects for update to anon, authenticated
  using (bucket_id = 'documentos-cba');
create policy "documentos-cba delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'documentos-cba');
