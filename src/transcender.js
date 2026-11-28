/*
 * A transcendência: uma cena no estilo do Big Bang, com os olhos (~18 s).
 *
 * Como no Big Bang, a câmera voa (aproxima, recua, gira um pouco em volta e por fim entra na
 * pupila) e os atos se sobrepõem: cada coisa começa antes da anterior terminar.
 *
 *   0 –  2,6 s  escolher     os outros olhos olham para um deles; ele falha, desliza para o meio
 *                            e cresce, enquanto os outros recuam para o fundo e somem; a câmera
 *                            se aproxima devagar e o céu escurece
 *   2,4 –  6,2  transcender  ele treme cada vez mais, olha para todo lado cada vez mais rápido,
 *                            falha em azul e vermelho; energia cai girando para dentro dele
 *   6,2 –  7,5  fechar       fecha devagar; o tremor morre aos poucos e a energia é sugada por ele
 *   7,5 –  8,0  silêncio
 *   7,9 – 10,4  luz          uma luz cresce pela fresta (feixe e raios); a câmera chega mais perto
 *  10,4 – 11,5  abrir        abre (passando um pouco) com clarão, onda de choque e faíscas; a
 *                            câmera recua com o susto. Transformado: a íris é uma estrela de 8
 *                            pontas muito luminosa (a estrela do Big Bang no meio), a pupila é uma
 *                            estrela de 4 pontas e raios compridos saem do olho
 *  11,5 – 14,6  estrela      a câmera gira um pouco em volta; pela pupila oca se vê outro espaço
 *  14,6 – 17,0  entrar       a câmera se aproxima da pupila, freando: a estrela de 4 pontas cresce
 *                            por igual até tomar a tela
 *  17,0 – 19,6  atravessar   já do outro lado, a câmera voa pelo espaço vazio (acelera passando
 *                            pelas estrelas e depois freia)
 *  depois       vazio        espaço vazio com estrelas, a câmera ainda deslizando bem devagar;
 *                            dispara o evento `olho:fim`
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Estrela } from './estrela.js';
import { sprite, materialPontos, geometria, pontos } from './materiais.js';
import { criarRng, lerp, clamp, easeInOutCubic, easeOutCubic, tremor } from './utils.js';

export const TRANSCENDER = {
  inicioAutomatico: 15, // segundos depois de abrir a página (null = só com olho.transcender())
  tamanho: { deitada: 0.5, emPe: 0.86 }, // largura do olho escolhido (fração da largura da tela)
  // olho transformado: raios compridos saindo dele (ângulo em graus, 0 = direita; comprimento em
  // larguras do olho), como no desenho
  lancas: [
    [150, 2.3],
    [178, 1.7],
    [220, 1.1],
    [22, 2.5],
    [340, 2.0],
    [305, 1.4],
  ],
};

// quando cada coisa acontece (segundos desde o começo da cena)
const T = {
  ir: [0.35, 2.6],
  crescendo: [2.6, 6.2],
  fechar: [6.3, 7.4],
  luz: [8.0, 10.4],
  abrir: [10.4, 11.4],
  estrela: [11.5, 14.6],
  mergulho: [14.6, 17.0],
  atravessar: [17.0, 19.6],
  total: 19.6,
};

// curvas suaves
const suave = (x) => {
  x = clamp(x);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const entre = (a, b, s) => suave((s - a) / (b - a));
const janela = (s, a, b, c, d) => entre(a, b, s) * (1 - entre(c, d, s));
const passaUmPouco = (x) => {
  // vai até 1 passando um pouco do ponto (como uma pálpebra que abre com força)
  x = clamp(x);
  const c1 = 1.5;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
const rand = (a, b) => a + Math.random() * (b - a);

/** Partículas de energia que caem girando para dentro do olho escolhido. */
class Energia {
  constructor(cena) {
    const rnd = criarRng(404);
    const n = 1800;
    const aAng = new Float32Array(n);
    const aR = new Float32Array(n);
    const aVel = new Float32Array(n);
    const aFase = new Float32Array(n);
    const aCor = new Float32Array(n * 3);
    const aTam = new Float32Array(n);
    const cores = ['#c4b5fd', '#a78bfa', '#e9d5ff', '#f0abfc', '#818cf8', '#ffffff'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      aAng[i] = rnd() * Math.PI * 2;
      aR[i] = 0.7 + rnd() * 1.3; // (em larguras do olho)
      aVel[i] = 0.3 + rnd() * 0.5;
      aFase[i] = rnd();
      const c = cores[Math.floor(rnd() * cores.length)];
      const b = 0.9 + rnd() * 1.0;
      aCor.set([c.r * b, c.g * b, c.b * b], i * 3);
      aTam[i] = 0.25 + Math.pow(rnd(), 3) * 0.7;
    }
    this.u = { uT: { value: 0 }, uOpac: { value: 0 }, uColapso: { value: 0 }, uCentro: { value: new THREE.Vector2() }, uRaio: { value: 30 } };
    this.pontos = pontos(
      geometria({ aAng: [aAng, 1], aR: [aR, 1], aVel: [aVel, 1], aFase: [aFase, 1], aCor: [aCor, 3], aTam: [aTam, 1] }, n),
      materialPontos({
        uniforms: this.u,
        cabecalho: /* glsl */ `
          attribute float aAng; attribute float aR; attribute float aVel; attribute float aFase; attribute vec3 aCor; attribute float aTam;
          uniform float uT; uniform float uOpac; uniform float uColapso; uniform vec2 uCentro; uniform float uRaio;
        `,
        corpo: /* glsl */ `
          // cada partícula nasce longe e cai em espiral até o meio do olho; quando ele fecha,
          // todas são sugadas para dentro
          float tau = fract(uT * aVel + aFase);
          float r = aR * uRaio * pow(1.0 - tau, 1.7) * (1.0 - 0.92 * uColapso);
          float ang = aAng + tau * (2.4 + 2.0 * tau) + uColapso * 4.0;
          pos = vec3(uCentro.x + cos(ang) * r, uCentro.y + sin(ang) * r * 0.75, 0.2);
          cor = aCor;
          tam = aTam * (0.6 + 0.8 * (1.0 - tau)) * (1.0 - 0.5 * uColapso);
          alfa = uOpac * smoothstep(0.0, 0.15, tau) * (1.0 - smoothstep(0.82, 1.0, tau));
        `,
      })
    );
    this.pontos.renderOrder = 9;
    cena.add(this.pontos);
  }

