# Olho

Cinco olhos roxos brilhantes, espalhados pela tela, que seguem o mouse (WebGL com [three.js](https://threejs.org/)).

## Como ver

Abra o `index.html` no navegador. Funciona até com dois cliques no arquivo, sem servidor.
Também funciona em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel…). No GitHub Pages:
**Settings → Pages → Deploy from a branch → `main` / raiz**.

## O que ele faz

- Cada olho segue o mouse (ou o dedo, no celular) a partir de onde está: todos olham para o ponteiro.
  Com o ponteiro longe, olham até o canto; perto, mexem menos.
- Se o ponteiro fica parado por 7 segundos, todos voltam a olhar para a frente, ficam assim uns 3
  segundos e depois cada um começa a olhar para lugares aleatórios. Assim que o ponteiro mexe,
  voltam a seguir.
- Cada um pisca a cada 8 a 10 segundos, no seu ritmo.
- Em tela deitada eles se espalham pela tela; em tela em pé (celular), ficam numa coluna.

## Como ele é feito

É um desenho feito de linhas de luz, sem cores por dentro:

- As pálpebras são duas linhas lilás que se cruzam um pouco além das pontas, com um halo violeta em volta.
- A íris é só o contorno de um círculo; a pupila, o contorno de uma fenda em pé (de gato), que abre e fecha devagar.
- Por dentro o olho é transparente: vê-se o céu estrelado roxo através dele (só um véu escuro bem leve, ajustável em `VEU`).
- Brilho difuso (bloom) e uma cor final mais escura, com roxos mais fortes.

## Mexendo no olho

O código fica em `src/`. O arquivo que a página carrega (`js/olho.js`) é gerado a partir dele:

```bash
npm install
```

```bash
npm run build
```

Para ir regerando sozinho enquanto edita:

```bash
npm run dev
```

| Arquivo | O quê |
| --- | --- |
| `src/olho.js` | O olho e a animação. No topo: `OLHO` (medidas, espessura das linhas, tamanho da fenda), `COR_OLHO` (cores das linhas), `VEU` (o quanto escurece por dentro), `ANIMACAO` (tempos: `voltarDepois`, `normalPor`, `piscarEntre`) e `ESPALHADOS` (posição, tamanho e inclinação de cada olho). |
| `src/posprocesso.js` | Brilho difuso e a cor final da imagem (`COR`: mais escura, roxos mais fortes). |
| `src/ceu.js` | O céu estrelado do fundo. |
| `src/materiais.js` | Materiais das partículas e dos brilhos. |
| `src/texturas.js` | Texturas desenhadas na hora (não há imagens). |
| `src/utils.js` | Funções pequenas de apoio. |
