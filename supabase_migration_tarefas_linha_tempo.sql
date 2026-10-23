-- Linha do tempo das tarefas (23/10/2026) — registro do que foi aplicado
-- direto no Supabase (migração `tarefas_data_inicio`). Só registro.
--
-- • tarefas.data_inicio: início da barra na aba "Linha do tempo" (o fim é o
--   `prazo`). Tarefa com data_inicio = está na linha do tempo; tirar da
--   linha do tempo = data_inicio volta a null (o prazo fica).
-- • tarefas_log_historico: passa a registrar mudança de início ('inicio').
--   (Corpo completo da função em supabase_migration_tarefas_notion.sql,
--   com este bloco a mais antes do de 'descricao'.)

alter table public.tarefas add column if not exists data_inicio date;
create index if not exists tarefas_data_inicio_idx on public.tarefas(data_inicio) where data_inicio is not null;

--   if new.data_inicio is distinct from old.data_inicio then
--     insert into tarefa_historico(tarefa_id, autor, campo, de, para)
--     values (new.id, quem, 'inicio', old.data_inicio::text, new.data_inicio::text);
--   end if;