  atualizar(t, opac, colapso, centro, raio) {
    this.u.uT.value = t;
    this.u.uOpac.value = opac;
    this.u.uColapso.value = colapso;
    this.u.uCentro.value.copy(centro);
    this.u.uRaio.value = raio;
    this.pontos.visible = opac > 0.001;
  }
}

/** Poeira em várias distâncias: quando a câmera se mexe, ela passa por perto (dá profundidade). */
class Poeira {
  constructor(cena) {
    const rnd = criarRng(515);
    const n = 2200;
    const pos = new Float32Array(n * 3);
    const aCor = new Float32Array(n * 3);
    const aTam = new Float32Array(n);
    const aSem = new Float32Array(n);
    const cores = ['#e9d5ff', '#c4b5fd', '#a78bfa', '#f5d0fe', '#ffffff'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      pos.set([(rnd() - 0.5) * 260, (rnd() - 0.5) * 160, -160 + rnd() * 208], i * 3);
      const c = cores[Math.floor(rnd() * cores.length)];
      const b = 0.5 + rnd() * 0.7;
      aCor.set([c.r * b, c.g * b, c.b * b], i * 3);
      aTam[i] = 0.08 + Math.pow(rnd(), 3) * 0.3;
      aSem[i] = rnd();
    }
    this.u = { uT: { value: 0 }, uOpac: { value: 0 } };
    this.pontos = pontos(
      geometria({ position: [pos, 3], aCor: [aCor, 3], aTam: [aTam, 1], aSem: [aSem, 1] }, n),
      materialPontos({
        uniforms: this.u,
        cabecalho: 'attribute vec3 aCor; attribute float aTam; attribute float aSem; uniform float uT; uniform float uOpac;',
        corpo: /* glsl */ `
          pos = position + vec3(sin(uT * 0.13 + aSem * 6.3), cos(uT * 0.11 + aSem * 4.1), 0.0) * 0.8;
          cor = aCor;
          tam = aTam;
          alfa = uOpac * (0.45 + 0.35 * sin(uT * (0.6 + aSem) + aSem * 50.0));
        `,
      })
    );
    this.pontos.renderOrder = 8;
    cena.add(this.pontos);
  }

  atualizar(t, opac) {
    this.u.uT.value = t;
    this.u.uOpac.value = opac;
    this.pontos.visible = opac > 0.001;
  }
}

/** Faíscas que saem do olho quando ele abre transformado. */
class Faiscas {
  constructor(cena) {
    const rnd = criarRng(626);
    const n = 700;
    const aDir = new Float32Array(n);
    const aVel = new Float32Array(n);
    const aCor = new Float32Array(n * 3);
    const aTam = new Float32Array(n);
    const aSem = new Float32Array(n);
    const cores = ['#ffffff', '#f5ecff', '#e9d5ff', '#c4b5fd', '#f0abfc'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      aDir[i] = rnd() * Math.PI * 2;
      aVel[i] = 0.4 + Math.pow(rnd(), 1.5) * 2.2; // (em larguras do olho)
      const c = cores[Math.floor(rnd() * cores.length)];
      const b = 1.0 + rnd() * 1.2;
      aCor.set([c.r * b, c.g * b, c.b * b], i * 3);
      aTam[i] = 0.18 + Math.pow(rnd(), 3) * 0.6;
      aSem[i] = rnd();
    }
    this.u = { uT: { value: 0 }, uIdade: { value: 0 }, uOpac: { value: 0 }, uCentro: { value: new THREE.Vector2() }, uLargura: { value: 30 } };
    this.pontos = pontos(
      geometria({ aDir: [aDir, 1], aVel: [aVel, 1], aCor: [aCor, 3], aTam: [aTam, 1], aSem: [aSem, 1] }, n),
      materialPontos({
        uniforms: this.u,
        cabecalho: /* glsl */ `
          attribute float aDir; attribute float aVel; attribute vec3 aCor; attribute float aTam; attribute float aSem;
          uniform float uT; uniform float uIdade; uniform float uOpac; uniform vec2 uCentro; uniform float uLargura;
        `,
        corpo: /* glsl */ `
          // saem com força e vão freando
          float d = aVel * (1.0 - exp(-2.6 * uIdade)) / 2.6;
          vec2 dir = vec2(cos(aDir), sin(aDir) * 0.8);
          pos = vec3(uCentro + dir * d * uLargura, 0.3 + aSem * 0.4);
          cor = aCor;
          tam = aTam * (1.0 - 0.6 * clamp(uIdade / 2.0, 0.0, 1.0));
          alfa = uOpac * exp(-uIdade * (1.1 + aSem)) * (0.7 + 0.3 * sin(uT * 20.0 + aSem * 40.0));
        `,
      })
    );
    this.pontos.renderOrder = 17;
    cena.add(this.pontos);
  }

