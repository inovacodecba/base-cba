// Constantes de domínio do Inventário CBA.
// Mantidas em módulo separado para reuso entre App.jsx e os componentes de
// dashboard/layout, evitando prop-drilling e duplicação de dados.

// Lista padrão usada apenas como fallback antes da tabela `sectors` carregar
// (ou se ela estiver vazia) — os locais reais agora são gerenciáveis pela
// própria equipe em "Locais" (ver App.jsx: addSector/removeSector), sem
// precisar de deploy para cadastrar uma área nova da planta.
//
// As mesmas 5 áreas já usadas no campo "área" de cada equipamento do Mapa de
// Rede (ver EQUIPAMENTOS0 abaixo) — trocado de Escritório/Armário/Central de
// Reparos (genéricos demais) para refletir os lugares reais da planta. Rodar
// supabase_migration_sectors_areas_reais.sql pra aplicar essa troca também na
// tabela `sectors` já existente (esta constante aqui só vale como fallback).
export const SECTORS0 = ["Almoxarifado", "Fundição 1", "Fundição 2", "TP", "Vias"];

// Paleta cíclica para dar uma cor a cada local dinamicamente cadastrado —
// como os nomes não são mais fixos, não dá pra ter um mapa nome→cor fixo.
export const SECTOR_PALETTE = ["#f59e0b", "#ec4899", "#0ea5e9", "#22c55e", "#a855f7", "#f43f5e", "#14b8a6", "#eab308"];

