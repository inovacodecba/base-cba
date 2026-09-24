// Edge Function "session-login" — Base de Dados (ex-"Inventário CBA")
//
// Objetivo: fazer a tela de login continuar EXATAMENTE igual (nome + senha),
// mas por trás dos panos passar a gerar uma sessão de verdade do Supabase
// Auth — hoje o site usa uma chave pública fixa pra tudo, então o banco não
// tem como saber "quem" está fazendo cada operação. Isso é o passo que
// permite fechar as regras de acesso (RLS) de verdade, sem mudar a
// experiência de ninguém no time.
//
// Como funciona:
//   1. Confere a senha exatamente como já era feito (reaproveita as funções
//      verify_login / register_login que já existem e já são usadas há
//      tempo — não mexe nesse mecanismo).
//   2. Se a senha bateu, garante que existe um usuário "sombra" no Supabase
//      Auth pra essa pessoa (e-mail fictício que nunca é usado pra enviar
//      nada, só serve de identificador único) e faz login nele.
//   3. Devolve pro navegador um token de sessão real (access_token +
//      refresh_token), que o site passa a usar nas próximas chamadas em vez
//      da chave pública fixa.
//
// A senha do usuário "sombra" é derivada matematicamente do nome + da
// SERVICE_ROLE_KEY (que só existe aqui, nunca sai do servidor) — ninguém
// digita ou vê essa senha, e ela nunca precisa ser guardada em lugar
// nenhum, porque dá pra recalcular sempre que precisar.
//
// Variáveis de ambiente necessárias: nenhuma nova — SUPABASE_URL,
// SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm prontas
// automaticamente em toda Edge Function do Supabase.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function slugify(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function shadowEmail(name: string): string {
  return `${slugify(name)}@shadow.base-cba.internal`;
}

async function shadowPassword(name: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`base-cba-shadow-user:${name}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpc(name: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc ${name} falhou: ${await res.text()}`);
  return res.json();
}

async function teamRow(name: string): Promise<{ is_admin: boolean } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/team?name=eq.${encodeURIComponent(name)}&select=is_admin`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function isAdmin(name: string): Promise<boolean> {
  const row = await teamRow(name);
  return !!row?.is_admin;
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function createShadowUser(email: string, password: string, name: string, admin: boolean) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { display_name: name },
      app_metadata: { is_admin: admin },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    if (!detail.includes("already been registered")) throw new Error(`criar usuário sombra falhou: ${detail}`);
  }
}

async function syncAdminFlag(userId: string, name: string, admin: boolean) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ app_metadata: { is_admin: admin }, user_metadata: { display_name: name } }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body: { name?: string; password?: string; confirm?: string; mode?: "login" | "register" };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "corpo inválido" }, 400);
  }

  const { name, password, confirm, mode = "login" } = body;
  if (!name || !password) return json({ ok: false, error: "Nome e senha são obrigatórios" }, 400);

  try {
    // 1) Confere a senha exatamente como o site já fazia (nenhuma mudança
    //    nessa parte — só move a chamada pra dentro do servidor).
    if (mode === "register") {
      if (password.length < 10) return json({ ok: false, error: "A senha precisa ter pelo menos 10 caracteres" }, 400);
      if (password !== confirm) return json({ ok: false, error: "As senhas não coincidem" }, 400);
      // Antes, só nomes já cadastrados na equipe apareciam no <select> do
      // login — isso validava implicitamente. Como o campo agora é texto
      // livre (pra não expor a lista de nomes antes do login), confere aqui
      // que o nome digitado é mesmo um membro da equipe cadastrado, e não
      // um nome qualquer inventado na hora.
      const team = await teamRow(name);
      if (!team) return json({ ok: false, error: "Nome não encontrado. Verifique se digitou exatamente como está cadastrado, ou peça pra um administrador te adicionar em Configurações › Equipe." }, 400);
      const registered = await rpc("register_login", { p_name: name, p_password: password });
      if (!registered) return json({ ok: false, error: "Este usuário já possui senha cadastrada. Recarregue a página." }, 400);
    } else {
      const valid = await rpc("verify_login", { p_name: name, p_password: password });
      if (!valid) return json({ ok: false, error: "Senha incorreta" }, 401);
    }

    // 2) Garante a sessão real do Supabase Auth (usuário sombra).
    const email = shadowEmail(name);
    const pwd = await shadowPassword(name);
    const admin = await isAdmin(name);

    let attempt = await signIn(email, pwd);
    if (!attempt.ok) {
      await createShadowUser(email, pwd, name, admin);
      attempt = await signIn(email, pwd);
      if (!attempt.ok) throw new Error(`login sombra falhou: ${JSON.stringify(attempt.data)}`);
    } else {
      // Mantém o app_metadata.is_admin sempre em dia (caso tenha mudado).
      const uid = attempt.data?.user?.id;
      if (uid) await syncAdminFlag(uid, name, admin);
    }

    const s = attempt.data;
    return json({
      ok: true,
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at,
      user: { name, is_admin: admin },
    });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Erro ao autenticar. Tente novamente." }, 500);
  }
});
