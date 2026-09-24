-- Base de Dados (ex-"Inventário CBA") — Endurecimento de segurança, etapa 1
-- Aplicada direto no banco em 17/08/2026 via conector Supabase do Claude
-- (não precisa rodar de novo — este arquivo é só o registro do que já foi
-- feito, pra não perder o histórico como aconteceu com o restante do schema
-- que nunca tinha sido versionado). Ver REVISAO-COMPLETA-2026-08-10.md e
-- claude/progresso-melhorias-ux.md (Projeto Claude) pro contexto completo.
--
-- O que resolve: as tabelas items, movimentacoes e team estavam com Row
-- Level Security (RLS) TOTALMENTE DESLIGADO — nem era "liberado demais",
-- era "sem trava nenhuma". O relatório de segurança do próprio Supabase
-- marcava isso como CRÍTICO. Esta migração liga o RLS nelas com política
-- equivalente à que o resto do banco já usava (anon+authenticated
-- liberado) — ou seja, NÃO reduz nem aumenta o que já era possível fazer
-- hoje, só formaliza a trava que faltava. Continua liberado demais de
-- propósito nesta etapa — a etapa 2 (autenticação real via usuário
-- "sombra" no Supabase Auth, ver Edge Function supabase/functions/
-- session-login) é o que vai finalmente restringir isso de verdade,
-- exigindo sessão autenticada em vez de liberar pra qualquer um com a
-- chave pública.

alter table public.items enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.team enable row level security;

create policy "items_select_anon" on public.items for select to anon, authenticated using (true);
create policy "items_insert_anon" on public.items for insert to anon, authenticated with check (true);
create policy "items_update_anon" on public.items for update to anon, authenticated using (true) with check (true);
create policy "items_delete_anon" on public.items for delete to anon, authenticated using (true);

create policy "movimentacoes_select_anon" on public.movimentacoes for select to anon, authenticated using (true);
create policy "movimentacoes_insert_anon" on public.movimentacoes for insert to anon, authenticated with check (true);
create policy "movimentacoes_update_anon" on public.movimentacoes for update to anon, authenticated using (true) with check (true);
create policy "movimentacoes_delete_anon" on public.movimentacoes for delete to anon, authenticated using (true);

create policy "team_select_anon" on public.team for select to anon, authenticated using (true);
create policy "team_insert_anon" on public.team for insert to anon, authenticated with check (true);
create policy "team_delete_anon" on public.team for delete to anon, authenticated using (true);

-- Quem é admin passa a viver no banco (coluna nova), não só como uma
-- constante no código do site (src/constants.js, ADMIN = "Francisco
-- Rufino") — isso é o que a Edge Function session-login usa pra marcar o
-- token de sessão de cada pessoa como admin ou não, de um jeito que dá
-- pra checar de verdade nas políticas de RLS da etapa 2.
alter table public.team add column if not exists is_admin boolean not null default false;
update public.team set is_admin = true where name = 'Francisco Rufino';
