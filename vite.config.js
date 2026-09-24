import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/base-cba/',
  // Vite fixado na série 6.x, com o bundler clássico (Rollup) — não a série
  // 8.x, que troca para o bundler novo "rolldown" (ainda experimental).
  // Histórico (31/08/2026): depois de adicionar a aba "Tarefas", a tela
  // ficou toda em branco em produção com "Cannot access 'X' before
  // initialization". Duas hipóteses foram investigadas e DESCARTADAS antes
  // da causa real ser encontrada: (1) trocar só o minificador (esbuild em
  // vez do nativo do rolldown, mantendo Vite 8) não resolveu; (2) até
  // baixar pro Rollup clássico (esta correção) reproduziu O MESMO erro —
  // ou seja, NÃO era bug do bundler/minificador em nenhum dos dois. A causa
  // real: em src/App.jsx havia um `useEffect` cujo array de dependências
  // referenciava `showToast` numa linha ANTES de `const showToast =
  // useCallback(...)` ser declarado mais abaixo no mesmo componente — um
  // erro de temporal dead zone (TDZ) de JavaScript puro, presente em
  // qualquer bundler/minificador, dev ou produção (só não pegamos antes
  // porque o teste automatizado usado pra verificar builds tinha um DOM
  // stub simples demais e não chegava a executar esse trecho). Corrigido
  // movendo a declaração de `showToast` para antes desse efeito. A troca
  // pro Vite 6/Rollup foi mantida mesmo assim por ser mais madura e estável
  // — mas não foi ela quem resolveu o bug do "tela branca".
  build: { minify: 'esbuild' },
})
