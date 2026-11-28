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

Uma cena no estilo do Big Bang (cerca de 13 segundos), que começa sozinha 15 segundos depois de a
página abrir (ou quando o código chama `olho.transcender()`):

| Tempo | O que acontece |
| --- | --- |
| 0 – 2 s | Um dos olhos é escolhido (falha), vai para o meio da tela e cresce; os outros olham para ele e somem, e o céu escurece. |
| 2 – 4,6 s | Ele transcende: treme cada vez mais, olha para todo lado muito rápido, falha em azul e vermelho, e partículas de energia caem girando para dentro dele. |
| 4,6 – 5,1 s | Fecha o olho quase todo; silêncio. |
| 5,1 – 7,3 s | Uma luz começa a sair pela fresta da pálpebra: a fresta acende, um feixe horizontal cresce e raios de luz escapam por cima e por baixo. |
| 7,3 – 8 s | Abre com um clarão, transformado: a íris virou uma estrela de 8 pontas muito luminosa (como a estrela do Big Bang, com núcleo branco, raios em cruz e os três malabares), com algumas pontas passando das pálpebras; a pupila virou uma estrela de 4 pontas; e raios compridos saem do olho. |
| 8 – 10,4 s | A estrela brilha. A pupila (a estrela de 4 pontas) é oca: por ela se vê outro espaço, escuro, com estrelas fracas. |
| 10,4 – 13 s | A câmera mergulha na pupila: a luz da estrela passa pelos lados e o oco toma a tela inteira. |
| depois | Espaço vazio. A página mostra o `<main id="final">` e dispara o evento `olho:fim`. |

Para colocar conteúdo depois da cena, escreva dentro do `<main id="final" hidden>` do HTML (ele fica
por cima do espaço vazio, sem fundo) e, se precisar de JavaScript nessa hora:

```js
window.addEventListener('olho:fim', () => {
  // a cena acabou no espaço vazio
});
```

Ajustes em `TRANSCENDER`, no topo de `src/transcender.js`: `inicioAutomatico` (segundos até
começar sozinha; `null` = só com `olho.transcender()`), a duração de cada fase em `fases` e o
tamanho do olho escolhido. Para testar: `?transcender` no endereço começa a cena logo, e
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