// Fallback local dos equipamentos de rede (totens/Amplimax/impressoras/caixas
// de baixa) importados do Google My Maps do usuário ("Equipamentos e alcançe
// do amplimax") — usado só até a tabela `equipamentos_rede` existir/carregar
// no Supabase (ver App.jsx). Coordenadas reais (GPS), convertidas para posição
// no mapa esquemático via projeção local (ver components/map/NetworkMap.jsx).
export const EQUIPAMENTOS0 = [
  { name: "totem025/026 - Fundição 1 - Tarugo", tipo: "totem", area: "Fundição 1", lat: -23.5356149, lng: -47.2638944 },
  { name: "totem029/030 - Fundição 1 - Estoque", tipo: "totem", area: "Fundição 1", lat: -23.535035, lng: -47.2645132 },
  { name: "totem027/028 - Fundição 1 - Lingoteira", tipo: "totem", area: "Fundição 1", lat: -23.5356444, lng: -47.2647228 },
  { name: "Amplimax - Fundição 1", tipo: "amplimax", area: "Fundição 1", lat: -23.5354313, lng: -47.2647216 },
  { name: "totem091/092 - SF 70", tipo: "totem", area: "Almoxarifado", lat: -23.5369551, lng: -47.2608597 },
  { name: "Amplimax - SF70", tipo: "amplimax", area: "Almoxarifado", lat: -23.5369674, lng: -47.2608176 },
  { name: "totem049/050 - EXTRUSAO 1 - E40", tipo: "totem", area: "TP", lat: -23.5367235, lng: -47.2701737 },
  { name: "totem051/052 - EXPEDICAO ESTREITA - E51 - PORTA 1", tipo: "totem", area: "TP", lat: -23.5368438, lng: -47.2703376 },
  { name: "totem057/058 - EXPEDICAO ESTREITA - E51 - PORTA 2", tipo: "totem", area: "TP", lat: -23.5367909, lng: -47.2707463 },
  { name: "totem089/090 - L2000 - PORTA 2", tipo: "totem", area: "TP", lat: -23.5366207, lng: -47.2718445 },
  { name: "totem105/106 - L2000 - PORTA 1", tipo: "totem", area: "TP", lat: -23.5369541, lng: -47.2710578 },
  { name: "totem093/094 - L2000 - PORTA 3", tipo: "totem", area: "TP", lat: -23.5365658, lng: -47.2729892 },
  { name: "totem111/112 - L2000 - PORTA 4", tipo: "totem", area: "TP", lat: -23.5369303, lng: -47.2722136 },
  { name: "TOTEM 55/56 entrada L1300", tipo: "totem", area: "TP", lat: -23.5353134, lng: -47.2697371 },
  { name: "Supply Amplimax", tipo: "amplimax", area: "TP", lat: -23.5368355, lng: -47.270382 },
  { name: "Amplimax - L2000", tipo: "amplimax", area: "TP", lat: -23.5366534, lng: -47.2717982 },
  { name: "Amplimax - L2000", tipo: "amplimax", area: "TP", lat: -23.5369671, lng: -47.272139 },
  { name: "Amplimax - L2000", tipo: "amplimax", area: "TP", lat: -23.5365954, lng: -47.2730038 },
  { name: "Amplimax - Laminação 1300", tipo: "amplimax", area: "TP", lat: -23.5354425, lng: -47.2694575 },
  { name: "IMPRESSORA03 - EXPEDIÇÃO/SUPPLY", tipo: "impressora", area: "TP", lat: -23.5369481, lng: -47.2702516 },
  { name: "IMPRESSORA08 - CPLAN", tipo: "impressora", area: "TP", lat: -23.5371404, lng: -47.2715678 },
  { name: "IMPRESSORA10 - EMBALAGEM DE FOLHAS2000 PONTO1", tipo: "impressora", area: "TP", lat: -23.5369209, lng: -47.272589 },
  { name: "IMPRSSORA 02 - MOTORIZADA sem amplimax", tipo: "impressora", area: "TP", lat: -23.5395509, lng: -47.2739235 },
  { name: "totem035/036 - Fundição 2 - Estoque Tarugo", tipo: "totem", area: "Fundição 2", lat: -23.5264307, lng: -47.2717656 },
  { name: "totem033/034 - Fundição 2 - Tarugo Sucata", tipo: "totem", area: "Fundição 2", lat: -23.5270846, lng: -47.2713934 },
  { name: "totem037/038 - Fundição 2 - Lado Rampa", tipo: "totem", area: "Fundição 2", lat: -23.526034, lng: -47.2708287 },
  { name: "totem039/040 - Fundição 2 - Tarugo Lado Embalagem", tipo: "totem", area: "Fundição 2", lat: -23.525518, lng: -47.2710819 },
  { name: "totem041/042 - Fundição 2 - Lingoteira Porta Direita", tipo: "totem", area: "Fundição 2", lat: -23.5254572, lng: -47.2707562 },
  { name: "totem045/046 - Fundição 2 - Estoque Lingoteira", tipo: "totem", area: "Fundição 2", lat: -23.5247589, lng: -47.2711819 },
  { name: "totem043/044 - Fundição 2 - Lingoteira Porta Direita", tipo: "totem", area: "Fundição 2", lat: -23.5253287, lng: -47.2711648 },
  { name: "Totem 082/081 - Lado B - Balança Saída Fornos 6", tipo: "totem", area: "Fundição 2", lat: -23.5275867, lng: -47.2709738 },
  { name: "Totem 095/096 - Lado A - Fundição A2 - Pátio Modelo Híbrido", tipo: "totem", area: "Fundição 2", lat: -23.5245323, lng: -47.2707083 },
  { name: "Totem 097/98 - Lado A - Fundição A2 - Pátio Modelo Híbrido", tipo: "totem", area: "Fundição 2", lat: -23.5240945, lng: -47.2705555 },
  { name: "Totem 099/100 - Lado A - Fundição A2 - Pátio Modelo Híbrido", tipo: "totem", area: "Fundição 2", lat: -23.5244121, lng: -47.2697869 },
  { name: "Amplimax - Caster 7 - 12", tipo: "amplimax", area: "Fundição 2", lat: -23.5257594, lng: -47.2692564 },
  { name: "totem047/048 - Caster 7ao12", tipo: "totem", area: "Fundição 2", lat: -23.5258262, lng: -47.2693306 },
  { name: "amplimax tarugo 2", tipo: "amplimax", area: "Fundição 2", lat: -23.5255107, lng: -47.27111 },
  { name: "amplimax lingoteira 2 porta direita", tipo: "amplimax", area: "Fundição 2", lat: -23.5254393, lng: -47.2708042 },
  { name: "amplimax lingoteira 2", tipo: "amplimax", area: "Fundição 2", lat: -23.5247655, lng: -47.2711368 },
  { name: "amplimax patio modelo hibrido", tipo: "amplimax", area: "Fundição 2", lat: -23.5243466, lng: -47.2697823 },
  { name: "amplimax tarugo 2", tipo: "amplimax", area: "Fundição 2", lat: -23.5262956, lng: -47.2713375 },
  { name: "amplimax wagsnaff", tipo: "amplimax", area: "Fundição 2", lat: -23.5274624, lng: -47.2709392 },
  { name: "IMPRESSORA16 - TARUGO2", tipo: "impressora", area: "Fundição 2", lat: -23.5257028, lng: -47.2709284 },
  { name: "IMPRESSORA17 - LINGOTEIRA2", tipo: "impressora", area: "Fundição 2", lat: -23.5250492, lng: -47.2711001 },
  { name: "Amplimax - Quad. Primário 2 - Poste de Iluminação", tipo: "amplimax", area: "Fundição 2", lat: -23.5298308, lng: -47.2724108 },
  { name: "totem059/060 - Quad. Primário SF - Lateral Properzi", tipo: "totem", area: "Vias", lat: -23.5348559, lng: -47.2639677 },
  { name: "totem065/066 - Balança 80T - Entrada", tipo: "totem", area: "Vias", lat: -23.5341039, lng: -47.2629826 },
  { name: "totem067/068 - Balança 80T - Saída", tipo: "totem", area: "Vias", lat: -23.5339937, lng: -47.2629864 },
  { name: "totem072 - Saída de Veículos", tipo: "totem", area: "Vias", lat: -23.5348056, lng: -47.2623256 },
  { name: "totem075/076 - Balança 100T", tipo: "totem", area: "Vias", lat: -23.534707, lng: -47.2636203 },
  { name: "totem077/078 - Quad. Primário 2 - Rack ao Lado da Sub Estação", tipo: "totem", area: "Vias", lat: -23.5328196, lng: -47.2627493 },
  { name: "totem079/080 - Quad. Primário 2 - Poste de Iluminação", tipo: "totem", area: "Vias", lat: -23.5298368, lng: -47.27214 },
  { name: "totem083/084 - PA Vergalhão", tipo: "totem", area: "Vias", lat: -23.5366887, lng: -47.26292 },
  { name: "totem087/88 - Via Downstream", tipo: "totem", area: "Vias", lat: -23.5374145, lng: -47.2635589 },
  { name: "totem063/064 - Alumina Ponte", tipo: "totem", area: "Vias", lat: -23.5360177, lng: -47.2630643 },
  { name: "Totem 103/104 - Lado A - Extrusão 2 - E41", tipo: "totem", area: "Vias", lat: -23.5349381, lng: -47.2715573 },
  { name: "Ampimax - Balança 80T", tipo: "amplimax", area: "Vias", lat: -23.534113, lng: -47.2629529 },
  { name: "Amplimax - PA Vergalhão", tipo: "amplimax", area: "Vias", lat: -23.5366519, lng: -47.2628355 },
  { name: "Amplimax - Via downstream", tipo: "amplimax", area: "Vias", lat: -23.5373137, lng: -47.2635898 },
  { name: "Amplimax - Extrusão 2", tipo: "amplimax", area: "Vias", lat: -23.5350175, lng: -47.2717929 },
  { name: "Amplimax - Quad. Primário 2", tipo: "amplimax", area: "Vias", lat: -23.5328265, lng: -47.2626943 },
  { name: "IMPRESSORA14 - EMBALAGEM1300 PONTO4", tipo: "impressora", area: "Vias", lat: -23.5353544, lng: -47.2695568 },
  { name: "IMPRESSORA13 - EMBALAGEM1300 PONTO3", tipo: "impressora", area: "Vias", lat: -23.5353679, lng: -47.2694858 },
  { name: "IMPRESSORA11 - EMBALAGEM1300 PONTO1", tipo: "impressora", area: "Vias", lat: -23.5353956, lng: -47.2693547 },
  { name: "IMPRESSORA12 - EMBALAGEM1300 PONTO2", tipo: "impressora", area: "Vias", lat: -23.5353882, lng: -47.2694204 },
  { name: "IMPRESSORA07 - UNGERER2", tipo: "impressora", area: "Vias", lat: -23.5356779, lng: -47.2694577 },
  { name: "IMPRESSORA05 - EMBALAGEM1400", tipo: "impressora", area: "Vias", lat: -23.5355238, lng: -47.2698462 },
  { name: "IMPRESSORA04 - EXTRUSAO2 SALA1", tipo: "impressora", area: "Vias", lat: -23.5349844, lng: -47.2717936 },
  { name: "IMPRESSORA19 - SERRA LOMA", tipo: "impressora", area: "Vias", lat: -23.5355209, lng: -47.2644248 },
  { name: "IMPRESSORA18 - LINGOTEIRA1", tipo: "impressora", area: "Vias", lat: -23.5354176, lng: -47.2647949 },
  { name: "IMPRESSORA20 - EMBALAGEM VERGALHÃO", tipo: "impressora", area: "Vias", lat: -23.5346062, lng: -47.264414 },
  { name: "IMPRESSORA01 - SF70 sem amplimax", tipo: "impressora", area: "Vias", lat: -23.5363336, lng: -47.2615688 },
  { name: "Caixa de baixa 123 - sala forno 7", tipo: "caixa_baixa", area: "Vias", lat: -23.5196362, lng: -47.2671456 },
  { name: "Caixa de baixa - Caster 7 ao 12", tipo: "caixa_baixa", area: "Vias", lat: -23.5252889, lng: -47.2693315 },
  { name: "Caixa de baixa - lingoteira 2", tipo: "caixa_baixa", area: "Vias", lat: -23.5252988, lng: -47.2706243 },
  { name: "Caixa de Baixa - tarugo", tipo: "caixa_baixa", area: "Vias", lat: -23.5262899, lng: -47.2713747 },
  { name: "Caixa de baixa 122 - sala forno 6", tipo: "caixa_baixa", area: "Vias", lat: -23.5267059, lng: -47.2702859 },
  { name: "Caixa de baixa 121 - sala forno 5", tipo: "caixa_baixa", area: "Vias", lat: -23.5282502, lng: -47.2689824 },
  { name: "Caixa de baixa 120 - sala forno 2 e 4", tipo: "caixa_baixa", area: "Vias", lat: -23.5318369, lng: -47.2674167 },
  { name: "Caixa de baixa - Fundição 1 estoque", tipo: "caixa_baixa", area: "Vias", lat: -23.5350894, lng: -47.264566 },
  { name: "Amplimax - Sala forno 6 caixa de baixa", tipo: "amplimax", area: "Vias", lat: -23.5267091, lng: -47.2701966 },
  { name: "Amplima Sala forno 5", tipo: "amplimax", area: "Vias", lat: -23.5283387, lng: -47.2689985 },
  { name: "Amplimax - Sala forno 7", tipo: "amplimax", area: "Vias", lat: -23.5196407, lng: -47.2671976 },
  { name: "Amplimax - sala forno 2 e 4", tipo: "amplimax", area: "Vias", lat: -23.5317001, lng: -47.2673825 },
  { name: "Amplimax - 1400", tipo: "amplimax", area: "Vias", lat: -23.5356316, lng: -47.2694436 },
  { name: "Totem 073 Entrada de veículos", tipo: "totem", area: "Vias", lat: -23.5347946, lng: -47.2627171 },
  { name: "Amplimax Entrada de veículos", tipo: "amplimax", area: "Vias", lat: -23.5347874, lng: -47.2626569 },
];

