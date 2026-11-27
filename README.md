# Olho

Um olho roxo brilhante que segue o mouse, em 3D (WebGL com [three.js](https://threejs.org/)).

## Como ver

Abra o `index.html` no navegador. Funciona até com dois cliques no arquivo, sem servidor.
Também funciona em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel…). No GitHub Pages:
**Settings → Pages → Deploy from a branch → `main` / raiz**.

## O que ele faz

- Segue o mouse (ou o dedo, no celular). Com o ponteiro longe, olha até o canto; perto, mexe menos.
- Se o ponteiro fica parado por 7 segundos, ele volta a olhar para a frente, fica assim uns 3
  segundos e depois começa a olhar para lugares aleatórios. Assim que o ponteiro mexe, volta a seguir.
- Pisca a cada 8 a 10 segundos.

## Como ele é feito

- Contorno de luz lilás em forma de amêndoa, com um halo violeta em volta.
- Fundo do olho roxo bem escuro, com uma névoa.
- Íris simples, em duas faixas de cor: magenta perto da pupila e violeta por fora.
- Pupila transparente: é um furo, por onde se vê o céu estrelado do fundo.
- Um brilho pequeno e suave na íris e um céu estrelado roxo no fundo.
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
| `src/olho.js` | O olho e a animação. No topo: `OLHO` (medidas), `COR_OLHO` (cores) e `ANIMACAO` (tempos: `voltarDepois`, `normalPor`, `piscarEntre`). |
| `src/posprocesso.js` | Brilho difuso e a cor final da imagem (`COR`: mais escura, roxos mais fortes). |
| `src/ceu.js` | O céu estrelado do fundo. |
| `src/materiais.js` | Materiais das partículas e dos brilhos. |
| `src/texturas.js` | Texturas desenhadas na hora (não há imagens). |
| `src/utils.js` | Funções pequenas de apoio. |
