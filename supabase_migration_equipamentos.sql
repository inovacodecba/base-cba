-- ============================================================================
-- Inventário CBA — tabela "equipamentos_rede" (Mapa > Equipamentos)
-- Rode no Supabase: Painel > SQL Editor > New query > Run.
-- Sem isso, o app mostra os 87 equipamentos importados do KML como uma lista
-- local fixa (fallback), só não salva se alguém adicionar/remover um novo.
-- ============================================================================

create table if not exists public.equipamentos_rede (
  id bigint generated always as identity primary key,
  name text not null,
  tipo text not null default 'outro', -- totem | amplimax | impressora | caixa_baixa | outro
  area text not null, -- camada/área da planta (Fundição 1, TP, Vias...)
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

-- Semeia os 87 pontos importados do mapa "Equipamentos e alcançe do amplimax"
-- (Google My Maps do usuário). Não faz nada se a tabela já tiver dados.
insert into public.equipamentos_rede (name, tipo, area, lat, lng)
select * from (values
  ('totem025/026 - Fundição 1 - Tarugo', 'totem', 'Fundição 1', -23.5356149, -47.2638944),
  ('totem029/030 - Fundição 1 - Estoque', 'totem', 'Fundição 1', -23.535035, -47.2645132),
  ('totem027/028 - Fundição 1 - Lingoteira', 'totem', 'Fundição 1', -23.5356444, -47.2647228),
  ('Amplimax - Fundição 1', 'amplimax', 'Fundição 1', -23.5354313, -47.2647216),
  ('totem091/092 - SF 70', 'totem', 'Almoxarifado', -23.5369551, -47.2608597),
  ('Amplimax - SF70', 'amplimax', 'Almoxarifado', -23.5369674, -47.2608176),
  ('totem049/050 - EXTRUSAO 1 - E40', 'totem', 'TP', -23.5367235, -47.2701737),
  ('totem051/052 - EXPEDICAO ESTREITA - E51 - PORTA 1', 'totem', 'TP', -23.5368438, -47.2703376),
  ('totem057/058 - EXPEDICAO ESTREITA - E51 - PORTA 2', 'totem', 'TP', -23.5367909, -47.2707463),
  ('totem089/090 - L2000 - PORTA 2', 'totem', 'TP', -23.5366207, -47.2718445),
  ('totem105/106 - L2000 - PORTA 1', 'totem', 'TP', -23.5369541, -47.2710578),
  ('totem093/094 - L2000 - PORTA 3', 'totem', 'TP', -23.5365658, -47.2729892),
  ('totem111/112 - L2000 - PORTA 4', 'totem', 'TP', -23.5369303, -47.2722136),
  ('TOTEM 55/56 entrada L1300', 'totem', 'TP', -23.5353134, -47.2697371),
  ('Supply Amplimax', 'amplimax', 'TP', -23.5368355, -47.270382),
  ('Amplimax - L2000', 'amplimax', 'TP', -23.5366534, -47.2717982),
  ('Amplimax - L2000', 'amplimax', 'TP', -23.5369671, -47.272139),
  ('Amplimax - L2000', 'amplimax', 'TP', -23.5365954, -47.2730038),
  ('Amplimax - Laminação 1300', 'amplimax', 'TP', -23.5354425, -47.2694575),
  ('IMPRESSORA03 - EXPEDIÇÃO/SUPPLY', 'impressora', 'TP', -23.5369481, -47.2702516),
  ('IMPRESSORA08 - CPLAN', 'impressora', 'TP', -23.5371404, -47.2715678),
  ('IMPRESSORA10 - EMBALAGEM DE FOLHAS2000 PONTO1', 'impressora', 'TP', -23.5369209, -47.272589),
  ('IMPRSSORA 02 - MOTORIZADA sem amplimax', 'impressora', 'TP', -23.5395509, -47.2739235),
  ('totem035/036 - Fundição 2 - Estoque Tarugo', 'totem', 'Fundição 2', -23.5264307, -47.2717656),
  ('totem033/034 - Fundição 2 - Tarugo Sucata', 'totem', 'Fundição 2', -23.5270846, -47.2713934),
  ('totem037/038 - Fundição 2 - Lado Rampa', 'totem', 'Fundição 2', -23.526034, -47.2708287),
  ('totem039/040 - Fundição 2 - Tarugo Lado Embalagem', 'totem', 'Fundição 2', -23.525518, -47.2710819),
  ('totem041/042 - Fundição 2 - Lingoteira Porta Direita', 'totem', 'Fundição 2', -23.5254572, -47.2707562),
  ('totem045/046 - Fundição 2 - Estoque Lingoteira', 'totem', 'Fundição 2', -23.5247589, -47.2711819),
  ('totem043/044 - Fundição 2 - Lingoteira Porta Direita', 'totem', 'Fundição 2', -23.5253287, -47.2711648),
  ('Totem 082/081 - Lado B - Balança Saída Fornos 6', 'totem', 'Fundição 2', -23.5275867, -47.2709738),
  ('Totem 095/096 - Lado A - Fundição A2 - Pátio Modelo Híbrido', 'totem', 'Fundição 2', -23.5245323, -47.2707083),
  ('Totem 097/98 - Lado A - Fundição A2 - Pátio Modelo Híbrido', 'totem', 'Fundição 2', -23.5240945, -47.2705555),
  ('Totem 099/100 - Lado A - Fundição A2 - Pátio Modelo Híbrido', 'totem', 'Fundição 2', -23.5244121, -47.2697869),
  ('Amplimax - Caster 7 - 12', 'amplimax', 'Fundição 2', -23.5257594, -47.2692564),
  ('totem047/048 - Caster 7ao12', 'totem', 'Fundição 2', -23.5258262, -47.2693306),
  ('amplimax tarugo 2', 'amplimax', 'Fundição 2', -23.5255107, -47.27111),
  ('amplimax lingoteira 2 porta direita', 'amplimax', 'Fundição 2', -23.5254393, -47.2708042),
  ('amplimax lingoteira 2', 'amplimax', 'Fundição 2', -23.5247655, -47.2711368),
  ('amplimax patio modelo hibrido', 'amplimax', 'Fundição 2', -23.5243466, -47.2697823),
  ('amplimax tarugo 2', 'amplimax', 'Fundição 2', -23.5262956, -47.2713375),
  ('amplimax wagsnaff', 'amplimax', 'Fundição 2', -23.5274624, -47.2709392),
  ('IMPRESSORA16 - TARUGO2', 'impressora', 'Fundição 2', -23.5257028, -47.2709284),
  ('IMPRESSORA17 - LINGOTEIRA2', 'impressora', 'Fundição 2', -23.5250492, -47.2711001),
  ('Amplimax - Quad. Primário 2 - Poste de Iluminação', 'amplimax', 'Fundição 2', -23.5298308, -47.2724108),
  ('totem059/060 - Quad. Primário SF - Lateral Properzi', 'totem', 'Vias', -23.5348559, -47.2639677),
  ('totem065/066 - Balança 80T - Entrada', 'totem', 'Vias', -23.5341039, -47.2629826),
  ('totem067/068 - Balança 80T - Saída', 'totem', 'Vias', -23.5339937, -47.2629864),
  ('totem072 - Saída de Veículos', 'totem', 'Vias', -23.5348056, -47.2623256),
  ('totem075/076 - Balança 100T', 'totem', 'Vias', -23.534707, -47.2636203),
  ('totem077/078 - Quad. Primário 2 - Rack ao Lado da Sub Estação', 'totem', 'Vias', -23.5328196, -47.2627493),
  ('totem079/080 - Quad. Primário 2 - Poste de Iluminação', 'totem', 'Vias', -23.5298368, -47.27214),
  ('totem083/084 - PA Vergalhão', 'totem', 'Vias', -23.5366887, -47.26292),
  ('totem087/88 - Via Downstream', 'totem', 'Vias', -23.5374145, -47.2635589),
  ('totem063/064 - Alumina Ponte', 'totem', 'Vias', -23.5360177, -47.2630643),
  ('Totem 103/104 - Lado A - Extrusão 2 - E41', 'totem', 'Vias', -23.5349381, -47.2715573),
  ('Ampimax - Balança 80T', 'amplimax', 'Vias', -23.534113, -47.2629529),
  ('Amplimax - PA Vergalhão', 'amplimax', 'Vias', -23.5366519, -47.2628355),
  ('Amplimax - Via downstream', 'amplimax', 'Vias', -23.5373137, -47.2635898),
  ('Amplimax - Extrusão 2', 'amplimax', 'Vias', -23.5350175, -47.2717929),
  ('Amplimax - Quad. Primário 2', 'amplimax', 'Vias', -23.5328265, -47.2626943),
  ('IMPRESSORA14 - EMBALAGEM1300 PONTO4', 'impressora', 'Vias', -23.5353544, -47.2695568),
  ('IMPRESSORA13 - EMBALAGEM1300 PONTO3', 'impressora', 'Vias', -23.5353679, -47.2694858),
  ('IMPRESSORA11 - EMBALAGEM1300 PONTO1', 'impressora', 'Vias', -23.5353956, -47.2693547),
  ('IMPRESSORA12 - EMBALAGEM1300 PONTO2', 'impressora', 'Vias', -23.5353882, -47.2694204),
  ('IMPRESSORA07 - UNGERER2', 'impressora', 'Vias', -23.5356779, -47.2694577),
  ('IMPRESSORA05 - EMBALAGEM1400', 'impressora', 'Vias', -23.5355238, -47.2698462),
  ('IMPRESSORA04 - EXTRUSAO2 SALA1', 'impressora', 'Vias', -23.5349844, -47.2717936),
  ('IMPRESSORA19 - SERRA LOMA', 'impressora', 'Vias', -23.5355209, -47.2644248),
  ('IMPRESSORA18 - LINGOTEIRA1', 'impressora', 'Vias', -23.5354176, -47.2647949),
  ('IMPRESSORA20 - EMBALAGEM VERGALHÃO', 'impressora', 'Vias', -23.5346062, -47.264414),
  ('IMPRESSORA01 - SF70 sem amplimax', 'impressora', 'Vias', -23.5363336, -47.2615688),
  ('Caixa de baixa 123 - sala forno 7', 'caixa_baixa', 'Vias', -23.5196362, -47.2671456),
  ('Caixa de baixa - Caster 7 ao 12', 'caixa_baixa', 'Vias', -23.5252889, -47.2693315),
  ('Caixa de baixa - lingoteira 2', 'caixa_baixa', 'Vias', -23.5252988, -47.2706243),
  ('Caixa de Baixa - tarugo', 'caixa_baixa', 'Vias', -23.5262899, -47.2713747),
  ('Caixa de baixa 122 - sala forno 6', 'caixa_baixa', 'Vias', -23.5267059, -47.2702859),
  ('Caixa de baixa 121 - sala forno 5', 'caixa_baixa', 'Vias', -23.5282502, -47.2689824),
  ('Caixa de baixa 120 - sala forno 2 e 4', 'caixa_baixa', 'Vias', -23.5318369, -47.2674167),
  ('Caixa de baixa - Fundição 1 estoque', 'caixa_baixa', 'Vias', -23.5350894, -47.264566),
  ('Amplimax - Sala forno 6 caixa de baixa', 'amplimax', 'Vias', -23.5267091, -47.2701966),
  ('Amplima Sala forno 5', 'amplimax', 'Vias', -23.5283387, -47.2689985),
  ('Amplimax - Sala forno 7', 'amplimax', 'Vias', -23.5196407, -47.2671976),
  ('Amplimax - sala forno 2 e 4', 'amplimax', 'Vias', -23.5317001, -47.2673825),
  ('Amplimax - 1400', 'amplimax', 'Vias', -23.5356316, -47.2694436),
  ('Totem 073 Entrada de veículos', 'totem', 'Vias', -23.5347946, -47.2627171),
  ('Amplimax Entrada de veículos', 'amplimax', 'Vias', -23.5347874, -47.2626569)
) as v(name, tipo, area, lat, lng)
where not exists (select 1 from public.equipamentos_rede);

alter table public.equipamentos_rede enable row level security;

create policy "equip_select_anon" on public.equipamentos_rede
  for select to anon, authenticated using (true);

create policy "equip_insert_anon" on public.equipamentos_rede
  for insert to anon, authenticated with check (true);

create policy "equip_delete_anon" on public.equipamentos_rede
  for delete to anon, authenticated using (true);

