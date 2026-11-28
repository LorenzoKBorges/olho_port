/*
 * Olhos roxos desenhados com luz, no mesmo estilo de arte do Big Bang (luz e brilho difuso).
 *
 * São 5 olhos espalhados pela tela (tamanhos e inclinações diferentes). Animação:
 *  - cada olho segue o mouse (ou o dedo) a partir de onde está;
 *  - se o ponteiro fica parado por 7 segundos, ele volta a olhar para a frente, fica assim uns
 *    3 segundos e depois começa a olhar para lugares aleatórios; mexeu, volta a seguir;
 *  - cada um pisca a cada 8 a 10 segundos, no seu ritmo (cada piscada um pouco diferente).
 * Efeitos:
 *  - de vez em quando cada olho "falha" por uma fração de segundo: as linhas se dividem numa
 *    cópia azul e outra vermelho-escura, algumas faixas escorregam para o lado e tudo pisca;
 *  - clicou (ou tocou) num olho: ele pisca vermelho, fica quase fechado por ~5 s e depois abre.
 * Depois de um tempo começa a cena da transcendência (src/transcender.js): um olho é escolhido,
 * a íris vira a estrela do Big Bang e a câmera entra na pupila, até o espaço vazio.
 *
 * O olho é um desenho feito de luz (sem cores por dentro):
 *  - as pálpebras são duas linhas de luz lilás que se cruzam um pouco além das pontas, com um halo
 *    violeta em volta;
 *  - por dentro o olho é transparente (só um véu escuro bem leve sobre o céu estrelado);
 *  - a íris é só o contorno de um círculo e a pupila, o contorno de uma fenda em pé (de gato).
 */
import * as THREE from 'three';
import { criarTexturas } from './texturas.js';
import { globais } from './materiais.js';
import { Ceu } from './ceu.js';
import { criarPosProcesso, prepararRenderizador } from './posprocesso.js';
import { Transcendencia, TRANSCENDER } from './transcender.js';

// ---------------------------------------------------------------- medidas do olho
const OLHO = {
  meiaLargura: 11, // metade da largura da amêndoa
  meiaAltura: 5.2, // metade da altura (olho aberto)
  sobra: 1.1, // as linhas das pálpebras passam um pouco das pontas e se cruzam (como num desenho)
  raioIris: 4.5,
  fenda: { meiaAltura: 3.5, meiaLargura: 0.85 }, // a pupila é uma fenda em pé (olho de gato)
  linha: 0.075, // espessura das linhas de luz
  // olho transformado (na cena da transcendência)
  pupilaEstrela: { raio: 2.2 }, // a pupila vira uma estrela de 4 pontas
  irisEstrela: { raio: 7.0, pontas: 8 }, // a íris vira uma estrela de 8 pontas (passa das pálpebras)
};
const COR_OLHO = {
  contorno: '#e2ccff', // as pálpebras
  iris: '#c9adff', // o círculo da íris
  pupila: '#f1e6ff', // a fenda da pupila
  halo: '#7c3aed', // o brilho em volta do olho
  veu: '#06010f', // o olho por dentro é transparente, só um pouco mais escuro que o céu
};
const VEU = 0.35;
const EFEITOS = {
  glitchEntre: [3, 9], // segundos entre uma falha e outra (cada olho no seu tempo)
  glitchDura: [0.12, 0.35], // quanto dura cada falha
  azul: '#2f5bff', // as duas cores da falha
  vermelho: '#b3122e',
  clique: { fechado: 5, abertura: 0.16 }, // clicou: pisca vermelho e fica quase fechado 5 s
  vermelhoClique: '#ff2a44',
}; // 0 = o céu aparece inteiro dentro do olho, 1 = o olho por dentro fica todo escuro

const ANIMACAO = {
  voltarDepois: 7, // segundos com o ponteiro parado até o olho voltar a olhar para a frente
  normalPor: 3, // segundos olhando para a frente antes de começar a olhar para os lados
  piscarEntre: [8, 10], // segundos entre uma piscada e outra
  alcance: { x: 4.6, y: 1.7 }, // até onde a íris vai a partir do meio do olho
};