// Cor e rótulo de cada tipo de equipamento de rede no "Mapa".
export const EQUIP_TIPO = {
  totem: { label: "Totem", color: "#eab308" },
  amplimax: { label: "Amplimax", color: "#3b82f6" },
  impressora: { label: "Impressora", color: "#ef4444" },
  caixa_baixa: { label: "Caixa de baixa", color: "#8b5cf6" },
  outro: { label: "Outro", color: "#6b7280" },
};

// Lista inicial (seed) usada só como fallback enquanto a tabela `categories`
// não existir/estiver vazia no Supabase — depois disso, a lista real de
// categorias é dinâmica (gerenciável em "Categorias", mesmo padrão de "Locais").
export const CATEGORIES0 = ["Rede", "Ferramentas", "Eletrônicos", "Impressão", "EPI", "Diversos"];

// Cores fixas para as categorias originais (preserva a identidade visual já
// conhecida pela equipe). Categorias novas, criadas depois pela equipe, não
// têm entrada aqui — recebem cor cíclica de CAT_PALETTE (ver `catColor` em
// App.jsx), mesmo esquema que SECTOR_PALETTE já usa para locais externos.
export const CAT_COLOR = {
  "Rede": "#3b82f6",
  "Ferramentas": "#f97316",
  "Eletrônicos": "#8b5cf6",
  "Impressão": "#06b6d4",
  "EPI": "#22c55e",
  "Diversos": "#6b7280",
};

