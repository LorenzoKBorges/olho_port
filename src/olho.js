/*
 * O olho roxo, no mesmo estilo de arte do Big Bang (luz, brilho difuso e partículas).
 *
 * Animação:
 *  - o olho segue o mouse (ou o dedo);
 *  - se o ponteiro fica parado por 7 segundos, ele volta a olhar para a frente, fica assim uns
 *    3 segundos e depois começa a olhar para lugares aleatórios; mexeu, volta a seguir;
 *  - pisca a cada 8 a 10 segundos (cada piscada um pouco diferente).
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
    };
    const discoIris = new THREE.Mesh(
      new THREE.PlaneGeometry(lado, lado),
      materialOlho(
        this.uIris,
        /* glsl */ `
          varying vec2 vP; varying vec2 vW;
          void main() {
            vP = position.xy;
            vW = (modelMatrix * vec4(position, 1.0)).xy;
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
            gl_FragColor = vec4(cor, 0.0); // só luz: por dentro tudo é transparente
          }
        `
      )
    );
    discoIris.renderOrder = 11;
    this.iris.add(discoIris);
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
const olho = new Olho(cena);
// (o brilho difuso só pega o que é bem claro: senão a íris inteira vira uma mancha)
const { composer, bloom } = criarPosProcesso(renderer, cena, camera, { bloom: [0.6, 0.28, 0.6] });

function enquadrar() {
  // o olho ocupa uns 55% da largura (ou 88% em tela em pé)
  const largura = OLHO.meiaLargura * 2;
  const meiaVertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const fracao = camera.aspect < 1 ? 0.88 : 0.55;
  const larguraVisivel = largura / fracao;
  const dist = larguraVisivel / 2 / (Math.tan(meiaVertical) * camera.aspect);
  camera.position.set(0, 0, Math.max(dist, (OLHO.meiaAltura * 2) / 0.5 / 2 / Math.tan(meiaVertical)));
  camera.lookAt(0, 0, 0);
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
  x: 0, // para onde o olho está olhando (-1 a 1)
  y: 0,
  vx: 0,
  vy: 0,
  alvoX: 0, // para onde ele quer olhar
  alvoY: 0,
  ultimoMovimento: 0,
  fimDoNormal: 0,
  proximaOlhada: 0,
  abertura: 1,
  piscadas: 0,
  quandoPiscou: [], // instantes das últimas piscadas (para conferir o intervalo)
  aberturaFixa: null, // para testes: congela a piscada nesta abertura
};
let piscada = null;
let proximaPiscada = rand(...ANIMACAO.piscarEntre);

// ponteiro -> ponto no plano do olho
const _ndc = new THREE.Vector3();
function moveu(e) {
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, 0.5).unproject(camera);
  _ndc.sub(camera.position).normalize();
  const k = -camera.position.z / _ndc.z;
  const px = camera.position.x + _ndc.x * k;
  const py = camera.position.y + _ndc.y * k;
  // longe do olho ele olha até o canto; perto, mexe menos
  const d = Math.hypot(px, py) || 1;
  const forca = Math.min(1, d / (OLHO.meiaLargura + 2));
  estado.alvoX = (px / d) * forca;
  estado.alvoY = (py / d) * forca;
  estado.ultimoMovimento = relogio.getElapsedTime();
  estado.modo = 'seguindo';
}
addEventListener('pointermove', moveu, { passive: true });
addEventListener('pointerdown', moveu, { passive: true });

function atualizarOlhar(t, dt) {
  const parado = t - estado.ultimoMovimento;
  if (estado.modo === 'seguindo' && parado > ANIMACAO.voltarDepois) {
    // parou: volta a olhar para a frente, devagar
    estado.modo = 'voltando';
    estado.alvoX = 0;
    estado.alvoY = 0;
    estado.fimDoNormal = t + rand(ANIMACAO.normalPor - 0.3, ANIMACAO.normalPor + 0.3);
  } else if (estado.modo === 'voltando' && t > estado.fimDoNormal) {
    estado.modo = 'vagando';
    estado.proximaOlhada = t;
  }
  if (estado.modo === 'vagando' && t >= estado.proximaOlhada) {
    // olha para outro lugar (longe o bastante do atual para se notar); às vezes volta ao meio
    if (Math.random() < 0.15) {
      estado.alvoX = rand(-0.1, 0.1);
      estado.alvoY = rand(-0.1, 0.1);
    } else {
      let x;
      let y;
      do {
        x = rand(-1, 1);
        y = rand(-0.85, 0.85);
      } while (Math.hypot(x - estado.alvoX, y - estado.alvoY) < 0.6);
      estado.alvoX = x;
      estado.alvoY = y;
    }
    estado.proximaOlhada = t + rand(0.9, 2.4);
  }
  // não passa da borda do olho
  const m = Math.hypot(estado.alvoX, estado.alvoY);
  if (m > 1) {
    estado.alvoX /= m;
    estado.alvoY /= m;
  }
  // mola sem balanço: segue rápido, volta ao meio devagar, olha em volta com movimentos rápidos
  const k = estado.modo === 'seguindo' ? 70 : estado.modo === 'voltando' ? 9 : 150;
  const c = 2 * Math.sqrt(k);
  const passos = 4;
  const h = dt / passos;
  for (let i = 0; i < passos; i++) {
    estado.vx += (k * (estado.alvoX - estado.x) - c * estado.vx) * h;
    estado.vy += (k * (estado.alvoY - estado.y) - c * estado.vy) * h;
    estado.x += estado.vx * h;
    estado.y += estado.vy * h;
  }
}

/** Abertura do olho (1 aberto, 0 fechado): pisca a cada 8 a 10 s, cada vez um pouco diferente. */
function atualizarPiscada(t) {
  if (!piscada && t >= proximaPiscada) {
    piscada = { t0: t, fechar: rand(0.07, 0.11), fechado: rand(0.03, 0.08), abrir: rand(0.12, 0.2) };
    proximaPiscada = t + rand(...ANIMACAO.piscarEntre);
    estado.piscadas++;
    estado.quandoPiscou.push(+t.toFixed(2));
    if (estado.quandoPiscou.length > 10) estado.quandoPiscou.shift();
  }
  if (!piscada) return 1;
  const e = t - piscada.t0;
  if (e < piscada.fechar) return 1 - (e / piscada.fechar) ** 2;
  if (e < piscada.fechar + piscada.fechado) return 0;
  const a = (e - piscada.fechar - piscada.fechado) / piscada.abrir;
  if (a < 1) return 1 - (1 - a) ** 2;
  piscada = null;
  return 1;
}

const relogio = new THREE.Clock();
let antes = 0;
function quadro() {
  const t = relogio.getElapsedTime();
  estado.t = t;
  const dt = Math.min(0.05, t - antes);
  antes = t;
  atualizarOlhar(t, dt);
  estado.abertura = estado.aberturaFixa ?? atualizarPiscada(t); // (aberturaFixa: só para testes)
  globais.camPos.copy(camera.position);
  ceu.atualizar(t, camera, 1);
  olho.atualizar(t, estado.x, estado.y, estado.abertura);
  composer.render();
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// para testes: window.olho mostra o estado atual
window.olho = estado;