// Onde ficam os 5 olhos: x e y de -1 a 1 (bordas da tela), tamanho (1 = o maior) e inclinação
// em graus. Uma arrumação para tela deitada e outra para tela em pé (celular).
const ESPALHADOS = {
  deitada: [
    [-0.64, 0.5, 0.8, -7],
    [0.1, 0.62, 0.62, 9],
    [0.66, 0.3, 0.85, -4],
    [0.22, -0.4, 1.0, 3],
    [-0.58, -0.5, 0.74, 8],
  ],
  emPe: [
    [-0.42, 0.74, 0.74, -7],
    [0.42, 0.42, 0.68, 9],
    [-0.22, 0.04, 1.0, 3],
    [0.4, -0.36, 0.74, -5],
    [-0.36, -0.72, 0.8, 8],
  ],
  maiorDeitada: 0.21, // largura do maior olho, em fração da largura da tela (tela deitada)
  maiorEmPe: 0.4, // (tela em pé)
};

// a amêndoa é a interseção de dois círculos (raio R, centros em y = +d e y = -d)
function lente(meiaLargura, meiaAltura) {
  const k = (meiaLargura * meiaLargura) / meiaAltura;
  return new THREE.Vector2((k + meiaAltura) / 2, (k - meiaAltura) / 2);
}

// GLSL comum: distância até a borda da amêndoa (negativa dentro) e ruído
const GLSL_COMUM = /* glsl */ `
  uniform vec2 uLente; // (R, d)
  uniform float uDesloc; // ao piscar, o olho fecha um pouco abaixo do meio
  float sdLente(vec2 p) {
    // distância exata até a amêndoa (de Inigo Quilez, "vesica"): além das pontas mede até a
    // ponta, então o contorno não "vaza" quando o olho está quase fechado
    p.y -= uDesloc;
    vec2 q = abs(vec2(p.y, p.x));
    float b = sqrt(max(uLente.x * uLente.x - uLente.y * uLente.y, 0.0));
    return ((q.y - b) * uLente.y > q.x * b) ? length(q - vec2(0.0, b)) : length(q - vec2(-uLente.y, 0.0)) - uLente.x;
  }
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float ruido(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // estrela de n pontas (de Inigo Quilez): raio r até as pontas; m (2..n) deixa os lados mais
  // ou menos côncavos. As pontas ficam em cima, embaixo e dos lados.
  float sdEstrela(vec2 p, float r, float n, float m) {
    float an = 3.141593 / n;
    float en = 3.141593 / m;
    vec2 acs = vec2(cos(an), sin(an));
    vec2 ecs = vec2(cos(en), sin(en));
    float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
  }
  // falha (glitch): algumas faixas horizontais do olho escorregam para o lado
  uniform float uGlitch; uniform float uSemente; uniform float uVermelho;
  uniform vec3 uAzulG; uniform vec3 uVermG; uniform vec3 uVermClique;
  float acaso(float n) { return fract(sin(n) * 43758.5453); }
  float deslizeGlitch(float y) {
    float faixa = floor(y * 1.7 + uSemente);
    float corte = step(0.55, acaso(faixa * 7.13 + uSemente)) * uGlitch;
    return (acaso(faixa * 3.71 + uSemente * 1.3) - 0.5) * 2.6 * corte;
  }
  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * ruido(p); p *= 2.03; a *= 0.5; }
    return s;
  }
`;