export const CAT_PALETTE = ["#3b82f6", "#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#ec4899", "#14b8a6", "#f43f5e", "#84cc16", "#eab308"];

export const TIPOS_E = ["compra", "devolução", "reparo", "retorno"];
export const TIPOS_S = ["em uso", "manutenção", "instalação", "consumo", "descarte", "defeito"];

export const ADMIN = "Francisco Rufino";
export const TEAM0 = ["Rodrigo Júnior", "Francisco Rufino", "Lucas Davi", "Alisson Mendonça", "Lucas Dias", "Thiago Santana"];

export const DAY = 86400000;

// Condição física do item (coluna `condicao` no banco — antigo `status`,
// renomeado porque o campo antigo misturava condição do equipamento
// ("operacional"/"defeito") com disponibilidade ("estoque"/"em uso"), que
// são conceitos independentes (ver DISP abaixo). Só estes 4 valores são
// aceitos pela CHECK constraint `items_condicao_check`.
// `dot` é { light, dark } (auditoria de contraste, 04/2026): os tons vivos
// originais (#22c55e verde, #f97316 laranja, #eab308 amarelo) ficam abaixo de
// 3:1 (WCAG 1.4.11) sobre o fundo/panel branco do tema claro — passam sem
// ajuste no tema escuro. Em vez de trocar a cor toda, cada status guarda um
// tom mais escuro/saturado só para o tema claro; StatusDot (common.jsx)
// escolhe o par certo via T.isLight. Vermelho e azul já passavam nos dois
// temas e mantêm o mesmo tom.
export const SC = {
  operacional: { label: "Operacional", dot: { light: "#1b9e4b", dark: "#22c55e" } },
  verificar: { label: "Verificar", dot: { light: "#c75c12", dark: "#f97316" } },
  "defeito parcial": { label: "Def. Parcial", dot: { light: "#ef4444", dark: "#ef4444" } },
  defeito: { label: "Defeito", dot: { light: "#ef4444", dark: "#ef4444" } },
};

