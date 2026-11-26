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
 * Partes do olho:
 *  - contorno de amêndoa feito de luz lilás, com um halo violeta em volta;
 *  - o fundo do olho, roxo bem escuro com uma névoa;
 *  - a íris: anéis de magenta a violeta, com fibras de luz que giram devagar;
 *  - partículas brilhando e girando dentro da íris (como o disco de uma galáxia);
 *  - a pupila: um buraco negro com um anel fino de luz em volta;
 *  - um brilho em forma de estrela.
 */
import * as THREE from 'three';
import { criarTexturas } from './texturas.js';
import { globais, sprite, materialPontos, geometria, pontos } from './materiais.js';
import { Ceu } from './ceu.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { criarPosProcesso, prepararRenderizador } from './posprocesso.js';
import { criarRng } from './utils.js';

// ---------------------------------------------------------------- medidas do olho
const OLHO = {
  meiaLargura: 11, // metade da largura da amêndoa
  meiaAltura: 5.2, // metade da altura (olho aberto)
  raioIris: 4.7,
  raioPupila: 1.65,
};
const COR_OLHO = {
  contorno: '#e2ccff', // a linha de luz do contorno
  halo: '#7c3aed', // o brilho em volta do olho
  fundo: ['#030008', '#120530'], // da borda para o meio do olho
  irisDentro: '#ff4fd8', // perto da pupila
  irisMeio: '#a855f7',
  irisFora: '#4c1d95',
  anelPupila: '#f5e1ff',
};

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
  constructor(cena, tex) {
    this.grupo = new THREE.Group();
    cena.add(this.grupo);
    const L = lente(OLHO.meiaLargura, OLHO.meiaAltura);
    this.uComuns = { uLente: { value: L }, uDesloc: { value: 0 }, uT: { value: 0 } };
    this.L = L;

    // ---- contorno de luz, halo e o fundo do olho (um retângulo que cobre o olho e o halo)
    const fundo = new THREE.Mesh(
      new THREE.PlaneGeometry(OLHO.meiaLargura * 2 + 16, OLHO.meiaAltura * 2 + 16),
      materialOlho(
        {
          ...this.uComuns,
          uContorno: { value: cor3(COR_OLHO.contorno) },
          uHalo: { value: cor3(COR_OLHO.halo) },
          uFundoBorda: { value: cor3(COR_OLHO.fundo[0]) },
          uFundoMeio: { value: cor3(COR_OLHO.fundo[1]) },
          uMeiaAltura: { value: OLHO.meiaAltura },
        },
        /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        /* glsl */ `
          uniform float uT; uniform vec3 uContorno; uniform vec3 uHalo; uniform vec3 uFundoBorda; uniform vec3 uFundoMeio;
          uniform float uMeiaAltura;
          varying vec2 vP;
          ${GLSL_COMUM}
          void main() {
            float sd = sdLente(vP);
            float dentro = 1.0 - smoothstep(-0.03, 0.03, sd);
            // fundo do olho: escuro na borda, um pouco mais claro no meio, com uma névoa roxa
            float prof = clamp(-sd / uMeiaAltura, 0.0, 1.0);
            vec3 fundo = mix(uFundoBorda, uFundoMeio, smoothstep(0.0, 1.0, prof));
            float nevoa = fbm(vec3(vP * 0.32, uT * 0.04));
            fundo += uHalo * 0.16 * nevoa * nevoa * prof;
            // sombra da pálpebra de cima
            fundo *= 1.0 - 0.45 * smoothstep(0.0, uMeiaAltura, vP.y) * (1.0 - smoothstep(0.0, 1.6, -sd));
            // contorno: uma linha fina e forte de luz, mais intensa nas pontas
            float pontas = smoothstep(uLente.x - uLente.y - 5.0, uLente.x - uLente.y + 1.0, abs(vP.x));
            float pulso = 0.92 + 0.08 * sin(uT * 1.6);
            float linha = exp(-pow(sd / 0.08, 2.0)) * (1.0 + 0.8 * pontas) * pulso;
            float linhaLarga = exp(-pow(sd / 0.3, 2.0)) * 0.18;
            // halo violeta do lado de fora
            float fora = max(sd, 0.0);
            float halo = (exp(-fora / 0.8) * 0.28 + exp(-fora / 3.5) * 0.09) * (1.0 - dentro);
            vec3 brilho = uContorno * (linha + linhaLarga) + uHalo * halo * pulso;
            gl_FragColor = vec4(fundo * dentro + brilho, dentro);
          }
        `
      )
    );
    fundo.renderOrder = 10;
    this.fundo = fundo;
    this.grupo.add(fundo);

    // ---- íris (com a pupila) — pode se mover dentro do olho
    this.iris = new THREE.Group();
    this.grupo.add(this.iris);
    const lado = OLHO.raioIris * 2 + 1.5;
    this.uIris = {
      ...this.uComuns,
      uRi: { value: OLHO.raioIris },
      uRp: { value: OLHO.raioPupila },
      uDentro: { value: cor3(COR_OLHO.irisDentro) },
      uMeio: { value: cor3(COR_OLHO.irisMeio) },
      uFora: { value: cor3(COR_OLHO.irisFora) },
      uAnel: { value: cor3(COR_OLHO.anelPupila) },
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
          uniform float uT; uniform float uRi; uniform float uRp;
          uniform vec3 uDentro; uniform vec3 uMeio; uniform vec3 uFora; uniform vec3 uAnel;
          varying vec2 vP; varying vec2 vW;
          ${GLSL_COMUM}
          void main() {
            float r = length(vP);
            float alfa = 1.0 - smoothstep(uRi - 0.04, uRi + 0.14, r);
            if (alfa <= 0.0) discard;
            alfa *= 1.0 - smoothstep(-0.06, 0.06, sdLente(vW)); // só dentro do olho
            float a = atan(vP.y, vP.x);
            float x = clamp((r - uRp) / (uRi - uRp), 0.0, 1.0); // 0 na pupila, 1 na borda da íris
            // as fibras giram devagar, todas juntas, com um leve balanço perto da pupila
            // (o balanço vai e volta: as fibras nunca se enrolam)
            float giro = a + uT * 0.05 + 0.18 * sin(uT * 0.35) / (r + 0.6);
            vec2 q = vec2(cos(giro), sin(giro));
            float fibras = fbm(vec3(q * 5.0, r * 1.1 - uT * 0.05));
            float raios = pow(ruido(vec3(q * 26.0, r * 0.7)), 3.0);
            float raiosFinos = pow(ruido(vec3(q * 60.0, r * 0.4 + 7.0)), 5.0);
            vec3 cor = mix(uDentro, uMeio, smoothstep(0.0, 0.38, x));
            cor = mix(cor, uFora, smoothstep(0.42, 1.0, x));
            float luz = 0.3 + 0.55 * fibras + 0.95 * raios + 0.7 * raiosFinos;
            luz *= mix(0.95, 0.5, x); // mais forte perto da pupila
            cor *= luz;
            // anel escuro na borda da íris, com uma linha fina de luz violeta por fora
            cor *= 1.0 - 0.75 * smoothstep(0.78, 0.97, x);
            cor += uMeio * exp(-pow((r - uRi + 0.04) / 0.07, 2.0)) * 0.55;
            // pupila: buraco negro, com um anel fino de luz (e um brilho em volta do anel)
            float pupila = smoothstep(uRp + 0.03, uRp - 0.05, r);
            cor = mix(cor, vec3(0.0), pupila);
            float anel = exp(-pow((r - uRp - 0.05) / 0.06, 2.0));
            float anelLargo = exp(-pow((r - uRp - 0.05) / 0.28, 2.0)) * (1.0 - pupila);
            float pulso = 1.0 + 0.18 * sin(uT * 2.1) + 0.08 * sin(uT * 5.3);
            cor += uAnel * (anel * 1.15 + anelLargo * 0.15) * pulso;
            gl_FragColor = vec4(cor * alfa, alfa);
          }
        `
      )
    );
    discoIris.renderOrder = 11;
    this.iris.add(discoIris);

    // ---- partículas girando dentro da íris
    const rand = criarRng(77);
    const n = 1400;
    const aR = new Float32Array(n);
    const aAng = new Float32Array(n);
    const aCor = new Float32Array(n * 3);
    const aTam = new Float32Array(n);
    const aSem = new Float32Array(n);
    const cDentro = cor3('#ffb3f0');
    const cMeio = cor3('#c084fc');
    const cFora = cor3('#7c5cff');
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = Math.pow(rand(), 0.8);
      aR[i] = OLHO.raioPupila + 0.15 + x * (OLHO.raioIris - OLHO.raioPupila - 0.35);
      aAng[i] = rand() * Math.PI * 2;
      c.copy(cDentro).lerp(cMeio, Math.min(1, x * 2)).lerp(cFora, Math.max(0, x * 2 - 1));
      const b = 0.6 + rand() * 0.9;
      aCor.set([c.r * b, c.g * b, c.b * b], i * 3);
      aTam[i] = 0.05 + Math.pow(rand(), 3) * 0.16;
      aSem[i] = rand();
    }
    const brilhos = pontos(
      geometria({ aR: [aR, 1], aAng: [aAng, 1], aCor: [aCor, 3], aTam: [aTam, 1], aSem: [aSem, 1] }, n),
      materialPontos({
        uniforms: { ...this.uComuns, uCentro: { value: new THREE.Vector2() }, uEscalaIris: { value: new THREE.Vector2(1, 1) } },
        cabecalho: /* glsl */ `
          attribute float aR; attribute float aAng; attribute vec3 aCor; attribute float aTam; attribute float aSem;
          uniform float uT; uniform vec2 uCentro; uniform vec2 uEscalaIris; uniform vec2 uLente; uniform float uDesloc;
          float sdLente(vec2 p) {
            p.y -= uDesloc;
            vec2 q = abs(vec2(p.y, p.x));
            float b = sqrt(max(uLente.x * uLente.x - uLente.y * uLente.y, 0.0));
            return ((q.y - b) * uLente.y > q.x * b) ? length(q - vec2(0.0, b)) : length(q - vec2(-uLente.y, 0.0)) - uLente.x;
          }
        `,
        corpo: /* glsl */ `
          // giram como o disco de uma galáxia: mais rápido perto do centro
          float ang = aAng + uT * 0.9 / pow(aR, 1.3);
          pos = vec3(cos(ang) * aR, sin(ang) * aR, 0.05);
          cor = aCor;
          tam = aTam;
          alfa = (0.55 + 0.45 * sin(uT * (1.0 + aSem * 3.0) + aSem * 60.0));
          alfa *= 1.0 - smoothstep(-0.35, 0.0, sdLente(pos.xy * uEscalaIris + uCentro));
        `,
      })
    );
    brilhos.renderOrder = 12;
    this.brilhos = brilhos;
    this.iris.add(brilhos);

    // ---- brilho em forma de estrela, em cima da íris
    this.reflexo = new THREE.Group();
    this.reflexo.position.set(-OLHO.raioIris * 0.43, OLHO.raioIris * 0.42, 0.1);
    this.reflexo.renderOrder = 13;
    this.reflexoNucleo = sprite(tex.brilho, '#fff2fd', 1.25, 1);
    this.reflexoFlare = sprite(tex.flare, '#f0d9ff', 4.4, 0.45);
    this.reflexoHalo = sprite(tex.brilho, '#d8b4fe', 2.6, 0.25);
    for (const s of [this.reflexoHalo, this.reflexoFlare, this.reflexoNucleo]) {
      s.renderOrder = 13;
      s.material.depthTest = false;
      this.reflexo.add(s);
    }
    this.iris.add(this.reflexo);
    this.reflexo2 = sprite(tex.brilho, '#ffe4fb', 0.42, 0.7);
    this.reflexo2.position.set(-OLHO.raioIris * 0.25, OLHO.raioIris * 0.62, 0.1);
    this.reflexo2.renderOrder = 13;
    this.reflexo2.material.depthTest = false;
    this.iris.add(this.reflexo2);
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
    this.brilhos.material.uniforms.uCentro.value.set(this.iris.position.x, this.iris.position.y);
    this.brilhos.material.uniforms.uEscalaIris.value.set(this.iris.scale.x, this.iris.scale.y);
    // piscar: a amêndoa fecha (mais a pálpebra de cima, então fecha um pouco abaixo do meio)
    const meiaAltura = Math.max(0.06, OLHO.meiaAltura * abertura);
    const k = (OLHO.meiaLargura * OLHO.meiaLargura) / meiaAltura;
    this.L.set((k + meiaAltura) / 2, (k - meiaAltura) / 2);
    this.uComuns.uDesloc.value = -(1 - abertura) * OLHO.meiaAltura * 0.3;
    this.fundo.material.uniforms.uMeiaAltura.value = meiaAltura;
    const visivel = THREE.MathUtils.smoothstep(abertura, 0.35, 0.75); // o brilho some ao fechar
    const cintila = (0.85 + 0.15 * Math.sin(t * 2.7) + 0.06 * Math.sin(t * 7.1)) * visivel;
    this.reflexoNucleo.material.opacity = cintila;
    this.reflexoHalo.material.opacity = 0.25 * visivel;
    this.reflexo2.material.opacity = 0.7 * visivel;
    this.reflexoFlare.material.opacity = 0.45 * cintila;
    this.reflexoFlare.material.rotation = t * 0.15;
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
const olho = new Olho(cena, tex);
// (o brilho difuso só pega o que é bem claro: senão a íris inteira vira uma mancha)
const { composer, bloom } = criarPosProcesso(renderer, cena, camera, { bloom: [0.6, 0.28, 0.6] });

// O brilho difuso espalha a luz do anel para dentro da pupila; depois dele, o miolo da pupila
// volta a ficar preto (um buraco negro de verdade, só com o anel de luz em volta)
const pupilaPreta = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uCentro: { value: new THREE.Vector2(0.5, 0.5) },
    uRaio: { value: 0.05 },
    uAspecto: { value: 1 },
    uEscala: { value: new THREE.Vector2(1, 1) },
    uForca: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uCentro; uniform float uRaio; uniform float uAspecto;
    uniform vec2 uEscala; uniform float uForca; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float r = length((vUv - uCentro) * vec2(uAspecto, 1.0) / uEscala);
      c.rgb *= mix(1.0, smoothstep(uRaio * 0.8, uRaio * 0.97, r), uForca);
      gl_FragColor = c;
    }`,
});
composer.insertPass(pupilaPreta, 3); // logo depois do brilho difuso
const _pupila = new THREE.Vector3();
function atualizarPupila() {
  olho.iris.getWorldPosition(_pupila);
  const dist = camera.position.distanceTo(_pupila);
  _pupila.project(camera);
  pupilaPreta.uniforms.uCentro.value.set(_pupila.x * 0.5 + 0.5, _pupila.y * 0.5 + 0.5);
  pupilaPreta.uniforms.uRaio.value = OLHO.raioPupila / (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  pupilaPreta.uniforms.uAspecto.value = camera.aspect;
  pupilaPreta.uniforms.uEscala.value.set(olho.iris.scale.x, olho.iris.scale.y);
  // (fechando o olho, a pupila some atrás da pálpebra: a máscara também)
  pupilaPreta.uniforms.uForca.value = THREE.MathUtils.smoothstep(estado.abertura, 0.45, 0.8);
}

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
  atualizarPupila();
  composer.render();
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// para testes: window.olho mostra o estado atual
window.olho = estado;