// mistura "pré-multiplicada": onde alfa = 1 o objeto cobre o que está atrás; onde alfa = 0 a
// cor só soma (brilho)
function materialOlho(uniforms, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

const cor3 = (h) => new THREE.Color(h);

class Olho {
  constructor(cena) {
    this.grupo = new THREE.Group();
    cena.add(this.grupo);
    const L = lente(OLHO.meiaLargura, OLHO.meiaAltura);
    this.uComuns = {
      uLente: { value: L },
      uDesloc: { value: 0 },
      uT: { value: 0 },
      uLinha: { value: OLHO.linha },
      uGlitch: { value: 0 }, // 0..1: força da falha agora
      uSemente: { value: 0 }, // muda a cada quadro da falha (faixas e deslocamentos diferentes)
      uVermelho: { value: 0 }, // 0..1: o olho fica vermelho (clique)
      uAzulG: { value: cor3(EFEITOS.azul) },
      uVermG: { value: cor3(EFEITOS.vermelho) },
      uVermClique: { value: cor3(EFEITOS.vermelhoClique) },
      // usados na cena da transcendência
      uOpac: { value: 1 }, // o olho inteiro (some quando outro é escolhido)
      uBrilho: { value: 1 }, // linhas mais fortes
      uLuzDentro: { value: 0 }, // luz saindo de dentro do olho (pela fresta da pálpebra)
      uIrisLinha: { value: 1 }, // o círculo da íris (some quando a íris vira a estrela)
      uPupilaLinha: { value: 1 }, // o contorno da fenda
    };
    this.L = L;

    // ---- pálpebras (duas linhas de luz que se cruzam nas pontas), halo e um véu bem leve por
    //      dentro do olho (um retângulo que cobre o olho e o halo)
    const fundo = new THREE.Mesh(
      new THREE.PlaneGeometry(OLHO.meiaLargura * 2 + 16, OLHO.meiaAltura * 2 + 16),
      materialOlho(
        {
          ...this.uComuns,
          uContorno: { value: cor3(COR_OLHO.contorno) },
          uHalo: { value: cor3(COR_OLHO.halo) },
          uVeuCor: { value: cor3(COR_OLHO.veu) },
          uVeu: { value: VEU },
          uSobra: { value: OLHO.sobra },
        },
        /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        /* glsl */ `
          uniform float uT; uniform vec3 uContorno; uniform vec3 uHalo; uniform vec3 uVeuCor; uniform float uVeu;
          uniform float uSobra; uniform float uLinha;
          uniform float uOpac; uniform float uBrilho; uniform float uLuzDentro;
          varying vec2 vP;
          ${GLSL_COMUM}
          // uma pálpebra: arco de círculo (centro c, raio R) até um pouco além das pontas
          float palpebra(vec2 p, vec2 c, float meiaLargura, float lado) {
            float d = abs(length(p - c) - uLente.x);
            float ate = 1.0 - smoothstep(meiaLargura + uSobra * 0.35, meiaLargura + uSobra, abs(p.x));
            ate *= step(0.0, lado * (c.y - p.y)); // só o lado do arco que forma a pálpebra
            return (exp(-pow(d / uLinha, 2.0)) + 0.16 * exp(-pow(d / (uLinha * 4.0), 2.0))) * ate;
          }
          // as duas pálpebras (de baixo: círculo com centro acima; de cima: centro abaixo)
          float palpebras(vec2 p) {
            float meiaLargura = sqrt(max(uLente.x * uLente.x - uLente.y * uLente.y, 0.0));
            return min(palpebra(p, vec2(0.0, uLente.y), meiaLargura, 1.0) + palpebra(p, vec2(0.0, -uLente.y), meiaLargura, -1.0), 1.4);
          }
          void main() {
            float sd = sdLente(vP);
            float dentro = 1.0 - smoothstep(-0.03, 0.03, sd);
            vec2 p = vec2(vP.x + deslizeGlitch(vP.y), vP.y - uDesloc);
            float pulso = 0.92 + 0.08 * sin(uT * 1.6);
            // na falha: uma cópia azul e uma vermelho-escura, deslocadas para os lados
            float desvio = 0.5 * uGlitch;
            float linhas = palpebras(p);
            float linhasAzul = palpebras(p + vec2(desvio, 0.08 * uGlitch));
            float linhasVerm = palpebras(p - vec2(desvio, 0.08 * uGlitch));
            // halo violeta do lado de fora
            float fora = max(sd, 0.0);
            float halo = (exp(-fora / 0.8) * 0.24 + exp(-fora / 3.5) * 0.08) * (1.0 - dentro);
            // o halo vai a zero antes da borda do retângulo onde é desenhado (senão aparece um
            // "quadrado" de luz fraquinha em volta de cada olho)
            halo *= 1.0 - smoothstep(4.0, 7.5, fora);
            vec3 corLinha = mix(uContorno, uVermClique, uVermelho);
            vec3 corHalo = mix(uHalo, uVermG, uVermelho * 0.8);
            vec3 brilho = (corLinha * linhas * (1.0 - 0.5 * uGlitch) * uBrilho + corHalo * halo * (0.6 + 0.4 * uBrilho)) * pulso;
            brilho += (uAzulG * linhasAzul + uVermG * 1.6 * linhasVerm) * uGlitch * 1.3;
            // luz saindo de dentro (mais forte no meio da fresta)
            brilho += vec3(0.96, 0.9, 1.0) * dentro * uLuzDentro * (0.55 + 0.45 * exp(-vP.x * vP.x / 30.0));
            float veu = dentro * uVeu * uOpac;
            gl_FragColor = vec4(uVeuCor * veu + brilho * uOpac, veu);
          }
        `
      )
    );
    fundo.renderOrder = 10;
    this.fundo = fundo;
    this.grupo.add(fundo);

    // ---- íris e pupila: só os contornos (um círculo e uma fenda em pé), transparentes por dentro
    this.iris = new THREE.Group();
    this.grupo.add(this.iris);
    const lado = OLHO.raioIris * 2 + 1.5;
    // a fenda também é uma amêndoa (em pé): pontas finas, como a pupila de um gato
    const fenda = (meiaLargura) => {
      const k = (OLHO.fenda.meiaAltura * OLHO.fenda.meiaAltura) / meiaLargura;
      return new THREE.Vector2((k + meiaLargura) / 2, (k - meiaLargura) / 2);
    };
    this.fenda = fenda;
    this.uIris = {
      ...this.uComuns,
      uRi: { value: OLHO.raioIris },
      uFenda: { value: fenda(OLHO.fenda.meiaLargura) },
      uCorIris: { value: cor3(COR_OLHO.iris) },
      uCorPupila: { value: cor3(COR_OLHO.pupila) },
      uIrisPos: { value: new THREE.Vector2() }, // onde a íris está dentro do olho
      uIrisEscala: { value: new THREE.Vector2(1, 1) },
      uForma: { value: 0 }, // a pupila: 0 = fenda, 1 = estrela de 4 pontas (olho transformado)
      uEstrelaR: { value: OLHO.pupilaEstrela.raio },
    };
    const discoIris = new THREE.Mesh(
      new THREE.PlaneGeometry(lado, lado),
      materialOlho(
        this.uIris,
        /* glsl */ `
          uniform vec2 uIrisPos; uniform vec2 uIrisEscala;
          varying vec2 vP; varying vec2 vW;
          void main() {
            vP = position.xy;
            vW = position.xy * uIrisEscala + uIrisPos; // posição dentro do olho
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        /* glsl */ `
          uniform float uT; uniform float uRi; uniform vec2 uFenda; uniform vec3 uCorIris; uniform vec3 uCorPupila;
          uniform float uLinha;
          uniform float uOpac; uniform float uBrilho; uniform float uIrisLinha; uniform float uPupilaLinha;
          uniform float uForma; uniform float uEstrelaR;
          varying vec2 vP; varying vec2 vW;
          ${GLSL_COMUM}
          // amêndoa em pé (a fenda da pupila): círculos de raio R com centros em x = +d e x = -d
          float sdFenda(vec2 p) {
            vec2 q = abs(p);
            float b = sqrt(max(uFenda.x * uFenda.x - uFenda.y * uFenda.y, 0.0));
            return ((q.y - b) * uFenda.y > q.x * b) ? length(q - vec2(0.0, b)) : length(q - vec2(-uFenda.y, 0.0)) - uFenda.x;
          }
          float traco(float d, float w) { return exp(-pow(d / w, 2.0)) + 0.16 * exp(-pow(d / (w * 4.0), 2.0)); }
          float tracos(vec2 p, vec3 corIris, vec3 corPupila, out vec3 cor) {
            float iris = traco(abs(length(p) - uRi), uLinha * 0.9);
            float sdPupila = uForma > 0.0 ? mix(sdFenda(p), sdEstrela(p, uEstrelaR, 4.0, 3.0), uForma) : sdFenda(p);
            float pupila = traco(abs(sdPupila), uLinha * 0.85);
            cor = corIris * iris * 0.85 * uIrisLinha + corPupila * pupila * uPupilaLinha;
            return iris * uIrisLinha + pupila * uPupilaLinha;
          }
          void main() {
            // na falha, as mesmas faixas que escorregam nas pálpebras escorregam aqui
            float deslize = deslizeGlitch(vW.y);
            vec2 w = vec2(vW.x + deslize, vW.y);
            float visivel = 1.0 - smoothstep(-0.08, 0.04, sdLente(w)); // só dentro do olho
            if (visivel <= 0.0) discard;
            vec2 p = vP + vec2(deslize, 0.0);
            vec3 corIris = mix(uCorIris, uVermClique, uVermelho);
            vec3 corPupila = mix(uCorPupila, uVermClique, uVermelho);
            vec3 cor;
            tracos(p, corIris, corPupila, cor);
            cor *= 1.0 - 0.5 * uGlitch;
            if (uGlitch > 0.0) {
              // cópias azul e vermelho-escura, deslocadas para os lados
              float desvio = 0.5 * uGlitch;
              vec3 lixo;
              float a = tracos(p + vec2(desvio, 0.08 * uGlitch), uAzulG, uAzulG, lixo);
              float b = tracos(p - vec2(desvio, 0.08 * uGlitch), uVermG, uVermG, lixo);
              cor += (uAzulG * a + uVermG * 1.6 * b) * uGlitch * 1.1;
            }
            cor *= visivel * uBrilho * uOpac;
            cor *= 1.0 - smoothstep(uRi + 0.35, uRi + 0.7, length(vP)); // (zero antes da borda do quadrado)
            gl_FragColor = vec4(cor, 0.0); // só luz: por dentro tudo é transparente
          }
        `
      )
    );
    discoIris.renderOrder = 11;
    this.iris.add(discoIris);
  }

  /** Coloca o olho na tela: posição, tamanho e uma leve inclinação. */
  posicionar(x, y, escala, inclinacao) {
    this.grupo.position.set(x, y, 0);
    this.grupo.scale.setScalar(escala);
    this.grupo.rotation.z = inclinacao;
    // olhos menores ficam com as linhas um pouco mais grossas (senão somem)
    this.uComuns.uLinha.value = OLHO.linha / Math.sqrt(Math.min(1, escala * 2.2));
  }

  /**
   * @param olharX, olharY  para onde olha, de -1 a 1 (0 = para a frente)
   * @param abertura        1 = aberto, 0 = fechado (piscando)
   */
  atualizar(t, olharX, olharY, abertura, glitch = 0, vermelho = 0) {
    this.uComuns.uT.value = t;
    this.uComuns.uGlitch.value = glitch;
    if (glitch > 0) this.uComuns.uSemente.value = Math.floor(Math.random() * 1000);
    this.uComuns.uVermelho.value = vermelho;
    // a íris vai para o lado e, vista de lado, fica um pouco achatada (o olho é redondo)
    this.iris.position.set(olharX * ANIMACAO.alcance.x, olharY * ANIMACAO.alcance.y, 0);
    this.iris.scale.set(1 - 0.12 * olharX * olharX, 1 - 0.1 * olharY * olharY, 1);
    this.uIris.uIrisPos.value.set(this.iris.position.x, this.iris.position.y);
    this.uIris.uIrisEscala.value.set(this.iris.scale.x, this.iris.scale.y);
    // a fenda da pupila abre e fecha um pouco, devagar
    this.uIris.uFenda.value.copy(this.fenda(OLHO.fenda.meiaLargura * (1 + 0.18 * Math.sin(t * 0.7))));
    // piscar: a amêndoa fecha (mais a pálpebra de cima, então fecha um pouco abaixo do meio)
    const meiaAltura = Math.max(0.06, OLHO.meiaAltura * abertura);
    const k = (OLHO.meiaLargura * OLHO.meiaLargura) / meiaAltura;
    this.L.set((k + meiaAltura) / 2, (k - meiaAltura) / 2);
    this.uComuns.uDesloc.value = -(1 - abertura) * OLHO.meiaAltura * 0.3;
  }
}

// ---------------------------------------------------------------- cena
const palco = document.getElementById('palco');
const fraco = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, fraco ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
prepararRenderizador(renderer);
palco.appendChild(renderer.domElement);

const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 9000);
const tex = criarTexturas();
const ceu = new Ceu(cena, tex, fraco ? 0.5 : 1);
const olhos = ESPALHADOS.deitada.map(() => ({
  olho: new Olho(cena),
  centro: new THREE.Vector2(),
  escala: 1,
  inclinacao: 0,
  x: 0, // para onde está olhando (-1 a 1)
  y: 0,
  vx: 0,
  vy: 0,
  alvoX: 0, // para onde quer olhar
  alvoY: 0,
  proximaOlhada: 0,
  piscada: null,
  proximaPiscada: 0,
  abertura: 1,
  quandoPiscou: [], // instantes das últimas piscadas (para conferir o intervalo)
  glitchIni: -1, // a falha atual (início e duração)
  glitchDura: 0,
  glitchForca: 1,
  proximoGlitch: 0,
  cliqueIni: -1, // quando foi clicado (fica vermelho e quase fechado)
}));
// (o brilho difuso só pega o que é bem claro)
const { composer, bloom } = criarPosProcesso(renderer, cena, camera, { bloom: [0.6, 0.28, 0.6] });

// a cena da transcendência (um olho é escolhido, vira a estrela e entramos na pupila)
const trans = new Transcendencia({
  cena,
  camera,
  tex,
  composer,
  olhos,
  ceu,
  medidas: OLHO,
  elementos: { vinheta: document.getElementById('vinheta'), clarao: document.getElementById('clarao') },
  aoTerminar: () => {
    // acabou no espaço vazio: mostra o conteúdo de depois e avisa quem quiser saber
    const final = document.getElementById('final');
    if (final) final.hidden = false;
    document.body.classList.add('fim');
    window.dispatchEvent(new CustomEvent('olho:fim'));
  },
});

function enquadrar() {
  // câmera fixa; os olhos se espalham pela área visível
  camera.position.set(0, 0, 60);
  camera.lookAt(0, 0, 0);
  const meiaAltura = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const meiaLargura = meiaAltura * camera.aspect;
  const emPe = camera.aspect < 0.9;
  const lista = emPe ? ESPALHADOS.emPe : ESPALHADOS.deitada;
  const maior = (2 * meiaLargura * (emPe ? ESPALHADOS.maiorEmPe : ESPALHADOS.maiorDeitada)) / (OLHO.meiaLargura * 2);
  lista.forEach(([x, y, tamanho, graus], i) => {
    const o = olhos[i];
    o.centro.set(x * meiaLargura, y * meiaAltura);
    o.escala = maior * tamanho;
    o.inclinacao = THREE.MathUtils.degToRad(graus);
    o.olho.posicionar(o.centro.x, o.centro.y, o.escala, o.inclinacao);
  });
}
function redimensionar() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  globais.uEscalaPixel.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  enquadrar();
}
addEventListener('resize', redimensionar);
redimensionar();

// ---------------------------------------------------------------- animação
const rand = (a, b) => a + Math.random() * (b - a);
const estado = {
  modo: 'seguindo', // 'seguindo' o ponteiro, 'voltando' para a frente ou 'vagando' (olhando em volta)
  ponteiro: null, // onde o ponteiro está, no plano dos olhos
  ultimoMovimento: 0,
  fimDoNormal: 0,
  olhos,
  aberturaFixa: null, // para testes: congela a piscada nesta abertura
};
// cada olho pisca e falha no seu ritmo (a primeira vez de cada um num momento diferente)
for (const o of olhos) {
  o.proximaPiscada = rand(1.5, ANIMACAO.piscarEntre[1]);
  o.proximoGlitch = rand(1, EFEITOS.glitchEntre[1]);
}

function glitchar(o, t, duracao, forca = 1) {
  o.glitchIni = t;
  o.glitchDura = duracao;
  o.glitchForca = forca;
}

/** Força da falha agora (0..1): pisca aos trancos enquanto dura. */
function atualizarGlitch(o, t) {
  if (t >= o.proximoGlitch) {
    glitchar(o, t, rand(...EFEITOS.glitchDura), rand(0.6, 1));
    o.proximoGlitch = t + rand(...EFEITOS.glitchEntre);
  }
  const e = t - o.glitchIni;
  if (o.glitchIni < 0 || e > o.glitchDura) return 0;
  // aos trancos: liga e desliga rápido, com força variando
  return Math.random() < 0.3 ? 0.12 : o.glitchForca * rand(0.55, 1);
}

/** Clique: pisca vermelho, fecha quase todo e fica assim ~5 s; devolve { abertura, vermelho }. */
const _clique = { abertura: 1, vermelho: 0 };
function atualizarClique(o, t) {
  const e = t - o.cliqueIni;
  const dura = EFEITOS.clique.fechado;
  if (o.cliqueIni < 0 || e > dura + 0.6) {
    _clique.abertura = 1;
    _clique.vermelho = 0;
    return null;
  }
  const quase = EFEITOS.clique.abertura;
  // fecha rápido (0,12 s), fica quase fechado e abre devagar (0,6 s) no fim
  const fechar = Math.min(1, e / 0.12);
  const abrir = Math.max(0, (e - dura) / 0.6);
  _clique.abertura = 1 - (1 - quase) * (fechar * fechar) + (1 - quase) * (abrir * abrir * (3 - 2 * abrir));
  // um clarão vermelho piscando no começo; depois fica um vermelho fraco até abrir
  const clarao = Math.exp(-e * 3.5) * (0.7 + 0.3 * Math.cos(e * 48));
  const fundo = 0.4 * (1 - THREE.MathUtils.smoothstep(e, dura - 0.2, dura + 0.5));
  _clique.vermelho = Math.min(1, clarao + fundo);
  return _clique;
}

// em cima de qual olho está o ponteiro (ou -1)
const _local = new THREE.Vector2();
function olhoEm(ponto) {
  for (let i = 0; i < olhos.length; i++) {
    const o = olhos[i];
    _local.copy(ponto).sub(o.centro).divideScalar(o.escala).rotateAround(new THREE.Vector2(), -o.inclinacao);
    const x = _local.x / (OLHO.meiaLargura + 0.8);
    const y = _local.y / (OLHO.meiaAltura + 0.8);
    if (x * x + y * y < 1) return i;
  }
  return -1;
}

// ponteiro -> ponto no plano dos olhos
const _ndc = new THREE.Vector3();
function moveu(e) {
  if (trans.ativa) return; // durante a cena os olhos não seguem mais o ponteiro
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, 0.5).unproject(camera);
  _ndc.sub(camera.position).normalize();
  const k = -camera.position.z / _ndc.z;
  estado.ponteiro = new THREE.Vector2(camera.position.x + _ndc.x * k, camera.position.y + _ndc.y * k);
  estado.ultimoMovimento = relogio.getElapsedTime();
  if (estado.modo === 'vagando') for (const o of olhos) glitchar(o, estado.ultimoMovimento, 0.15, 0.6); // acordaram
  estado.modo = 'seguindo';
  // em cima de um olho, o cursor vira a mãozinha (dá para clicar)
  palco.style.cursor = olhoEm(estado.ponteiro) >= 0 ? 'pointer' : 'default';
}
addEventListener('pointermove', moveu, { passive: true });
addEventListener('pointerdown', (e) => {
  if (trans.ativa) return;
  moveu(e);
  const i = olhoEm(estado.ponteiro);
  if (i < 0) return;
  const o = olhos[i];
  const t = relogio.getElapsedTime();
  o.cliqueIni = t;
  o.piscada = null;
  glitchar(o, t, 0.35, 1);
});

const _v = new THREE.Vector2();
function atualizarOlhar(o, t, dt) {
  if (estado.modo === 'seguindo') {
    if (estado.ponteiro) {
      // o ponteiro visto de dentro deste olho (desfazendo posição, tamanho e inclinação)
      _v.copy(estado.ponteiro).sub(o.centro).divideScalar(o.escala).rotateAround(new THREE.Vector2(), -o.inclinacao);
      // longe do olho ele olha até o canto; perto, mexe menos
      const d = _v.length() || 1;
      const forca = Math.min(1, d / (OLHO.meiaLargura + 2));
      o.alvoX = (_v.x / d) * forca;
      o.alvoY = (_v.y / d) * forca;
    }
  } else if (estado.modo === 'voltando') {
    o.alvoX = 0;
    o.alvoY = 0;
  } else if (t >= o.proximaOlhada) {
    // olha para outro lugar (longe o bastante do atual para se notar); às vezes volta ao meio
    if (Math.random() < 0.15) {
      o.alvoX = rand(-0.1, 0.1);
      o.alvoY = rand(-0.1, 0.1);
    } else {
      let x;
      let y;
      do {
        x = rand(-1, 1);
        y = rand(-0.85, 0.85);
      } while (Math.hypot(x - o.alvoX, y - o.alvoY) < 0.6);
      o.alvoX = x;
      o.alvoY = y;
    }
    o.proximaOlhada = t + rand(0.9, 2.4);
  }
  // não passa da borda do olho
  const m = Math.hypot(o.alvoX, o.alvoY);
  if (m > 1) {
    o.alvoX /= m;
    o.alvoY /= m;
  }
  // mola sem balanço: segue rápido, volta ao meio devagar, olha em volta com movimentos rápidos
  const k = estado.modo === 'seguindo' ? 70 : estado.modo === 'voltando' ? 9 : 150;
  const c = 2 * Math.sqrt(k);
  const passos = 4;
  const h = dt / passos;
  for (let i = 0; i < passos; i++) {
    o.vx += (k * (o.alvoX - o.x) - c * o.vx) * h;
    o.vy += (k * (o.alvoY - o.y) - c * o.vy) * h;
    o.x += o.vx * h;
    o.y += o.vy * h;
  }
}

/** Abertura de um olho (1 aberto, 0 fechado): pisca a cada 8 a 10 s, cada vez um pouco diferente. */
function atualizarPiscada(o, t) {
  if (!o.piscada && t >= o.proximaPiscada) {
    o.piscada = { t0: t, fechar: rand(0.07, 0.11), fechado: rand(0.03, 0.08), abrir: rand(0.12, 0.2) };
    o.proximaPiscada = t + rand(...ANIMACAO.piscarEntre);
    o.quandoPiscou.push(+t.toFixed(2));
    if (o.quandoPiscou.length > 10) o.quandoPiscou.shift();
  }
  if (!o.piscada) return 1;
  const e = t - o.piscada.t0;
  if (e < o.piscada.fechar) return 1 - (e / o.piscada.fechar) ** 2;
  if (e < o.piscada.fechar + o.piscada.fechado) return 0;
  const a = (e - o.piscada.fechar - o.piscada.fechado) / o.piscada.abrir;
  if (a < 1) return 1 - (1 - a) ** 2;
  o.piscada = null;
  return 1;
}

const relogio = new THREE.Clock();

// começo da cena: ?transcender começa logo; ?cena=7.5 começa e congela no segundo 7,5 da cena
// (para testes); senão, sozinha depois de TRANSCENDER.inicioAutomatico segundos
const parametros = new URLSearchParams(location.search);
let inicioDaCena = parametros.has('transcender') || parametros.has('cena') ? 0.5 : TRANSCENDER.inicioAutomatico;
if (parametros.has('cena')) trans.congelar = Number(parametros.get('cena')) || 0;
function transcender(indice = Math.floor(Math.random() * olhos.length)) {
  inicioDaCena = null;
  palco.style.cursor = 'default';
  for (const o of olhos) o.cliqueIni = -1;
  trans.iniciar(relogio.getElapsedTime(), indice);
}
let antes = 0;
function quadro() {
  const t = relogio.getElapsedTime();
  estado.t = t;
  const dt = Math.min(0.05, t - antes);
  antes = t;
  // o mesmo relógio para todos: parado 7 s, todos voltam para a frente; ~3 s depois cada um
  // começa a olhar em volta no seu tempo
  const parado = t - estado.ultimoMovimento;
  if (estado.modo === 'seguindo' && parado > ANIMACAO.voltarDepois) {
    estado.modo = 'voltando';
    estado.fimDoNormal = t + rand(ANIMACAO.normalPor - 0.3, ANIMACAO.normalPor + 0.3);
  } else if (estado.modo === 'voltando' && t > estado.fimDoNormal) {
    estado.modo = 'vagando';
    for (const o of olhos) o.proximaOlhada = t + rand(0, 0.9);
  }
  globais.camPos.copy(camera.position);
  // a cena da transcendência começa sozinha depois de um tempo (ou com olho.transcender())
  if (!trans.ativa && inicioDaCena != null && t >= inicioDaCena) transcender();
  if (trans.ativa) {
    trans.atualizar(t, dt);
    composer.render();
    requestAnimationFrame(quadro);
    return;
  }
  ceu.atualizar(t, camera, 1);
  for (const o of olhos) {
    atualizarOlhar(o, t, dt);
    const clique = atualizarClique(o, t);
    if (clique) {
      // clicado: quase fechado e vermelho (não pisca enquanto isso)
      o.abertura = clique.abertura;
      o.proximaPiscada = Math.max(o.proximaPiscada, t + 2);
    } else {
      o.abertura = atualizarPiscada(o, t);
    }
    if (estado.aberturaFixa != null) o.abertura = estado.aberturaFixa; // (só para testes)
    o.glitch = estado.glitchFixo ?? atualizarGlitch(o, t); // (glitchFixo: só para testes)
    o.olho.atualizar(t, o.x, o.y, o.abertura, o.glitch, clique ? clique.vermelho : 0);
  }
  composer.render();
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// para testes: window.olho mostra o estado atual; telaDoOlho(i) diz onde o olho i está na tela
estado.glitchFixo = null;
estado.transcender = transcender; // olho.transcender() começa a cena (olho.transcender(2): com o olho 2)
estado.cena = trans;
estado.telaDoOlho = (i) => {
  const v = new THREE.Vector3(olhos[i].centro.x, olhos[i].centro.y, 0).project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
};
window.olho = estado;