// Disponibilidade — NUNCA é uma coluna própria, sempre calculada a partir de
// `qty_in_use` vs a quantidade total do item (ver `disponibilidade()` em
// utils.js). Usada só para exibição (badge azul, filtro "Em uso").
export const DISP = {
  estoque: { label: "Em Estoque", dot: { light: "#a47d06", dark: "#eab308" } },
  parcial: { label: "Uso Parcial", dot: { light: "#3b82f6", dark: "#3b82f6" } },
  "em uso": { label: "Em Uso", dot: { light: "#3b82f6", dark: "#3b82f6" } },
};

// Status das tarefas (quadro "Tarefas", Kanban simplificado) — mesmas 3
// colunas em todo o app: nunca inventar um 4º status sem atualizar a CHECK
// constraint da tabela `tarefas` no Supabase. Cores reaproveitam os mesmos
// tons já validados por contraste (04/2026) em SC/DISP acima, em vez de
// inventar uma paleta nova só para isto.
export const TASK_STATUS = {
  a_fazer: { label: "A Fazer", dot: { light: "#a47d06", dark: "#eab308" } },
  em_andamento: { label: "Em Andamento", dot: { light: "#3b82f6", dark: "#3b82f6" } },
  concluido: { label: "Concluído", dot: { light: "#1b9e4b", dark: "#22c55e" } },
};

// Título exibido na barra superior (desktop) para cada view. "movimentacoes"
// não tem mais entrada própria aqui — a tela vive dentro de "inventario"
// agora (ver NAV_ITEMS), então o título mostrado continua "Inventário"
// mesmo na aba Movimentações, mesmo padrão já usado em "Documentos"
// (título fica "Documentos" tanto na sub-aba Pastas quanto Treinamentos).
export const VIEW_TITLES = {
  dashboard: "Visão Geral",
  inventario: "Base de Dados",
  mapa: "Mapa",
  tarefas: "Tarefas",
  ponto: "Ponto",
  documentos: "Documentos",
  configuracoes: "Configurações",
};