  atualizar(t, idade, centro, largura) {
    const visivel = idade >= 0 && idade < 3;
    this.pontos.visible = visivel;
    if (!visivel) return;
    this.u.uT.value = t;
    this.u.uIdade.value = idade;
    this.u.uOpac.value = 1;
    this.u.uCentro.value.copy(centro);
    this.u.uLargura.value = largura;
  }
}

/** O espaço vazio (outra cena): estrelas em várias distâncias, do outro lado da pupila. */
class EspacoVazio {
  constructor(tex) {
    this.cena = new THREE.Scene();
    // uma nebulosa bem fraca e distante (o vazio não fica totalmente preto)
    [
      ['#3b0764', [-500, 160, -1500], 1500, 0.22],
      ['#1e1b4b', [600, -220, -1700], 1700, 0.25],
      ['#4c1d95', [100, 380, -1900], 1300, 0.14],
    ].forEach(([cor, p, tam, op], i) => {
      const b = sprite(tex.nuvens[i % tex.nuvens.length], cor, tam, op);
      b.position.set(...p);
      this.cena.add(b);
    });
    const rnd = criarRng(737);
    const n = 5200;
    const pos = new Float32Array(n * 3);
    const aCor = new Float32Array(n * 3);
    const aTam = new Float32Array(n);
    const aSem = new Float32Array(n);
    const cores = ['#ffffff', '#f3e8ff', '#e0e7ff', '#ddd6fe', '#c7d2fe', '#f5d0fe'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      const perto = i < 1000; // um pouco de poeira bem perto (para sentir o movimento)
      const z = perto ? -20 - rnd() * 240 : -60 - rnd() * 1300;
      const espalha = perto ? 140 : 160 + Math.abs(z) * 0.55;
      pos.set([(rnd() - 0.5) * 2 * espalha, (rnd() - 0.5) * 2 * espalha * 0.62, z], i * 3);
      const c = cores[Math.floor(rnd() * cores.length)];
      const b = (perto ? 0.6 : 0.9) + rnd() * 0.9;
      aCor.set([c.r * b, c.g * b, c.b * b], i * 3);
      aTam[i] = perto ? 0.08 + rnd() * 0.2 : (0.2 + Math.abs(z) * 0.0032) * (0.6 + Math.pow(rnd(), 3) * 1.8);
      aSem[i] = rnd();
    }
    this.u = { uT: { value: 0 } };
    this.cena.add(
      pontos(
        geometria({ position: [pos, 3], aCor: [aCor, 3], aTam: [aTam, 1], aSem: [aSem, 1] }, n),
        materialPontos({
          uniforms: this.u,
          cabecalho: 'attribute vec3 aCor; attribute float aTam; attribute float aSem; uniform float uT;',
          corpo: /* glsl */ `
            pos = position;
            cor = aCor;
            tam = aTam;
            alfa = 0.7 + 0.3 * sin(uT * (0.5 + aSem * 2.0) + aSem * 70.0);
          `,
        })
      )
    );
  }
}

