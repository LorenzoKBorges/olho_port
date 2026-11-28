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
- De vez em quando cada olho "falha" (glitch) por uma fração de segundo: as linhas se dividem numa
  cópia azul e outra vermelho-escura, algumas faixas escorregam para o lado e tudo pisca.
- Clicou (ou tocou) num olho: ele pisca vermelho, fica quase fechado por uns 5 segundos e depois
  abre. Em cima de um olho o cursor vira a mãozinha.

## Como ele é feito

É um desenho feito de linhas de luz, sem cores por dentro:

- As pálpebras são duas linhas lilás que se cruzam um pouco além das pontas, com um halo violeta em volta.
- A íris é só o contorno de um círculo; a pupila, o contorno de uma fenda em pé (de gato), que abre e fecha devagar.
- Por dentro o olho é transparente: vê-se o céu estrelado roxo através dele (só um véu escuro bem leve, ajustável em `VEU`).
- Brilho difuso (bloom) e uma cor final mais escura, com roxos mais fortes.

## A transcendência

Uma cena no estilo do Big Bang (cerca de 20 segundos), em que a câmera voa como no Big Bang, que começa sozinha 15 segundos depois de a
página abrir (ou quando o código chama `olho.transcender()`):

| Tempo | O que acontece |
| --- | --- |
| 0 – 2,6 s | Os outros olhos olham para um deles; ele falha, desliza para o meio e cresce, enquanto os outros recuam para o fundo e somem. A câmera se aproxima devagar e o céu escurece. |
| 2,6 – 6,2 s | Ele transcende: treme cada vez mais, olha para todo lado cada vez mais rápido, falha em azul e vermelho, e energia cai girando para dentro dele. |
| 6,2 – 7,5 s | Fecha devagar: o tremor morre aos poucos e a energia é sugada para dentro dele. Silêncio. |
| 8 – 10,4 s | Uma luz cresce pela fresta da pálpebra (feixe e raios escapando) e a câmera chega mais perto. |
| 10,4 – 11,5 s | Abre com clarão, onda de choque e faíscas, e a câmera recua com o susto. Transformado: a íris é uma estrela de 8 pontas muito luminosa (com a estrela do Big Bang no meio), algumas pontas passando das pálpebras; a pupila é uma estrela de 4 pontas; e raios compridos saem do olho. |
| 11,5 – 14,6 s | A câmera gira um pouco em volta. A pupila é oca: por ela se vê o espaço vazio, com profundidade de verdade. |
| 14,6 – 17 s | A câmera se aproxima da pupila, freando, e a estrela de 4 pontas cresce até tomar a tela. |
| 17 – 19,6 s | Do outro lado, a câmera voa pelo espaço vazio, passando pelas estrelas, e freia. |
| depois | Espaço vazio, com a câmera ainda deslizando bem devagar. A página mostra o `<main id="final">` e dispara o evento `olho:fim`. |

Para colocar conteúdo depois da cena, escreva dentro do `<main id="final" hidden>` do HTML (ele fica
por cima do espaço vazio, sem fundo) e, se precisar de JavaScript nessa hora:

```js
window.addEventListener('olho:fim', () => {
  // a cena acabou no espaço vazio
});
```

Ajustes em `TRANSCENDER`, no topo de `src/transcender.js`: `inicioAutomatico` (segundos até
começar sozinha; `null` = só com `olho.transcender()`), o tamanho do olho escolhido e os raios
compridos; os tempos de cada parte ficam em `T`, no mesmo arquivo. Para testar: `?transcender` no endereço começa a cena logo, e
`?cena=8` começa e congela no segundo 8 da cena.

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
| `src/olho.js` | O olho e a animação. No topo: `OLHO` (medidas, espessura das linhas, tamanho da fenda), `COR_OLHO` (cores das linhas), `VEU` (o quanto escurece por dentro), `ANIMACAO` (tempos: `voltarDepois`, `normalPor`, `piscarEntre`), `EFEITOS` (cores e tempos da falha e do clique) e `ESPALHADOS` (posição, tamanho e inclinação de cada olho). |
| `src/transcender.js` | A cena da transcendência (fases, energia, luz pela fresta, estrela, pupila oca e o espaço vazio). |
| `src/estrela.js` | A estrela do Big Bang (usada na cena). |
| `src/posprocesso.js` | Brilho difuso e a cor final da imagem (`COR`: mais escura, roxos mais fortes). |
| `src/ceu.js` | O céu estrelado do fundo. |
| `src/materiais.js` | Materiais das partículas e dos brilhos. |
| `src/texturas.js` | Texturas desenhadas na hora (não há imagens). |
| `src/utils.js` | Funções pequenas de apoio. |
