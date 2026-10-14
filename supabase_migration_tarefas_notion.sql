-- Tarefas "estilo Notion" (10/2026) — registro do que foi aplicado direto no
-- Supabase (migração `tarefas_notion`). Só registro, não roda sozinho.
--
-- • projetos: agrupa tarefas (página do projeto + % concluído)
-- • tarefas.parent_id: subtarefa / "Tarefa principal" (apaga junto com a mãe)
-- • tarefas.projeto_id, tarefas.checklist (jsonb [{id,texto,feito}]),
--   tarefas.anexos (jsonb [{path,nome,tipo,tamanho}] — arquivos no bucket
--   documentos-cba, pasta tarefas/<id>/)
-- • tarefa_comentarios: autor vem do token (display_name), não do front
-- • tarefa_historico: preenchido só por trigger (ninguém insere pelo app)

create table if not exists public.projetos (
  id bigint generated always as identity primary key,
  nome text not null check (length(trim(nome)) between 1 and 120),
  descricao text,
  cor text,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido')),
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table public.projetos enable row level security;
create policy projetos_select_auth on public.projetos for select to authenticated using (true);
create policy projetos_insert_auth on public.projetos for insert to authenticated with check (true);
create policy projetos_update_auth on public.projetos for update to authenticated using (true);
create policy projetos_delete_auth on public.projetos for delete to authenticated using (true);

alter table public.tarefas
  add column if not exists parent_id bigint references public.tarefas(id) on delete cascade,
  add column if not exists projeto_id bigint references public.projetos(id) on delete set null,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists anexos jsonb not null default '[]'::jsonb;
alter table public.tarefas add constraint tarefas_parent_not_self check (parent_id is null or parent_id <> id);
create index if not exists tarefas_parent_id_idx on public.tarefas(parent_id);
create index if not exists tarefas_projeto_id_idx on public.tarefas(projeto_id);

create table if not exists public.tarefa_comentarios (
  id bigint generated always as identity primary key,
  tarefa_id bigint not null references public.tarefas(id) on delete cascade,
  autor text not null default coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', 'Desconhecido'),
  texto text not null check (length(trim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now()
);
create index if not exists tarefa_comentarios_tarefa_idx on public.tarefa_comentarios(tarefa_id, criado_em);
alter table public.tarefa_comentarios enable row level security;
create policy tarefa_comentarios_select on public.tarefa_comentarios for select to authenticated using (true);
-- (migração `tarefa_comentarios_uid`) dono do comentário = auth.uid(), não o
-- user_metadata (que a própria pessoa consegue editar). `autor` é só o nome exibido.
alter table public.tarefa_comentarios add column autor_uid uuid not null default auth.uid();
create policy tarefa_comentarios_insert on public.tarefa_comentarios for insert to authenticated
  with check (autor_uid = auth.uid());
create policy tarefa_comentarios_delete_own on public.tarefa_comentarios for delete to authenticated
  using (autor_uid = auth.uid() or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false));

create table if not exists public.tarefa_historico (
  id bigint generated always as identity primary key,
  tarefa_id bigint not null references public.tarefas(id) on delete cascade,
  autor text not null,
  campo text not null,
  de text,
  para text,
  criado_em timestamptz not null default now()
);
create index if not exists tarefa_historico_tarefa_idx on public.tarefa_historico(tarefa_id, criado_em);
alter table public.tarefa_historico enable row level security;
create policy tarefa_historico_select on public.tarefa_historico for select to authenticated using (true);
-- sem policy de insert/update/delete: só o trigger (security definer) escreve

create or replace function public.tarefas_log_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quem text := coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', 'Sistema');
  done_old int; done_new int;
begin
  if tg_op = 'INSERT' then
    insert into tarefa_historico(tarefa_id, autor, campo, para) values (new.id, quem, 'criou', new.titulo);
    return new;
  end if;
  if new.titulo is distinct from old.titulo then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'titulo', old.titulo, new.titulo);
  end if;
  if new.status is distinct from old.status then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'status', old.status, new.status);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'prioridade', old.prioridade, new.prioridade);
  end if;
  if new.prazo is distinct from old.prazo then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'prazo', old.prazo::text, new.prazo::text);
  end if;
  if new.responsaveis is distinct from old.responsaveis then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'responsaveis', array_to_string(old.responsaveis, ', '), array_to_string(new.responsaveis, ', '));
  end if;
  if new.categoria is distinct from old.categoria then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'categoria', old.categoria, new.categoria);
  end if;
  if new.projeto_id is distinct from old.projeto_id then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'projeto',
      (select nome from projetos where id = old.projeto_id), (select nome from projetos where id = new.projeto_id));
  end if;
  if new.parent_id is distinct from old.parent_id then
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'principal',
      (select titulo from tarefas where id = old.parent_id), (select titulo from tarefas where id = new.parent_id));
  end if;
  if new.descricao is distinct from old.descricao then
    insert into tarefa_historico(tarefa_id, autor, campo) values (new.id, quem, 'descricao');
  end if;
  if new.checklist is distinct from old.checklist then
    select count(*) filter (where (e ->> 'feito')::boolean) into done_old from jsonb_array_elements(old.checklist) e;
    select count(*) filter (where (e ->> 'feito')::boolean) into done_new from jsonb_array_elements(new.checklist) e;
    insert into tarefa_historico(tarefa_id, autor, campo, de, para) values (new.id, quem, 'checklist',
      done_old || '/' || jsonb_array_length(old.checklist), done_new || '/' || jsonb_array_length(new.checklist));
  end if;
  if jsonb_array_length(new.anexos) > jsonb_array_length(old.anexos) then
    insert into tarefa_historico(tarefa_id, autor, campo, para) values (new.id, quem, 'anexo+',
      (select string_agg(e ->> 'nome', ', ') from jsonb_array_elements(new.anexos) e where not old.anexos @> jsonb_build_array(e)));
  elsif jsonb_array_length(new.anexos) < jsonb_array_length(old.anexos) then
    insert into tarefa_historico(tarefa_id, autor, campo, de) values (new.id, quem, 'anexo-',
      (select string_agg(e ->> 'nome', ', ') from jsonb_array_elements(old.anexos) e where not new.anexos @> jsonb_build_array(e)));
  end if;
  return new;
end;
$$;
revoke all on function public.tarefas_log_historico() from public, anon, authenticated;

create trigger tarefas_historico_ins after insert on public.tarefas for each row execute function public.tarefas_log_historico();
create trigger tarefas_historico_upd after update on public.tarefas for each row execute function public.tarefas_log_historico();