// Navegação principal do app — usada pela sidebar (desktop) e pela barra
// inferior (mobile). `soon: true` marca seções ainda não implementadas,
// exibidas como "em breve" em vez de link ativo. `jump: "<view>"` marca um
// atalho que não é uma seção própria — só leva pra outra view já existente.
// `tab: "<nome>"` marca um item que corresponde a uma ABA interna de uma
// mega-view (hoje só "inventario", que engloba as abas "Inventário" e
// "Movimentações") — usado pelo `navigate()` pra também trocar a aba ativa,
// e pela barra inferior do mobile pra saber destacar o ícone certo mesmo
// quando duas entradas apontam pra mesma `view`. `desktopHidden: true`
// marca um item que só aparece na barra inferior do mobile (atalho rápido),
// nunca na sidebar do desktop nem no sheet "Mais opções" — usado só por
// "movimentacoes" (ver abaixo). `section` agrupa visualmente os itens na
// sidebar (só estética, não muda nenhum comportamento de clique).
//
// "Alertas" foi removido — usuário reportou não conseguir clicar (revisão
// de código não achou bug na lógica, mas o item era 100% redundante mesmo
// funcionando: o sino de notificação no topo (sempre visível, em qualquer
// tela) já leva pro mesmo lugar (`onAlertClick` em App.jsx, independente
// de NAV_ITEMS) e mostra a mesma contagem. Remover o item de menu não tira
// nenhuma funcionalidade — o sino e o painel "Itens com atenção" do
// Dashboard continuam intactos.
//
// "Lote" e "Relatórios" não têm item próprio — viraram botão dentro de
// Movimentações/Inventário (ver comentário histórico no App.jsx, seção da
// mega-view). "Movimentações" também deixou de ser um item de sidebar
// separado — virou uma ABA dentro de "Inventário" (`tab: "movimentacoes"`),
// a pedido do usuário, pra reduzir ainda mais o menu. Continua com atalho
// de 1 toque na barra inferior do mobile (`desktopHidden: true` +
// `jump: "inventario"` + `tab: "movimentacoes"`) pra não perder a agilidade
// que a tela de maior frequência de uso do dia a dia precisa.
//
// "Cadastros" (modal com Locais+Categorias) também deixou de ter item
// próprio — mesmo padrão de "Lote"/"Relatórios": vira um botão dentro da
// tela "Mapa" (App.jsx), não uma entrada de menu. Faz sentido só em parte
// (Locais tem relação real com o Mapa — os pontos ficam organizados por
// área; Categorias não tem nenhuma relação com os tipos de equipamento do
// Mapa, mas é o mesmo modal, então "pega carona") — dito isso ao usuário
// antes de implementar.
// "Tarefas" (quadro Kanban simplificado, tipo Trello interno) entrou como
// item NÃO primário — mesma categoria de "Mapa"/"Documentos": sempre visível
// na sidebar do desktop, e a 1 toque a mais no mobile (dentro de "Mais"),
// em vez de disputar uma 4ª vaga na barra inferior (hoje só Visão Geral/
// Base de Dados/Movimentações, o trio de maior uso diário). O contador de
// "minhas tarefas em aberto" (badgeCount, ver Navigation.jsx) já deixa a
// pendência visível sem precisar virar item primário — dá pra promover
// depois se o uso mostrar que precisa de atalho mais rápido no celular.
export const NAV_ITEMS = [
  { key: "dashboard", label: "Visão Geral", icon: "LayoutDashboard", primary: true, section: "Operação" },
  { key: "inventario", label: "Base de Dados", icon: "Boxes", primary: true, section: "Operação", tab: "inventario" },
  { key: "movimentacoes", label: "Movimentações", icon: "ArrowLeftRight", primary: true, jump: "inventario", tab: "movimentacoes", desktopHidden: true },
  { key: "mapa", label: "Mapa", icon: "Map", section: "Operação" },
  { key: "tarefas", label: "Tarefas", icon: "ClipboardCheck", section: "Operação" },
  { key: "ponto", label: "Ponto", icon: "QrCode", primary: true, section: "Operação" },
  { key: "documentos", label: "Documentos", icon: "FolderOpen", section: "Configurações" },
  { key: "configuracoes", label: "Configurações", icon: "Settings", section: "Configurações" },
];
