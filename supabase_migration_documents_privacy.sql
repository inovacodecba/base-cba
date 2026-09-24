-- Adiciona privacidade por pasta na aba "Documentos" (pastas Públicas x
-- Privadas). Rode DEPOIS do supabase_migration_documents.sql (esse aqui só
-- funciona se as tabelas de Documentos já existirem).
--
-- IMPORTANTE — leia antes de rodar: isso NÃO cria uma regra de acesso real
-- no banco. As políticas de RLS de `doc_folders`/`documents` continuam
-- abertas (`using (true)`), o mesmo modelo que o resto do sistema já usa
-- hoje. Marcar uma pasta como "privada" esconde ela da INTERFACE para quem
-- não é o dono (nem o admin) — não impede alguém com acesso técnico à API
-- do Supabase de ler o registro diretamente. Isso é o mesmo tipo de
-- limitação já sinalizado na revisão geral do site
-- (REVISAO-COMPLETA-2026-08-10.md) — endurecer isso de verdade exige RLS
-- baseado em autenticação real do Supabase, uma mudança estrutural maior.

alter table doc_folders add column if not exists is_private boolean not null default false;