// a pupila oca: depois do brilho difuso, dentro da pupila aparece o espaço vazio (a outra cena,
// vista pela mesma câmera: tem profundidade de verdade); no fim ele toma a tela inteira
const SHADER_PORTAL = {
  uniforms: {
    tDiffuse: { value: null },
    tVazio: { value: null },
    uCentro: { value: new THREE.Vector2(0.5, 0.5) },
    uMeio: { value: new THREE.Vector2(0.01, 0.05) }, // fenda: meia largura e meia altura (alturas de tela)
    uEstrelaR: { value: 0.05 }, // estrela de 4 pontas: raio (alturas de tela)
    uForma: { value: 0 }, // 0 = fenda, 1 = estrela de 4 pontas
    uAspecto: { value: 1 },
    uForca: { value: 0 },
    uTudo: { value: 0 },
    uPx: { value: 0.002 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tVazio;
    uniform vec2 uCentro; uniform vec2 uMeio; uniform float uEstrelaR; uniform float uForma;
    uniform float uAspecto; uniform float uForca; uniform float uTudo; uniform float uPx;
    varying vec2 vUv;
    float sdFenda(vec2 p, vec2 m) {
      float k = m.y * m.y / m.x;
      float R = (k + m.x) * 0.5;
      float d = (k - m.x) * 0.5;
      vec2 q = abs(p);
      float b = sqrt(max(R * R - d * d, 0.0));
      return ((q.y - b) * d > q.x * b) ? length(q - vec2(0.0, b)) : length(q - vec2(-d, 0.0)) - R;
    }
    float sdEstrela4(vec2 p, float r, float m) {
      float an = 3.141593 / 4.0;
      float en = 3.141593 / m;
      vec2 acs = vec2(cos(an), sin(an));
      vec2 ecs = vec2(cos(en), sin(en));
      float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
      p = length(p) * vec2(cos(bn), abs(sin(bn)));
      p -= r * acs;
      p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
      return length(p) * sign(p.x);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uForca <= 0.0) { gl_FragColor = c; return; }
      vec2 p = (vUv - uCentro) * vec2(uAspecto, 1.0);
      float sd = mix(sdFenda(p, uMeio), sdEstrela4(p, uEstrelaR, 3.0), uForma);
      float dentro = max(1.0 - smoothstep(-uPx, uPx, sd), uTudo) * uForca;
      vec3 vazio = vec3(0.003, 0.0, 0.01) + texture2D(tVazio, vUv).rgb;
      c.rgb = mix(c.rgb, vazio, dentro);
      gl_FragColor = c;
    }
  `,
};

const VERT_UV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const GLSL_ESTRELA = /* glsl */ `
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
`;
function materialLuz(uniforms, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT_UV,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}
function spriteLuz(tex, cor, ordem) {
  const s = sprite(tex, cor, 1, 0);
  s.renderOrder = ordem;
  s.material.depthTest = false;
  return s;
}

export class Transcendencia {
  /**
   * @param olhos      a lista de olhos da página ({ olho, centro, escala, inclinacao, x, y, ... })
   * @param medidas    as medidas do olho (OLHO)
   * @param aoTerminar chamada uma vez, quando a cena chega ao espaço vazio
   */
  constructor({ renderer, cena, camera, tex, composer, olhos, ceu, medidas, elementos, aoTerminar }) {
    Object.assign(this, { renderer, cena, camera, olhos, ceu, medidas, elementos, aoTerminar });
    this.ativa = false;
    this.terminou = false;
    this.dentro = false; // a câmera já entrou no espaço vazio
    this.congelar = null; // (para testes: segura a cena neste segundo)
    this.energia = new Energia(cena);
    this.poeira = new Poeira(cena);
    this.faiscas = new Faiscas(cena);
    this.vazio3d = new EspacoVazio(tex);
    this.alvoVazio = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });

    // a estrela do Big Bang, no meio da íris transformada (desenhada depois dos olhos)
    this.estrela = new Estrela(cena, tex);
    this.estrela.atualizar(0, (t, out) => out.set(0, 0, 0), { visivel: false });
    const porCima = (obj) => obj.traverse((o) => (o.renderOrder = 15));
    porCima(this.estrela.grupo);
    this.estrela.rastro.malha.renderOrder = 15;
    for (const m of this.estrela.malabares) {
      porCima(m.grupo);
      m.rastro.malha.renderOrder = 15;
    }

    // luz pela fresta: feixe largo, risco fino e um brilho
    this.feixe = spriteLuz(tex.brilho, '#f5ecff', 14);
    this.feixeFino = spriteLuz(tex.brilho, '#ffffff', 14);
    this.brilhoFresta = spriteLuz(tex.brilho, '#c084fc', 14);
    // onda de choque e o núcleo forte da estrela-íris
    this.onda = spriteLuz(tex.anel, '#efe4ff', 17);
    this.onda2 = spriteLuz(tex.anel, '#a78bfa', 17);
    this.nucleoForte = spriteLuz(tex.brilho, '#ffffff', 15);
    this.auraForte = spriteLuz(tex.brilho, '#d8b4fe', 15);
    cena.add(this.feixe, this.feixeFino, this.brilhoFresta, this.onda, this.onda2, this.auraForte, this.nucleoForte);

    // raios de luz escapando por cima e por baixo da fresta
    this.uRaios = { uT: { value: 0 }, uForca: { value: 0 } };
    this.raios = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      materialLuz(
        this.uRaios,
        /* glsl */ `
          uniform float uT; uniform float uForca; varying vec2 vUv;
          float acaso(float n) { return fract(sin(n) * 43758.5453); }
          float ruido(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(acaso(i), acaso(i + 1.0), f); }
          void main() {
            vec2 p = (vUv - 0.5) * vec2(2.4, 1.6); // em larguras do olho
            float ang = atan(p.y, p.x * 0.42);
            float raios = pow(ruido(ang * 9.0 + uT * 0.5), 4.0) * 0.9 + pow(ruido(ang * 23.0 - uT * 0.8 + 3.0), 6.0) * 0.7;
            float r = length(p * vec2(0.42, 1.0));
            float queda = exp(-r * 3.4) * smoothstep(0.0, 0.025, abs(p.y));
            float borda = 1.0 - smoothstep(0.38, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
            gl_FragColor = vec4(vec3(0.88, 0.8, 1.0) * raios * queda * borda * uForca * 1.6, 1.0);
          }
        `
      )
    );
    this.raios.renderOrder = 13;
    this.raios.visible = false;
    cena.add(this.raios);

    // a íris transformada: estrela de 8 pontas bem luminosa (algumas pontas passam das pálpebras)
    this.uIrisEstrela = { uT: { value: 0 }, uForca: { value: 0 }, uGiro: { value: 0 }, uR: { value: 0.4 } };
    this.irisEstrela = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      materialLuz(
        this.uIrisEstrela,
        /* glsl */ `
          uniform float uT; uniform float uForca; uniform float uGiro; uniform float uR; varying vec2 vUv;
          ${GLSL_ESTRELA}
          void main() {
            vec2 p = vUv - 0.5;
            float c = cos(uGiro);
            float s = sin(uGiro);
            p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
            float sd = sdEstrela(p, uR, 8.0, 4.6) / uR;
            float r = length(p) / uR;
            float dentro = 1.0 - smoothstep(-0.006, 0.006, sd);
            vec3 cor = mix(vec3(1.0, 0.97, 1.0) * 1.6, vec3(0.78, 0.55, 1.0) * 0.75, smoothstep(0.0, 0.45, r));
            cor = mix(cor, vec3(0.48, 0.22, 0.92) * 0.5, smoothstep(0.45, 1.0, r));
            float vivo = 0.85 + 0.15 * sin(uT * 3.0 - r * 10.0);
            float borda = exp(-pow(sd / 0.012, 2.0)) * 1.3 + exp(-max(sd, 0.0) / 0.08) * 0.16;
            float fade = 1.0 - smoothstep(0.44, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
            gl_FragColor = vec4((cor * dentro * vivo + vec3(0.92, 0.84, 1.0) * borda) * fade * uForca, 1.0);
          }
        `
      )
    );
    this.irisEstrela.renderOrder = 16;
    this.irisEstrela.visible = false;
    cena.add(this.irisEstrela);

    // raios compridos e finos saindo do olho transformado
    const lancas = TRANSCENDER.lancas.map(([graus, comp]) => [THREE.MathUtils.degToRad(graus), comp]);
    this.uLancas = { uT: { value: 0 }, uCresce: { value: 0 }, uForca: { value: 0 } };
    this.lancas = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      materialLuz(
        this.uLancas,
        /* glsl */ `
          uniform float uT; uniform float uCresce; uniform float uForca; varying vec2 vUv;
          void main() {
            vec2 p = (vUv - 0.5) * 6.0; // em larguras do olho
            float luz = 0.0;
            ${lancas
              .map(
                ([a, comp], k) => `
            {
              vec2 d = vec2(${Math.cos(a).toFixed(5)}, ${Math.sin(a).toFixed(5)});
              float t = dot(p, d);
              float lado = abs(p.x * d.y - p.y * d.x);
              float ate = ${comp.toFixed(3)} * uCresce;
              float trecho = smoothstep(0.42, 0.5, t) * (1.0 - smoothstep(ate * 0.55, ate, t));
              float brilha = 0.8 + 0.2 * sin(uT * ${(2 + k * 0.7).toFixed(2)} + ${k}.0);
              luz += (exp(-pow(lado / 0.006, 2.0)) + 0.18 * exp(-pow(lado / 0.03, 2.0))) * trecho * brilha;
            }`
              )
              .join('')}
            float borda = 1.0 - smoothstep(0.45, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
            gl_FragColor = vec4(vec3(0.9, 0.84, 1.0) * luz * borda * uForca, 1.0);
          }
        `
      )
    );
    this.lancas.renderOrder = 13;
    this.lancas.visible = false;
    cena.add(this.lancas);

    this.portal = new ShaderPass(SHADER_PORTAL);
    composer.insertPass(this.portal, 3); // logo depois do brilho difuso
    this._v = new THREE.Vector2();
    this._v3 = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._tremor = new THREE.Vector3();
    this.glitch = { ini: -1, dura: 0, forca: 0 };
    this.redimensionar();
  }

  get duracao() {
    return T.total;
  }

  redimensionar() {
    const tam = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.alvoVazio.setSize(Math.max(2, tam.x), Math.max(2, tam.y));
  }

  iniciar(t, indice) {
    if (this.ativa || this.terminou) return;
    this.ativa = true;
    this.t0 = t;
    this.i = indice;
    this.origem = this.olhos.map((o) => ({ centro: o.centro.clone(), escala: o.escala, inclinacao: o.inclinacao }));
    this.proximaOlhada = 0;
    this.alvo = new THREE.Vector2();
    this.fovBase = this.camera.fov;
    this.veuBase = this.olhos[indice].olho.fundo.material.uniforms.uVeu.value;
  }

  /** Mola sem balanço do olhar de um olho até (ax, ay). */
  _mola(o, ax, ay, k, dt) {
    const c = 2 * Math.sqrt(k);
    const h = dt / 4;
    for (let i = 0; i < 4; i++) {
      o.vx += (k * (ax - o.x) - c * o.vx) * h;
      o.vy += (k * (ay - o.y) - c * o.vy) * h;
      o.x += o.vx * h;
      o.y += o.vy * h;
    }
  }

  /** Força da falha do olho escolhido (aos trancos). */
  _glitch(t, chance, dt) {
    if (Math.random() < chance * dt) this.glitch = { ini: t, dura: rand(0.05, 0.16), forca: rand(0.45, 0.9) };
    const g = this.glitch;
    if (g.ini < 0 || t - g.ini > g.dura) return 0;
    return Math.random() < 0.25 ? 0.15 : g.forca * rand(0.6, 1);
  }

  /** Onde a câmera está (distância até o plano dos olhos) no segundo s da cena. */
  _distancia(s) {
    if (s < T.mergulho[0]) {
      return (
        60 -
        6 * entre(0.2, 2.8, s) - // aproxima devagar enquanto o olho é escolhido
        4 * entre(2.6, 6.2, s) - // e um pouco mais enquanto ele transcende
        1 * entre(6.2, 7.6, s) -
        7 * entre(8.0, 10.4, s) + // chega perto enquanto a luz cresce (antecipação)...
        5 * entre(10.4, 11.3, s) - // ...e recua com o susto quando ele abre
        2 * entre(11.6, 14.6, s)
      );
    }
    if (s < T.mergulho[1]) {
      // aproxima da pupila freando (em escala: a estrela de 4 pontas cresce por igual)
      const u = (s - T.mergulho[0]) / (T.mergulho[1] - T.mergulho[0]);
      return 45 * Math.exp(Math.log(1.4 / 45) * u * u * (3 - 2 * u));
    }
    // do outro lado: voa pelo espaço vazio (acelera e freia) e depois continua bem devagar
    const v = clamp((s - T.atravessar[0]) / (T.atravessar[1] - T.atravessar[0]));
    return 1.4 - 150 * suave(v) - 1.2 * Math.max(0, s - T.atravessar[1]);
  }

  _camera(s, t, cx, cy) {
    const z = this._distancia(s);
    const v = clamp((s - T.atravessar[0]) / (T.atravessar[1] - T.atravessar[0]));
    // um pouco de giro em volta do olho (mais quando ele está transformado); some no mergulho
    const giro = 1 - entre(T.mergulho[0], T.mergulho[0] + 0.9, s);
    const transformado = janela(s, 11.0, 12.2, 14.0, 15.0);
    const yaw = (0.03 * Math.sin(s * 0.4) + 0.07 * transformado * Math.sin((s - 11) * 0.7)) * giro;
    const pitch = (0.02 * Math.sin(s * 0.31 + 1) + 0.045 * transformado * Math.cos((s - 11) * 0.55)) * giro;
    const d = Math.max(z, 1);
    // a tela treme junto (crescendo e luz)
    const forca = 0.32 * entre(2.6, 6.0, s) ** 2 * (1 - entre(6.2, 6.9, s)) + 0.1 * entre(9.4, 10.4, s) * (1 - entre(10.4, 10.9, s));
    tremor(t + 7.3, forca, this._a, 15);
    this.camera.position.set(Math.sin(yaw) * d + this._a.x, Math.sin(pitch) * d + this._a.y, z);
    // olha para o olho escolhido; no mergulho, olha para a frente
    this._b.set(cx - this.camera.position.x, cy - this.camera.position.y, -Math.max(z, 1));
    this._b.normalize().lerp(this._a.set(0, 0, -1), entre(T.mergulho[0] + 0.4, T.mergulho[0] + 1.2, s)).normalize();
    this.camera.lookAt(this._b.multiplyScalar(60).add(this.camera.position));
    // voando pelo espaço vazio a lente abre (sensação de velocidade)
    this.camera.fov = this.fovBase + 14 * janela(v, 0.1, 0.45, 0.6, 1.0) + 3 * entre(0.6, 1, v);
    this.camera.updateProjectionMatrix();
    return z;
  }

  atualizar(t, dt) {
    const s = this.congelar ?? t - this.t0;
    const M = this.medidas;
    const emPe = this.camera.aspect < 0.9;
    // tamanho do olho escolhido: medido onde a câmera fica depois da escolha
    const meiaLargura54 = 54 * Math.tan(THREE.MathUtils.degToRad(this.fovBase / 2)) * this.camera.aspect;
    const grande = (TRANSCENDER.tamanho[emPe ? 'emPe' : 'deitada'] * 2 * meiaLargura54) / (2 * M.meiaLargura);
    const esc = this.olhos[this.i];
    const org = this.origem[this.i];
    const P = entre(...T.crescendo, s); // o quanto já transcendeu

    // ---- o escolhido desliza para o meio (num arco leve) e cresce
    const ir = suave((s - T.ir[0]) / (T.ir[1] - T.ir[0]));
    const arco = Math.sin(Math.PI * ir) * 0.08 * org.centro.length();
    const cx = lerp(org.centro.x, 0, ir);
    const cy = lerp(org.centro.y, 0, ir) + arco;
    const escala = org.escala * Math.pow(grande / org.escala, ir);
    const z = this._camera(s, t, cx, cy);

    // tremor do olho: cresce no crescendo, morre aos poucos enquanto fecha; volta fraco na luz
    const forcaTremor = 0.38 * entre(2.6, 6.0, s) ** 2 * (1 - entre(6.2, 7.0, s)) + 0.12 * entre(9.2, 10.4, s) * (1 - entre(10.4, 10.7, s));
    tremor(t, forcaTremor * grande * 0.5, this._tremor, 10 + 10 * P);
    const pulso = 1 + 0.035 * P * (1 - entre(6.2, 6.8, s)) * Math.sin(t * (4 + 5 * P));
    const balanco = 0.04 * forcaTremor * Math.sin(t * 9.3);
    esc.olho.posicionar(cx + this._tremor.x, cy + this._tremor.y, escala * pulso, lerp(org.inclinacao, 0, ir) + balanco);

    // ---- olhar do escolhido
    if (s < 2.4) this._mola(esc, 0, 0, 40, dt); // olha para a câmera
    else if (s < 6.2) {
      // olha para todo lado, cada vez mais rápido
      if (t >= this.proximaOlhada) {
        this.alvo.set(rand(-1, 1), rand(-0.9, 0.9));
        if (this.alvo.length() > 1) this.alvo.normalize();
        this.proximaOlhada = t + lerp(0.42, 0.11, P) * rand(0.8, 1.2);
      }
      this._mola(esc, this.alvo.x, this.alvo.y, lerp(200, 520, P), dt);
    } else this._mola(esc, 0, 0, 30, dt); // volta para o meio devagar

    // ---- abertura: fecha devagar, força um pouco na luz, abre passando um pouco
    let abertura = 1;
    if (s >= T.fechar[0] && s < T.abrir[0]) {
      abertura = 1 - 0.965 * easeInOutCubic(clamp((s - T.fechar[0]) / (T.fechar[1] - T.fechar[0])));
      abertura += 0.03 * entre(8.8, 10.4, s);
    } else if (s >= T.abrir[0]) {
      abertura = 0.065 + 0.935 * passaUmPouco((s - T.abrir[0]) / (T.abrir[1] - T.abrir[0]));
    }

    // ---- falha: um tranco na escolha; no crescendo, cada vez mais vezes
    let glitch = 0;
    if (s < 0.35) glitch = Math.random() < 0.25 ? 0.15 : rand(0.5, 0.9);
    else if (s >= T.crescendo[0] && s < T.crescendo[1]) glitch = this._glitch(t, 1 + 12 * P * P, dt);

    // ---- linhas, luz de dentro e o olho transformado
    const u = esc.olho.uComuns;
    const brilho = 1 + 0.9 * P - 0.7 * entre(6.2, 7.4, s) + 1.4 * entre(...T.luz, s) ** 2 - 1.0 * entre(10.4, 11.4, s);
    const luzDentro = 4.5 * Math.pow(entre(...T.luz, s), 1.6) * (1 - entre(10.4, 11.1, s));
    const virou = entre(10.5, 11.1, s);
    esc.olho.atualizar(t, esc.x, esc.y, abertura, glitch, 0);
    u.uBrilho.value = brilho;
    u.uLuzDentro.value = luzDentro;
    u.uIrisLinha.value = 1 - virou;
    u.uPupilaLinha.value = 1 + 1.6 * virou;
    esc.olho.uIris.uForma.value = entre(10.45, 11.2, s);
    esc.olho.fundo.material.uniforms.uVeu.value = lerp(this.veuBase, 0.9, virou);

    // ---- os outros: olham para o escolhido, recuam para o fundo e somem
    const recua = suave((s - 0.4) / 2.2);
    const somem = 1 - entre(0.5, 2.4, s);
    this.olhos.forEach((o, i) => {
      if (i === this.i) return;
      const og = this.origem[i];
      o.olho.posicionar(og.centro.x * (1 + 0.15 * recua), og.centro.y * (1 + 0.15 * recua), og.escala, og.inclinacao, -70 * recua);
      this._v.set(cx - og.centro.x, cy - og.centro.y).divideScalar(og.escala).rotateAround(new THREE.Vector2(), -og.inclinacao);
      const d = this._v.length() || 1;
      this._mola(o, this._v.x / d, this._v.y / d, 120, dt);
      o.olho.atualizar(t, o.x, o.y, 1, 0, 0);
      o.olho.uComuns.uOpac.value = somem;
      o.olho.grupo.visible = somem > 0.001;
    });

    // ---- céu, bordas, poeira e energia
    this.ceu.atualizar(t, this.camera, lerp(1, 0.18, entre(0.2, 2.6, s)));
    if (this.elementos.vinheta) this.elementos.vinheta.style.opacity = (0.8 + 0.2 * entre(0, 2.6, s)).toFixed(3);
    this.poeira.atualizar(t, entre(0, 2.5, s));
    const largura = M.meiaLargura * 2 * escala;
    this.energia.atualizar(t, entre(2.7, 3.8, s) * (1 - entre(6.7, 7.3, s)), entre(6.1, 7.2, s), this._v.set(cx, cy), largura);

    // ---- luz pela fresta (feixe, risco e raios), que some quando o olho abre
    const feixe = Math.pow(entre(...T.luz, s), 1.3) * (1 - entre(10.45, 11.0, s));
    const fLuz = entre(...T.luz, s);
    const yFresta = cy - M.meiaAltura * 0.3 * escala * (1 - abertura);
    this.feixe.position.set(cx, yFresta, 0.2);
    this.feixe.scale.set(largura * (0.8 + 1.6 * fLuz), escala * (0.9 + 1.2 * fLuz), 1);
    this.feixe.material.opacity = feixe;
    this.feixeFino.position.copy(this.feixe.position);
    this.feixeFino.scale.set(largura * (1.2 + 2.6 * fLuz), escala * 0.22, 1);
    this.feixeFino.material.opacity = feixe;
    this.brilhoFresta.position.copy(this.feixe.position);
    this.brilhoFresta.scale.setScalar(largura * 0.6 * (0.3 + fLuz));
    this.brilhoFresta.material.opacity = 0.45 * feixe;
    this.uRaios.uT.value = t;
    this.uRaios.uForca.value = entre(8.6, 10.4, s) ** 2 * (1 - entre(10.5, 11.3, s));
    this.raios.visible = this.uRaios.uForca.value > 0.001;
    this.raios.position.copy(this.feixe.position);
    this.raios.scale.set(largura * 2.4, largura * 1.6, 1);

    // ---- abrir: clarão, onda de choque e faíscas
    if (this.elementos.clarao) this.elementos.clarao.style.opacity = (0.3 * Math.exp(-(((s - 10.55) / 0.2) ** 2))).toFixed(3);
    const idade = s - 10.45;
    const onda = clamp(idade / 1.2);
    this.onda.visible = idade > 0 && idade < 1.3;
    this.onda.position.set(cx, cy, 0.25);
    this.onda.scale.setScalar(largura * (0.3 + 2.4 * easeOutCubic(onda)));
    this.onda.material.opacity = 0.75 * (1 - onda) ** 1.5;
    const onda2 = clamp((idade - 0.12) / 1.5);
    this.onda2.visible = idade > 0.12 && idade < 1.7;
    this.onda2.position.set(cx, cy, 0.24);
    this.onda2.scale.setScalar(largura * (0.4 + 3.4 * easeOutCubic(onda2)));
    this.onda2.material.opacity = 0.45 * (1 - onda2) ** 1.5;
    this.faiscas.atualizar(t, idade, this._v.set(cx, cy), largura);

    // ---- a estrela no lugar da íris
    const estrelaPos = esc.olho.iris.getWorldPosition(this._v3).clone();
    const apareceu = entre(10.4, 11.1, s);
    const pulsoEstrela = 1 + 0.05 * Math.sin(t * 5.1) + 0.03 * Math.sin(t * 13.7);
    const raioIris = M.raioIris * escala;
    const mostrar = apareceu > 0.001 && !this.dentro;
    this.estrela.atualizar(t, (tt, out) => out.copy(estrelaPos), {
      visivel: mostrar,
      brilho: 2.6 * apareceu * pulsoEstrela,
      escala: 1,
      tremor: 0,
      raioMalabares: () => escala * apareceu,
      luz: 0,
      rastro: 0,
      limite: 0,
      escalaVisual: escala * 0.85,
    });
    const cresce = clamp((s - 10.45) / 0.85);
    const raioEstrela = M.irisEstrela.raio * escala * (0.35 + 0.65 * passaUmPouco(cresce));
    this.irisEstrela.visible = mostrar;
    this.irisEstrela.position.copy(estrelaPos).setZ(0.18);
    this.irisEstrela.scale.setScalar(Math.max(0.001, raioEstrela * 2.5));
    this.uIrisEstrela.uT.value = t;
    this.uIrisEstrela.uGiro.value = 0.25 + t * 0.12;
    this.uIrisEstrela.uForca.value = apareceu * (0.92 + 0.08 * Math.sin(t * 4.3));
    this.nucleoForte.position.copy(estrelaPos).setZ(0.15);
    this.nucleoForte.scale.setScalar(raioIris * 1.5 * pulsoEstrela);
    this.nucleoForte.material.opacity = mostrar ? 0.85 * apareceu : 0;
    this.auraForte.position.copy(estrelaPos).setZ(0.12);
    this.auraForte.scale.setScalar(raioIris * 3.2);
    this.auraForte.material.opacity = mostrar ? 0.22 * apareceu : 0;
    this.lancas.visible = mostrar;
    this.lancas.position.set(cx, cy, 0.1);
    this.lancas.scale.setScalar(largura * 6);
    this.uLancas.uT.value = t;
    this.uLancas.uCresce.value = easeOutCubic(clamp((s - 10.5) / 0.9));
    this.uLancas.uForca.value = apareceu;

    // ---- portal: o espaço vazio aparece dentro da pupila (visto pela mesma câmera)
    const fenda = esc.olho.uIris.uFenda.value;
    const meiaLarguraFenda = fenda.x - fenda.y;
    const meiaAlturaFenda = Math.sqrt(Math.max(fenda.x * fenda.x - fenda.y * fenda.y, 0));
    const centroTela = this._a.copy(estrelaPos).project(this.camera);
    const porAltura = 1 / (2 * Math.max(z, 0.5) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const pt = this.portal.uniforms;
    pt.uCentro.value.set(centroTela.x * 0.5 + 0.5, centroTela.y * 0.5 + 0.5);
    pt.uMeio.value.set(meiaLarguraFenda * escala * porAltura * 0.93, meiaAlturaFenda * escala * porAltura * 0.97);
    pt.uEstrelaR.value = M.pupilaEstrela.raio * escala * porAltura * 0.93;
    pt.uForma.value = esc.olho.uIris.uForma.value;
    pt.uAspecto.value = this.camera.aspect;
    pt.uForca.value = entre(10.6, 11.2, s);
    pt.uPx.value = 1.5 / Math.max(1, innerHeight);
    // a estrela da pupila já cobre a tela inteira (ou a câmera passou do plano dos olhos)
    // (a estrela tem lados côncavos: só cobre os cantos da tela quando o raio passa de ~3 alturas)
    if (!this.dentro && (z < 1.5 || pt.uEstrelaR.value > 3.2)) this.dentro = true;
    pt.uTudo.value = this.dentro ? 1 : 0;
    if (pt.uForca.value > 0 || this.dentro) {
      pt.uForca.value = this.dentro ? 1 : pt.uForca.value;
      this.vazio3d.u.uT.value = t;
      const corFundo = this.renderer.getClearColor(new THREE.Color());
      this.renderer.setRenderTarget(this.alvoVazio);
      this.renderer.setClearColor('#000000');
      this.renderer.clear();
      this.renderer.render(this.vazio3d.cena, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(corFundo);
      pt.tVazio.value = this.alvoVazio.texture;
    }

    // dentro do espaço vazio, a cena dos olhos não aparece mais (para de ser desenhada)
    if (this.dentro) {
      for (const o of this.olhos) o.olho.grupo.visible = false;
      this.estrela.atualizar(t, (tt, out) => out.copy(estrelaPos), { visivel: false });
      for (const obj of [this.irisEstrela, this.lancas, this.raios, this.onda, this.onda2]) obj.visible = false;
      this.poeira.atualizar(t, 0);
      this.ceu.atualizar(t, this.camera, 0);
    }

    // ---- fim: chegou no espaço vazio (a câmera continua deslizando devagar)
    if (s >= T.total && !this.terminou) {
      this.terminou = true;
      if (this.aoTerminar) this.aoTerminar();
    }
  }
}
