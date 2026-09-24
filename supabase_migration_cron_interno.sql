-- Passo único, feito por VOCÊ no SQL Editor do Supabase.
-- Objetivo: parar de depender do GitHub Actions (que não está disparando)
-- e passar a disparar o alerta de treinamentos de dentro do próprio Supabase,
-- que dá pra eu testar e conferir direto.
--
-- Onde pegar o valor do CRON_SECRET: Painel do Supabase > Edge Functions >
-- send-training-alerts > aba "Secrets" (é o mesmo valor que já está
-- configurado lá hoje). Troque o texto COLE_AQUI_O_CRON_SECRET abaixo pelo
-- valor real (aparece 2 vezes) — o resto pode rodar exatamente como está.
--
-- Esse valor fica só no seu banco (ninguém mais vê, nem eu) — eu só vou
-- conseguir ver se a chamada teve sucesso ou erro, não o segredo em si.
--
-- Correção desta versão: a primeira tentativa faltou o cabeçalho
-- "Authorization" que o Supabase exige antes mesmo de checar o
-- x-cron-secret (por isso deu 401 "Missing authorization header"). Já
-- adicionei abaixo com a chave pública (anon) do projeto — essa chave não é
-- segredo, é a mesma usada no site.

-- 0) Limpa o agendamento da tentativa anterior (que tinha o cabeçalho incompleto):
select cron.unschedule('training-alerts-daily');

-- 1) Teste imediato (roda uma vez, na hora, sem esperar o cron):
select net.http_post(
  url := 'https://aayayeytzaflbipqppwt.supabase.co/functions/v1/send-training-alerts',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFheWF5ZXl0emFmbGJpcHFwcHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDg5NzYsImV4cCI6MjA5Nzc4NDk3Nn0.g8ghGa4bJxCIMGFACccw7TY1T5H-Sq9hO7Lo3EjVdxA',
    'x-cron-secret', 'COLE_AQUI_O_CRON_SECRET'
  ),
  body := '{}'::jsonb
);

-- 2) Agendamento definitivo: todo dia às 08:00 (horário de Brasília = 11:00 UTC).
select cron.schedule(
  'training-alerts-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://aayayeytzaflbipqppwt.supabase.co/functions/v1/send-training-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFheWF5ZXl0emFmbGJpcHFwcHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDg5NzYsImV4cCI6MjA5Nzc4NDk3Nn0.g8ghGa4bJxCIMGFACccw7TY1T5H-Sq9hO7Lo3EjVdxA',
      'x-cron-secret', 'COLE_AQUI_O_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
