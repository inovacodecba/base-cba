// Edge Function "send-training-alerts" — Inventário CBA
//
// Manda um e-mail (via Resend) pra cada treinamento (ASO/EPI/treinamentos de
// "Documentos > Treinamentos") que está entrando na janela de "faltando até
// 1 mês pra vencer" (ou já vencido) e que ainda não foi avisado por e-mail
// (coluna "alert_sent_at" — ver supabase_migration_training_alerts.sql).
// Manda só UMA vez por registro (decisão do usuário: "uma vez só", não
// repetir toda semana) — depois de enviar com sucesso, marca
// "alert_sent_at" com a data/hora atual pra não repetir na próxima rodada.
//
// Não é chamada pelo site (que é hospedagem estática, GitHub Pages) — é
// disparada de fora, uma vez por dia, pelo GitHub Actions
// (.github/workflows/training-alerts-cron.yml), que já roda com o mesmo
// GitHub que hospeda o site.
//
// Segurança: exige o cabeçalho "x-cron-secret" batendo com o secret
// CRON_SECRET (configurado nesta função E no GitHub Actions) — evita que
// alguém de fora dispare e-mails só descobrindo a URL da função. Não
// verifica JWT de usuário porque quem chama é o GitHub Actions, não o site.
//
// Variáveis de ambiente necessárias (todas configuradas como "secrets" da
// função no painel do Supabase — nunca digitadas no código):
//   SUPABASE_URL              → já vem pronta automaticamente (todo projeto Supabase injeta)
//   SUPABASE_SERVICE_ROLE_KEY → já vem pronta automaticamente
//   RESEND_API_KEY            → você cria/gera no painel do Resend
//   CRON_SECRET               → você escolhe uma string aleatória qualquer
//   ALERT_FROM_EMAIL          → opcional; padrão abaixo se não configurar

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") || "Inventário CBA <rodrigojunior@inovacode.com.br>";

// E-mail que sempre recebe cópia de todo alerta, além do
// email_colaborador/email_responsavel de cada registro — pedido do
// Rodrigo pra acompanhar os vencimentos sem depender de nenhum outro
// e-mail estar cadastrado corretamente na linha.
const ALWAYS_CC = "rodrigojunior@inovacode.com.br";

// Mesma regra de "dias até vencer" usada no site (docStatus() em
// src/components/documents/helpers.js) — recalculada aqui de forma
// independente porque a Edge Function não importa código do front-end.
function diasParaVencer(dataVencimento: string): number {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento + "T00:00:00Z");
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000);
}

function emailHtml(documento: string, colaborador: string, dias: number, dataVencimento: string) {
  const vencido = dias < 0;
  const statusTexto = vencido ? `venceu há ${Math.abs(dias)} dia(s)` : `vence em ${dias} dia(s)`;
  const cor = vencido ? "#ef4444" : "#f59e0b";
  const dataFmt = dataVencimento.split("-").reverse().join("/");
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">Treinamento ${vencido ? "vencido" : "vencendo"}</h2>
      <p>O treinamento <b>${documento}</b> de <b>${colaborador}</b> ${statusTexto} (${dataFmt}).</p>
      <p style="display:inline-block; padding: 6px 12px; border-radius: 6px; background: ${cor}22; color: ${cor}; font-weight: bold;">${statusTexto}</p>
      <p style="color: #666; font-size: 13px; margin-top: 24px;">Inventário CBA — aba Documentos &gt; Treinamentos.</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const restHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  // Busca só os registros ainda não avisados por e-mail, com vencimento
  // preenchido — o filtro de "dentro de 30 dias (ou já vencido)" é feito
  // aqui em JS (mesma lógica do site), não dá pra fazer aritmética de data
  // direto na query REST sem uma view/função nova no banco.
  const listRes = await fetch(
    `${SUPABASE_URL}/rest/v1/colaborador_docs?select=*&alert_sent_at=is.null&data_vencimento=not.is.null`,
    { headers: restHeaders },
  );
  if (!listRes.ok) {
    return new Response(JSON.stringify({ error: "falha ao buscar colaborador_docs", detail: await listRes.text() }), { status: 500 });
  }
  const rows = await listRes.json();

  let sent = 0, semEmailProprio = 0, skippedNotDue = 0, errors = 0;
  // Guarda só o primeiro erro (texto de resposta do Resend, ou a exceção),
  // pra dar pra diagnosticar sem precisar abrir os logs do Supabase — não
  // expõe nenhum segredo, só a mensagem de erro que o Resend devolve.
  let firstErrorDetail: string | null = null;

  for (const row of rows) {
    const dias = diasParaVencer(row.data_vencimento);
    if (dias > 30) { skippedNotDue++; continue; }

    // e-mails cadastrados na própria linha (colaborador/responsável) + o
    // ALWAYS_CC, sem duplicar caso algum deles já seja o mesmo endereço.
    // ALWAYS_CC garante que "to" nunca fica vazio — antes, uma linha sem
    // nenhum e-mail cadastrado era pulada silenciosamente (skippedNoEmail);
    // agora ela ainda dispara, só que só pro Rodrigo, o que só ajuda a
    // pegar cadastro incompleto em vez de esconder o problema.
    const emailsDaLinha = [row.email_colaborador, row.email_responsavel].filter(Boolean);
    if (emailsDaLinha.length === 0) semEmailProprio++;
    const to = Array.from(new Set([...emailsDaLinha, ALWAYS_CC]));

    try {
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to,
          subject: `${dias < 0 ? "Vencido" : "Vencendo"}: ${row.documento} — ${row.colaborador}`,
          html: emailHtml(row.documento, row.colaborador, dias, row.data_vencimento),
        }),
      });
      if (!sendRes.ok) {
        errors++;
        if (!firstErrorDetail) firstErrorDetail = `Resend respondeu ${sendRes.status}: ${await sendRes.text()}`;
        continue;
      }

      await fetch(`${SUPABASE_URL}/rest/v1/colaborador_docs?id=eq.${row.id}`, {
        method: "PATCH",
        headers: restHeaders,
        body: JSON.stringify({ alert_sent_at: new Date().toISOString() }),
      });
      sent++;
    } catch (e) {
      errors++;
      if (!firstErrorDetail) firstErrorDetail = `Exceção: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return new Response(
    JSON.stringify({ checked: rows.length, sent, semEmailProprio, skippedNotDue, errors, firstErrorDetail }),
    { headers: { "Content-Type": "application/json" } },
  );
});
