# Base de Dados — CBA (base-cba)

Plataforma interna da equipe na planta da CBA: inventário (Base de Dados), Mapa de
equipamentos de rede, Tarefas, Documentos/Treinamentos, Ponto por QR Code e Banco de horas.

## Quem usa e como falar com o dono

- Dono/operador: Rodrigo (login "Rodrigo Júnior"). Admin no app: Francisco Rufino.
- Rodrigo **não é programador**: responda em **português**, direto e conciso, com
  **passo a passo**. Comandos de terminal: **um por bloco**, nunca vários na mesma linha
  (ele cola tudo junto e quebra). Ele usa Windows (CMD).
- Antes de mudanças grandes de regra de negócio, **confirme a ideia com ele** antes de codar.

## Stack

- React 19 + Vite 6 (Rollup). Sem TypeScript. Estilos inline com tokens de `src/theme.js`
  (`getTheme`, `makeStyleHelpers`). Ícones: `lucide-react`.
- Backend: **Supabase** (projeto `aayayeytzaflbipqppwt`), acessado por REST com `fetch`
  (função `sb()` em `src/App.jsx`). Sem SDK do Supabase no front.
- Hospedagem: GitHub Pages em `https://inovacodecba.github.io/base-cba/` (base `/base-cba/`).
- PWA: `public/sw.js` + `public/manifest.webmanifest`.

## Comandos

- `npm install` · `npm run dev` · `npm run build` · `npm run lint` (oxlint)
- **Publicar = dar push na `main`.** O workflow `.github/workflows/deploy.yml` compila e
  publica na branch `gh-pages` sozinho. Não precisa mais de `npm run deploy` (ainda existe,
  com `--nojekyll`, como alternativa manual).
- A `gh-pages` é só o site compilado — **nunca editar nem commitar nela à mão**.

## Login e segurança

- Login nome + senha → Edge Function `supabase/functions/session-login` cria/usa um usuário
  "sombra" no Supabase Auth e devolve um token de sessão real. `is_admin` vai em
  `app_metadata` do token (vem de `team.is_admin`).
- O nome digitado no login pode diferir do cadastrado ("rodrigo junior" × "Rodrigo Júnior").
  O nome confiável é `auth.jwt() -> user_metadata ->> display_name` no banco — não use
  `currentUser` do front para filtrar dados da pessoa.
- Regras de acesso ficam no banco (RLS). Mudanças de banco são aplicadas direto no Supabase
  e **registradas** num arquivo `supabase_migration_<assunto>.sql` na raiz (só registro).

## Módulo Ponto (controle INTERNO — não é ponto oficial da Portaria 671)

- Tabelas `ponto_locais` (QR = `?ponto=<codigo>`, `pergunta_destino`, lat/lng/raio) e
  `ponto_registros` (tipo `entrada` | `saida` | `deslocamento`, `destino`, `motivo`, `remoto`).
- Ninguém edita/apaga registro pelo app (sem policy de update/delete). Só o dev apaga
  direto no banco quando o Rodrigo pede (ex.: testes).
- RPCs: `registrar_ponto` (horário do servidor, tipo automático, anti-leitura-repetida de
  1 min, GPS × raio → `fora_do_raio`), `encerrar_dia_remoto`, `meu_status_ponto`.
- Fluxo: 1ª leitura do dia = entrada. No QR do **Armário Almoxarifado** com o dia aberto o app
  pergunta "vai embora ou outro local?". Outro local = `deslocamento` (destinos fixos em
  `DESTINOS` no `Ponto.jsx` + Outros, motivo obrigatório) e o dia **continua aberto**; a
  pessoa encerra de onde estiver ("Encerrar o dia" = saída remota com GPS).
- Leitor de QR dentro do app: `QrScanner.jsx` (BarcodeDetector, cai pro `jsqr` no iPhone).

## Banco de horas (`src/components/ponto/bancoHoras.js`)

- Jornada 07:00–16:00, seg–sex, almoço não bate ponto.
- Tolerância 10 min por marcação; fora dela conta a diferença **inteira**
  (06:49 = +11; 07:11 = −11; o mesmo na saída das 16:00).
- Primeira entrada e última saída do dia. Dia sem registro não conta. Fim de semana = tudo extra.

## Mapa (`src/components/map/`)

- Leaflet + satélite Esri, carregado sob demanda (`lazy`). 93 equipamentos em `equipamentos_rede`
  (base: KMZ do Google My Maps). `dados` = MAC/IP por lado do totem + chip; `categorias` =
  `veicular`/`materiais`. Mapa v2: `NetworkMap.jsx` (tela), `EquipPanel.jsx` (painel/ficha/form),
  `mapUtils.js` (ícones, agrupamento, alcance). Camadas liga/desliga salvas no aparelho.
- `tarefas.equipamento_id` liga tarefa ↔ equipamento (ficha mostra/cria tarefas; tarefa tem "Ver no mapa").
- Ocorrências (`equipamento_ocorrencias`, RPC `ocorrencia_set_status`): "Sem Amplimax",
  "Totem caído"… abertas/resolvidas; painel embaixo do mapa começa fechado.

## Armadilhas já resolvidas (não reintroduzir)

- **GitHub Pages esconde arquivos que começam com `_`** → `vite.config.js` remove `_` do
  nome dos chunks e o deploy publica `.nojekyll`. Sem isso o Mapa dá tela branca.
- **Service worker** (`public/sw.js`) só guarda respostas `res.ok`. Se mudar a estratégia de
  cache, troque o nome `CACHE` (ex.: `base-cba-v3`) para limpar o cache antigo.
- Chunk do Mapa falhando → recarrega a página uma vez (`App.jsx`); `ErrorBoundary` evita tela branca.
- Hooks: declare `useCallback`/funções **antes** de usá-las em dependências de `useEffect`
  (já deu tela branca por TDZ — ver comentário no `vite.config.js`).

## Antes de entregar

- `npm run build` sem erro e testar a tela no tamanho de celular (390px) — a maioria usa pelo celular.
- Dados de teste no banco de produção: apagar ao final.
