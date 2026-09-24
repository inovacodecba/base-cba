-- ============================================================================
-- Inventário CBA — alerta por e-mail de treinamento vencendo (parte 2, depois
-- do alerta dentro do site já entregue).
-- Rode no Supabase: Painel > SQL Editor > New query > Run.
--
-- Só adiciona UMA coluna nova em "colaborador_docs": "alert_sent_at" — guarda
-- QUANDO o e-mail de "faltando 1 mês" foi enviado pra aquele registro
-- específico, pra Edge Function (ver supabase/functions/send-training-alerts)
-- não mandar o mesmo aviso de novo toda vez que rodar (você escolheu "uma vez
-- só" em vez de repetir toda semana).
--
-- Importante: isso NÃO é o "status" do treinamento (Válido/Vencendo/Vencido)
-- — aquele continua sempre calculado na hora, nunca armazenado (ver
-- docStatus() em src/components/documents/helpers.js). "alert_sent_at" é só
-- um controle de "já avisei ou não", histórico de notificação — dado
-- diferente, tudo bem guardar.
-- ============================================================================

alter table public.colaborador_docs
  add column if not exists alert_sent_at timestamptz;

comment on column public.colaborador_docs.alert_sent_at is
  'Quando o e-mail de "treinamento vencendo em até 1 mês" foi enviado pra este registro. NULL = ainda não avisado. Usado só pra não repetir o e-mail — não é o status do treinamento.';
