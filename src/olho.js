/*
 * Olhos roxos desenhados com luz, no mesmo estilo de arte do Big Bang (luz e brilho difuso).
 *
 * São 5 olhos espalhados pela tela (tamanhos e inclinações diferentes). Animação:
 *  - cada olho segue o mouse (ou o dedo) a partir de onde está;
 *  - se o ponteiro fica parado por 7 segundos, ele volta a olhar para a frente, fica assim uns
 *    3 segundos e depois começa a olhar para lugares aleatórios; mexeu, volta a seguir;
 *  - cada um pisca a cada 8 a 10 segundos, no seu ritmo (cada piscada um pouco diferente).
 * Os efeitos em volta do olho vêm na próxima etapa.
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

// ---------------------------------------------------------------- medidas do olho
const OLHO = {
  meiaLargura: 11, // metade da largura da amêndoa
  meiaAltura: 5.2, // metade da altura (olho aberto)
  sobra: 1.1, // as linhas das pálpebras passam um pouco das pontas e se cruzam (como num desenho)
  raioIris: 4.5,
  fenda: { meiaAltura: 3.5, meiaLargura: 0.85 }, // a pupila é uma fenda em pé (olho de gato)
  linha: 0.075, // espessura das linhas de luz
};
const COR_OLHO = {
  contorno: '#e2ccff', // as pálpebras
  iris: '#c9adff', // o círculo da íris
  pupila: '#f1e6ff', // a fenda da pupila
  halo: '#7c3aed', // o brilho em volta do olho
  veu: '#06010f', // o olho por dentro é transparente, só um pouco mais escuro que o céu
};
const VEU = 0.35; // 0 = o céu aparece inteiro dentro do olho, 1 = o olho por dentro fica todo escuro

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
    this.uComuns = { uLente: { value: L }, uDesloc: { value: 0 }, uT: { value: 0 }, uLinha: { value: OLHO.linha } };
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
          varying vec2 vP;
          ${GLSL_COMUM}
          // uma pálpebra: arco de círculo (centro c, raio R) até um pouco além das pontas
          float palpebra(vec2 p, vec2 c, float meiaLargura, float lado) {
            float d = abs(length(p - c) - uLente.x);
            float ate = 1.0 - smoothstep(meiaLargura + uSobra * 0.35, meiaLargura + uSobra, abs(p.x));
            ate *= step(0.0, lado * (c.y - p.y)); // só o lado do arco que forma a pálpebra
            return (exp(-pow(d / uLinha, 2.0)) + 0.16 * exp(-pow(d / (uLinha * 4.0), 2.0))) * ate;
          }
          void main() {
            float sd = sdLente(vP);
            float dentro = 1.0 - smoothstep(-0.03, 0.03, sd);
            vec2 p = vec2(vP.x, vP.y - uDesloc);
            float meiaLargura = sqrt(max(uLente.x * uLente.x - uLente.y * uLente.y, 0.0));
            float pulso = 0.92 + 0.08 * sin(uT * 1.6);
            // de baixo: círculo com centro acima; de cima: círculo com centro abaixo
            float linhas = palpebra(p, vec2(0.0, uLente.y), meiaLargura, 1.0) + palpebra(p, vec2(0.0, -uLente.y), meiaLargura, -1.0);
            // halo violeta do lado de fora
            float fora = max(sd, 0.0);
            float halo = (exp(-fora / 0.8) * 0.24 + exp(-fora / 3.5) * 0.08) * (1.0 - dentro);
            // o halo vai a zero antes da borda do retângulo onde é desenhado (senão aparece um
            // "quadrado" de luz fraquinha em volta de cada olho)
            halo *= 1.0 - smoothstep(4.0, 7.5, fora);
            vec3 brilho = (uContorno * min(linhas, 1.4) + uHalo * halo) * pulso;
            float veu = dentro * uVeu;
            gl_FragColor = vec4(uVeuCor * veu + brilho, veu);
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
          varying vec2 vP; varying vec2 vW;
          ${GLSL_COMUM}
          // amêndoa em pé (a fenda da pupila): círculos de raio R com centros em x = +d e x = -d
          float sdFenda(vec2 p) {
            vec2 q = abs(p);
            float b = sqrt(max(uFenda.x * uFenda.x - uFenda.y * uFenda.y, 0.0));
            return ((q.y - b) * uFenda.y > q.x * b) ? length(q - vec2(0.0, b)) : length(q - vec2(-uFenda.y, 0.0)) - uFenda.x;
          }
          float traco(float d, float w) { return exp(-pow(d / w, 2.0)) + 0.16 * exp(-pow(d / (w * 4.0), 2.0)); }
          void main() {
            float visivel = 1.0 - smoothstep(-0.08, 0.04, sdLente(vW)); // só dentro do olho
            if (visivel <= 0.0) discard;
            float iris = traco(abs(length(vP) - uRi), uLinha * 0.9);
            float pupila = traco(abs(sdFenda(vP)), uLinha * 0.85);
            vec3 cor = (uCorIris * iris * 0.85 + uCorPupila * pupila) * visivel;
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
  atualizar(t, olharX, olharY, abertura) {
    this.uComuns.uT.value = t;
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
}));
// (o brilho difuso só pega o que é bem claro)
const { composer, bloom } = criarPosProcesso(renderer, cena, camera, { bloom: [0.6, 0.28, 0.6] });

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
// cada olho pisca no seu ritmo (a primeira piscada de cada um num momento diferente)
for (const o of olhos) o.proximaPiscada = rand(1.5, ANIMACAO.piscarEntre[1]);

// ponteiro -> ponto no plano dos olhos
const _ndc = new THREE.Vector3();
function moveu(e) {
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, 0.5).unproject(camera);
  _ndc.sub(camera.position).normalize();
  const k = -camera.position.z / _ndc.z;
  estado.ponteiro = new THREE.Vector2(camera.position.x + _ndc.x * k, camera.position.y + _ndc.y * k);
  estado.ultimoMovimento = relogio.getElapsedTime();
  estado.modo = 'seguindo';
}
addEventListener('pointermove', moveu, { passive: true });
addEventListener('pointerdown', moveu, { passive: true });

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
  ceu.atualizar(t, camera, 1);
  for (const o of olhos) {
    atualizarOlhar(o, t, dt);
    o.abertura = estado.aberturaFixa ?? atualizarPiscada(o, t); // (aberturaFixa: só para testes)
    o.olho.atualizar(t, o.x, o.y, o.abertura);
  }
  composer.render();
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// para testes: window.olho mostra o estado atual
window.olho = estado;
