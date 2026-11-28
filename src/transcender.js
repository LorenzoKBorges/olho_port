/*
 * A transcendência: uma cena no estilo do Big Bang, com os olhos.
 *
 *  1. escolher     um dos olhos falha, vai para o meio da tela e cresce; os outros olham para
 *                  ele e somem, o céu escurece
 *  2. transcender  ele treme cada vez mais, olha para todo lado muito rápido, falha em azul e
 *                  vermelho, e partículas de energia caem girando para dentro dele
 *  3. fechar       fecha o olho quase todo; silêncio
 *  4. luz          uma luz começa a sair pela fresta da pálpebra (a fresta acende, as pálpebras
 *                  brilham e um feixe de luz horizontal cresce)
 *  5. abrir        abre com um clarão, transformado: a íris virou uma estrela muito forte (a do
 *                  Big Bang: núcleo branco, halo roxo, raios em cruz e os três malabares), a
 *                  íris tem a forma de uma estrela de 8 pontas (algumas passam das pálpebras), a
 *                  pupila virou uma estrela de 4 pontas e raios compridos saem do olho
 *  6. estrela      a estrela brilha; a pupila (a estrela de 4 pontas) é oca: por ela se vê outro
 *                  espaço
 *  7. entrar       a câmera mergulha na pupila; a luz da estrela passa pelos lados e o oco
 *                  toma a tela inteira
 *  8. vazio        espaço vazio (escuro, com estrelas bem fracas) — dispara o evento `olho:fim`
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Estrela } from './estrela.js';
import { sprite, materialPontos, geometria, pontos } from './materiais.js';
import { criarRng, smoothstep, lerp, clamp, easeInOutCubic, easeInCubic, easeOutCubic, tremor } from './utils.js';

export const TRANSCENDER = {
  inicioAutomatico: 15, // segundos depois de abrir a página (null = só com olho.transcender())
  fases: { escolher: 2.0, transcender: 2.6, fechar: 0.5, luz: 2.2, abrir: 0.7, estrela: 2.4, entrar: 2.6 },
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
  tamanho: { deitada: 0.6, emPe: 0.92 }, // largura do olho escolhido, em fração da largura da tela
  mergulho: 90, // quanto o olho cresce quando a câmera entra na pupila
};

// início e fim (em segundos desde o começo da cena) de cada fase
const MARCOS = (() => {
  const m = {};
  let t = 0;
  for (const [nome, dura] of Object.entries(TRANSCENDER.fases)) {
    m[nome] = [t, t + dura];
    t += dura;
  }
  m.total = t;
  return m;
})();
const fase = (nome, s) => clamp((s - MARCOS[nome][0]) / (MARCOS[nome][1] - MARCOS[nome][0]));
const rand = (a, b) => a + Math.random() * (b - a);

/** Partículas de energia que caem girando para dentro do olho escolhido. */
class Energia {
  constructor(cena) {
    const rand = criarRng(404);
    const n = 1800;
    const aAng = new Float32Array(n);
    const aR = new Float32Array(n);
    const aVel = new Float32Array(n);
    const aFase = new Float32Array(n);
    const aCor = new Float32Array(n * 3);
    const aTam = new Float32Array(n);
    const cores = ['#c4b5fd', '#a78bfa', '#e9d5ff', '#f0abfc', '#818cf8', '#ffffff'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      aAng[i] = rand() * Math.PI * 2;
      aR[i] = 0.7 + rand() * 1.3; // (em larguras do olho)
      aVel[i] = 0.35 + rand() * 0.6;
      aFase[i] = rand();
      const c = cores[Math.floor(rand() * cores.length)];
      const b = 0.9 + rand() * 1.0;
      aCor.set([c.r * b, c.g * b, c.b * b], i * 3);
      aTam[i] = 0.25 + Math.pow(rand(), 3) * 0.7;
    }
    this.u = { uT: { value: 0 }, uOpac: { value: 0 }, uCentro: { value: new THREE.Vector2() }, uRaio: { value: 30 } };
    this.pontos = pontos(
      geometria({ aAng: [aAng, 1], aR: [aR, 1], aVel: [aVel, 1], aFase: [aFase, 1], aCor: [aCor, 3], aTam: [aTam, 1] }, n),
      materialPontos({
        uniforms: this.u,
        cabecalho: /* glsl */ `
          attribute float aAng; attribute float aR; attribute float aVel; attribute float aFase; attribute vec3 aCor; attribute float aTam;
          uniform float uT; uniform float uOpac; uniform vec2 uCentro; uniform float uRaio;
        `,
        corpo: /* glsl */ `
          // cada partícula nasce longe e cai em espiral até o meio do olho, e de novo
          float tau = fract(uT * aVel + aFase);
          float r = aR * uRaio * pow(1.0 - tau, 1.7);
          float ang = aAng + tau * (2.4 + 2.0 * tau);
          pos = vec3(uCentro.x + cos(ang) * r, uCentro.y + sin(ang) * r * 0.75, 0.2);
          cor = aCor;
          tam = aTam * (0.6 + 0.8 * (1.0 - tau));
          alfa = uOpac * smoothstep(0.0, 0.15, tau) * (1.0 - smoothstep(0.82, 1.0, tau));
        `,
      })
    );
    this.pontos.renderOrder = 9;
    cena.add(this.pontos);
  }

  atualizar(t, opac, centro, raio) {
    this.u.uT.value = t;
    this.u.uOpac.value = opac;
    this.u.uCentro.value.copy(centro);
    this.u.uRaio.value = raio;
    this.pontos.visible = opac > 0.001;
  }
}

// a pupila oca: depois do brilho difuso, o miolo da fenda mostra "outro espaço" (escuro, com
// estrelas fracas); no fim da cena esse espaço toma a tela inteira
const SHADER_VAZIO = {
  uniforms: {
    tDiffuse: { value: null },
    uCentro: { value: new THREE.Vector2(0.5, 0.5) },
    uMeio: { value: new THREE.Vector2(0.01, 0.05) }, // meia largura e meia altura da fenda (em alturas de tela)
    uAspecto: { value: 1 },
    uForca: { value: 0 },
    uTudo: { value: 0 },
    uPx: { value: 0.002 },
    uT: { value: 0 },
    uForma: { value: 0 }, // 0 = fenda, 1 = estrela de 4 pontas
    uEstrelaR: { value: 0.05 }, // raio da estrela (em alturas de tela)
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uCentro; uniform vec2 uMeio; uniform float uAspecto;
    uniform float uForca; uniform float uTudo; uniform float uPx; uniform float uT;
    uniform float uForma; uniform float uEstrelaR;
    varying vec2 vUv;
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
    // amêndoa em pé (a fenda): meia largura m.x, meia altura m.y
    float sdFenda(vec2 p, vec2 m) {
      float k = m.y * m.y / m.x;
      float R = (k + m.x) * 0.5;
      float d = (k - m.x) * 0.5;
      vec2 q = abs(p);
      float b = sqrt(max(R * R - d * d, 0.0));
      return ((q.y - b) * d > q.x * b) ? length(q - vec2(0.0, b)) : length(q - vec2(-d, 0.0)) - R;
    }
    float acaso(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    // o espaço vazio: quase preto, com poucas estrelas bem fracas piscando
    vec3 vazio(vec2 uv) {
      vec3 c = vec3(0.003, 0.0, 0.01);
      vec2 q = (uv - 0.5) * vec2(uAspecto, 1.0) * 70.0;
      vec2 cel = floor(q);
      float r = acaso(cel);
      if (r > 0.972) {
        vec2 o = vec2(acaso(cel + 3.1), acaso(cel + 7.7)) - 0.5;
        float d = length(fract(q) - 0.5 - o * 0.6);
        float pisca = 0.55 + 0.45 * sin(uT * (0.7 + r * 2.0) + r * 60.0);
        c += vec3(0.75, 0.7, 1.0) * exp(-d * d * 60.0) * pisca * (r - 0.972) * 22.0;
      }
      return c;
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uForca <= 0.0) { gl_FragColor = c; return; }
      vec2 p = (vUv - uCentro) * vec2(uAspecto, 1.0);
      float sd = mix(sdFenda(p, uMeio), sdEstrela4(p, uEstrelaR, 3.0), uForma);
      float dentro = max(1.0 - smoothstep(-uPx, uPx, sd), uTudo) * uForca;
      c.rgb = mix(c.rgb, vazio(vUv), dentro);
      gl_FragColor = c;
    }
  `,
};

export class Transcendencia {
  /**
   * @param olhos     a lista de olhos da página ({ olho, centro, escala, inclinacao, x, y, ... })
   * @param medidas   as medidas do olho (OLHO)
   * @param aoTerminar chamada uma vez, quando a cena chega ao espaço vazio
   */
  constructor({ cena, camera, tex, composer, olhos, ceu, medidas, elementos, aoTerminar }) {
    Object.assign(this, { cena, camera, olhos, ceu, medidas, elementos, aoTerminar });
    this.ativa = false;
    this.terminou = false;
    this.congelar = null; // (para testes: segura a cena neste segundo)
    this.energia = new Energia(cena);
    this.estrela = new Estrela(cena, tex);
    this.estrela.atualizar(0, (t, out) => out.set(0, 0, 0), { visivel: false });
    // a estrela é desenhada depois dos olhos (senão o véu de dentro do olho a escureceria)
    const porCima = (obj) => obj.traverse((o) => (o.renderOrder = 15));
    porCima(this.estrela.grupo);
    this.estrela.rastro.malha.renderOrder = 15;
    for (const m of this.estrela.malabares) {
      porCima(m.grupo);
      m.rastro.malha.renderOrder = 15;
    }
    // feixe de luz saindo pela fresta da pálpebra
    this.feixe = sprite(tex.brilho, '#f5ecff', 1, 0);
    this.feixe.renderOrder = 14;
    this.feixe.material.depthTest = false;
    this.brilhoFresta = sprite(tex.brilho, '#c084fc', 1, 0);
    this.brilhoFresta.renderOrder = 14;
    this.brilhoFresta.material.depthTest = false;
    this.feixeFino = sprite(tex.brilho, '#ffffff', 1, 0); // um risco fino e comprido no meio do feixe
    this.feixeFino.renderOrder = 14;
    this.feixeFino.material.depthTest = false;
    cena.add(this.feixe, this.brilhoFresta, this.feixeFino);
    // raios de luz escapando por cima e por baixo da fresta
    this.uRaios = { uT: { value: 0 }, uForca: { value: 0 } };
    this.raios = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.uRaios,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
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
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.raios.renderOrder = 13;
    cena.add(this.raios);
    // a íris transformada: uma estrela de 8 pontas bem luminosa (algumas pontas passam das
    // pálpebras), girando devagar
    this.uIrisEstrela = { uT: { value: 0 }, uForca: { value: 0 }, uGiro: { value: 0 }, uR: { value: 0.35 } };
    this.irisEstrela = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.uIrisEstrela,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uT; uniform float uForca; uniform float uGiro; uniform float uR; varying vec2 vUv;
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
          void main() {
            vec2 p = vUv - 0.5; // (o quadrado tem 1 de lado; a estrela tem raio uR)
            float c = cos(uGiro);
            float s = sin(uGiro);
            p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
            float sd = sdEstrela(p, uR, ${8}.0, 4.6) / uR; // (em raios da estrela)
            float r = length(p) / uR;
            float dentro = 1.0 - smoothstep(-0.006, 0.006, sd);
            // o corpo: branco no meio, lilás e roxo indo para as pontas
            vec3 cor = mix(vec3(1.0, 0.97, 1.0) * 1.6, vec3(0.78, 0.55, 1.0) * 0.75, smoothstep(0.0, 0.45, r));
            cor = mix(cor, vec3(0.48, 0.22, 0.92) * 0.5, smoothstep(0.45, 1.0, r));
            float vivo = 0.85 + 0.15 * sin(uT * 3.0 - r * 10.0);
            // borda bem clara e um brilho fraco por fora
            float borda = exp(-pow(sd / 0.012, 2.0)) * 1.3 + exp(-max(sd, 0.0) / 0.08) * 0.16;
            float fade = 1.0 - smoothstep(0.44, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
            gl_FragColor = vec4((cor * dentro * vivo + vec3(0.92, 0.84, 1.0) * borda) * fade * uForca, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.irisEstrela.renderOrder = 16;
    this.irisEstrela.visible = false;
    cena.add(this.irisEstrela);

    // o núcleo forte da estrela-íris (bem branco, atrás da pupila oca)
    this.nucleoForte = sprite(tex.brilho, '#ffffff', 1, 0);
    this.nucleoForte.renderOrder = 15;
    this.nucleoForte.material.depthTest = false;
    this.auraForte = sprite(tex.brilho, '#d8b4fe', 1, 0);
    this.auraForte.renderOrder = 15;
    this.auraForte.material.depthTest = false;
    cena.add(this.auraForte, this.nucleoForte);
    // raios compridos e finos saindo do olho transformado
    const lancas = TRANSCENDER.lancas.map(([graus, comp]) => [THREE.MathUtils.degToRad(graus), comp]);
    this.uLancas = { uT: { value: 0 }, uCresce: { value: 0 }, uForca: { value: 0 } };
    this.lancas = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.uLancas,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uT; uniform float uCresce; uniform float uForca; varying vec2 vUv;
          const int N = ${lancas.length};
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
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.lancas.renderOrder = 13;
    this.lancas.visible = false;
    cena.add(this.lancas);
    this.vazio = new ShaderPass(SHADER_VAZIO);
    composer.insertPass(this.vazio, 3); // logo depois do brilho difuso
    this._v = new THREE.Vector2();
    this._v3 = new THREE.Vector3();
    this._tremor = new THREE.Vector3();
    this.glitch = { ini: -1, dura: 0, forca: 0 };
  }

  get duracao() {
    return MARCOS.total;
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

  /** Tamanho visível (metade da largura e da altura) no plano dos olhos. */
  _visivel() {
    const meiaAltura = 60 * Math.tan(THREE.MathUtils.degToRad(this.fovBase / 2));
    return { meiaLargura: meiaAltura * this.camera.aspect, meiaAltura };
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
    if (Math.random() < chance * dt) this.glitch = { ini: t, dura: rand(0.05, 0.16), forca: rand(0.5, 1) };
    const g = this.glitch;
    if (g.ini < 0 || t - g.ini > g.dura) return 0;
    return Math.random() < 0.25 ? 0.15 : g.forca * rand(0.6, 1);
  }

  atualizar(t, dt) {
    if (this.terminou) {
      this.vazio.uniforms.uT.value = t; // no espaço vazio só as estrelas fracas piscam
      return;
    }
    const s = this.congelar ?? t - this.t0;
    const { meiaLargura, meiaAltura } = this._visivel();
    const emPe = this.camera.aspect < 0.9;
    const M = this.medidas;
    const grande = (TRANSCENDER.tamanho[emPe ? 'emPe' : 'deitada'] * 2 * meiaLargura) / (2 * M.meiaLargura);
    const esc = this.olhos[this.i];
    const org = this.origem[this.i];

    // ---- 1. escolher: vai para o meio e cresce
    const fEsc = fase('escolher', s);
    const ir = easeInOutCubic(clamp((s - 0.35) / (MARCOS.escolher[1] - 0.35)));
    let escala = org.escala * Math.pow(grande / org.escala, ir);
    const cx = lerp(org.centro.x, 0, ir);
    const cy = lerp(org.centro.y, 0, ir);
    const inclinacao = lerp(org.inclinacao, 0, ir);

    // ---- 7. entrar: a câmera mergulha na pupila (o olho cresce cada vez mais rápido)
    const fEntrar = fase('entrar', s);
    const mergulho = easeInCubic(fEntrar);
    escala *= Math.exp(Math.log(TRANSCENDER.mergulho) * mergulho);

    // ---- tremor (2. transcender e um pouco na 4. luz)
    const fTr = fase('transcender', s);
    const fFechar = fase('fechar', s);
    const fLuz = fase('luz', s);
    const fAbrir = fase('abrir', s);
    let tremorOlho = 0;
    if (s >= MARCOS.transcender[0] && s < MARCOS.fechar[0] + 0.15) {
      tremorOlho = (0.05 + 0.55 * fTr * fTr) * (1 - smoothstep(MARCOS.fechar[0], MARCOS.fechar[0] + 0.15, s));
    } else if (s >= MARCOS.luz[0] && s < MARCOS.abrir[0] + 0.1) {
      tremorOlho = 0.03 + 0.14 * fLuz * fLuz;
    }
    tremor(t, tremorOlho * grande * 0.5, this._tremor, 23);
    const pulso = 1 + 0.025 * fTr * Math.sin(t * 23) * (s < MARCOS.fechar[0] ? 1 : 0);
    esc.olho.posicionar(cx + this._tremor.x, cy + this._tremor.y, escala * pulso, inclinacao);

    // tela tremendo junto
    const tremorTela = s >= MARCOS.transcender[0] && s < MARCOS.fechar[0] ? 0.4 * fTr * fTr : s >= MARCOS.luz[0] && s < MARCOS.abrir[0] ? 0.12 * fLuz * fLuz : 0;
    tremor(t + 7.3, tremorTela, this._v3, 17);
    this.camera.position.set(this._v3.x, this._v3.y, 60);
    // no mergulho a lente abre um pouco (sensação de velocidade)
    this.camera.fov = this.fovBase + 10 * mergulho;
    this.camera.updateProjectionMatrix();

    // ---- olhar do escolhido: para a frente, menos no 2 (olha para todo lado, muito rápido)
    if (s >= MARCOS.transcender[0] && s < MARCOS.fechar[0]) {
      if (t >= this.proximaOlhada) {
        this.alvo.set(rand(-1, 1), rand(-0.9, 0.9));
        if (this.alvo.length() > 1) this.alvo.normalize();
        this.proximaOlhada = t + rand(0.09, 0.2) * (1.2 - fTr * 0.5);
      }
      this._mola(esc, this.alvo.x, this.alvo.y, 900, dt);
    } else {
      this._mola(esc, 0, 0, s < MARCOS.transcender[0] ? 60 : 220, dt);
    }

    // ---- abertura do olho escolhido
    let abertura = 1;
    if (s >= MARCOS.fechar[0] && s < MARCOS.abrir[0]) {
      const fechou = 1 - (1 - 0.035) * easeInCubic(Math.min(1, fFechar * 2));
      abertura = s < MARCOS.luz[0] ? fechou : 0.035 + 0.035 * fLuz; // na luz, força um pouco para abrir
    } else if (s >= MARCOS.abrir[0]) {
      abertura = 0.07 + 0.93 * easeOutCubic(fAbrir);
    }

    // ---- falha: na escolha, um tranco forte; no 2, cada vez mais vezes
    let glitch = 0;
    if (s < 0.35) glitch = Math.random() < 0.25 ? 0.15 : rand(0.6, 1);
    else if (s >= MARCOS.transcender[0] && s < MARCOS.fechar[0]) glitch = this._glitch(t, 2 + 14 * fTr, dt);

    // ---- luz, linhas e a íris virando estrela
    const u = esc.olho.uComuns;
    let brilho = 1;
    let luzDentro = 0;
    if (s < MARCOS.fechar[0]) brilho = 1 + 0.9 * fTr;
    else if (s < MARCOS.luz[0]) brilho = lerp(1.9, 1.3, fFechar);
    else if (s < MARCOS.abrir[0]) {
      brilho = 1.3 + 1.4 * fLuz * fLuz;
      luzDentro = 4.5 * Math.pow(fLuz, 1.8);
    } else {
      brilho = lerp(2.7, 1.6, easeOutCubic(fAbrir));
      luzDentro = lerp(4.5, 0, easeOutCubic(fAbrir));
    }
    const virouEstrela = smoothstep(0, 0.5, fAbrir);
    esc.olho.atualizar(t, esc.x, esc.y, abertura, glitch, 0);
    u.uOpac.value = 1 - smoothstep(0.85, 1, fEntrar);
    u.uBrilho.value = brilho;
    u.uLuzDentro.value = luzDentro;
    u.uIrisLinha.value = 1 - virouEstrela; // (o círculo da íris some: agora a íris é a estrela)
    u.uPupilaLinha.value = 1 + 1.6 * virouEstrela; // a borda da pupila oca fica bem clara (como um eclipse)
    // olho transformado: a pupila vira estrela de 4 pontas e o olho
    // por dentro fica bem escuro (a estrela da íris se destaca)
    esc.olho.uIris.uForma.value = smoothstep(0, 0.6, fAbrir);
    esc.olho.fundo.material.uniforms.uVeu.value = lerp(this.veuBase, 0.9, virouEstrela);

    // ---- os outros olhos: olham para o escolhido e somem
    const somem = 1 - smoothstep(0.3, 1.8, s);
    this.olhos.forEach((o, i) => {
      if (i === this.i) return;
      const og = this.origem[i];
      o.olho.posicionar(og.centro.x * (1 + 0.12 * fEsc), og.centro.y * (1 + 0.12 * fEsc), og.escala * (1 - 0.15 * fEsc), og.inclinacao);
      this._v.set(cx - og.centro.x, cy - og.centro.y).divideScalar(og.escala).rotateAround(new THREE.Vector2(), -og.inclinacao);
      const d = this._v.length() || 1;
      this._mola(o, this._v.x / d, this._v.y / d, 120, dt);
      o.olho.atualizar(t, o.x, o.y, 1, 0, 0);
      o.olho.uComuns.uOpac.value = somem;
    });

    // ---- o céu e as bordas escurecem
    this.ceu.atualizar(t, this.camera, lerp(1, 0.16, smoothstep(0.2, 2, s)) * (1 - smoothstep(0.6, 1, fEntrar)));
    if (this.elementos.vinheta) this.elementos.vinheta.style.opacity = (0.8 + 0.2 * fEsc).toFixed(3);

    // ---- energia caindo no olho (2. transcender)
    const energia = s < MARCOS.fechar[0] ? smoothstep(MARCOS.transcender[0], MARCOS.transcender[0] + 0.7, s) : 1 - smoothstep(MARCOS.fechar[0], MARCOS.fechar[0] + 0.3, s);
    this.energia.atualizar(t, energia, this._v.set(cx, cy), M.meiaLargura * 2 * escala);

    // ---- feixe de luz pela fresta (4. luz), que some quando o olho abre
    const feixe = s < MARCOS.abrir[0] ? Math.pow(fLuz, 1.3) * (s >= MARCOS.luz[0] ? 1 : 0) : 1 - easeOutCubic(fAbrir);
    const largura = M.meiaLargura * 2 * escala;
    this.feixe.position.set(cx, cy - M.meiaAltura * 0.3 * escala * (1 - abertura), 1);
    this.feixe.scale.set(largura * (0.8 + 1.6 * fLuz), escala * (0.9 + 1.2 * fLuz), 1);
    this.feixe.material.opacity = feixe;
    this.feixeFino.position.copy(this.feixe.position);
    this.feixeFino.scale.set(largura * (1.2 + 2.6 * fLuz), escala * 0.22, 1);
    this.feixeFino.material.opacity = feixe;
    this.brilhoFresta.position.copy(this.feixe.position);
    this.brilhoFresta.scale.setScalar(largura * 0.6 * (0.3 + fLuz));
    this.brilhoFresta.material.opacity = 0.45 * feixe;
    this.raios.position.copy(this.feixe.position);
    this.raios.scale.set(largura * 2.4, largura * 1.6, 1);
    this.uRaios.uT.value = t;
    this.uRaios.uForca.value = s < MARCOS.abrir[0] ? fLuz * fLuz * (s >= MARCOS.luz[0] ? 1 : 0) : Math.exp(-fAbrir * 3);
    this.raios.visible = this.uRaios.uForca.value > 0.001;

    // ---- clarão quando abre
    if (this.elementos.clarao) {
      const c = s >= MARCOS.abrir[0] ? 0.42 * Math.exp(-Math.pow((fAbrir - 0.12) / 0.2, 2)) : 0;
      this.elementos.clarao.style.opacity = c.toFixed(3);
    }

    // ---- a estrela no lugar da íris (5, 6, 7)
    const irisPos = esc.olho.iris.getWorldPosition(this._v3);
    const estrelaPos = irisPos.clone();
    const apareceu = s >= MARCOS.abrir[0] ? easeOutCubic(fAbrir) : 0;
    const pulsoEstrela = 1 + 0.05 * Math.sin(t * 5.1) + 0.03 * Math.sin(t * 13.7);
    this.estrela.atualizar(t, (tt, out) => out.copy(estrelaPos), {
      visivel: apareceu > 0.001 && fEntrar < 0.999,
      brilho: 2.6 * apareceu * pulsoEstrela,
      escala: 1,
      tremor: 0,
      raioMalabares: () => escala * apareceu,
      luz: 0,
      rastro: 0,
      limite: 0,
      escalaVisual: escala * 0.85,
    });

    // núcleo forte e aura da estrela-íris
    const raioIris = M.raioIris * escala;
    this.nucleoForte.position.copy(estrelaPos).setZ(1.2);
    this.nucleoForte.scale.setScalar(raioIris * 1.5 * pulsoEstrela);
    this.nucleoForte.material.opacity = 0.85 * apareceu;
    this.auraForte.position.copy(estrelaPos).setZ(1.1);
    this.auraForte.scale.setScalar(raioIris * 3.2);
    this.auraForte.material.opacity = 0.22 * apareceu;
    // a íris-estrela: cresce a partir da íris quando o olho abre (passando um pouco do tamanho)
    const cresce = s >= MARCOS.abrir[0] ? 1 + 0.12 * Math.sin(Math.min(1, fAbrir * 1.6) * Math.PI) : 0;
    const raioEstrela = M.irisEstrela.raio * escala * (0.35 + 0.65 * easeOutCubic(fAbrir)) * cresce;
    this.irisEstrela.visible = apareceu > 0.001 && !(fEntrar > 0.97);
    this.irisEstrela.position.copy(estrelaPos).setZ(1.3);
    this.irisEstrela.scale.setScalar(Math.max(0.001, raioEstrela * 2 * 1.25));
    this.uIrisEstrela.uR.value = 0.5 / 1.25;
    this.uIrisEstrela.uT.value = t;
    this.uIrisEstrela.uGiro.value = 0.25 + t * 0.12;
    this.uIrisEstrela.uForca.value = apareceu * (0.92 + 0.08 * Math.sin(t * 4.3));

    // raios compridos: saem do olho quando ele abre (crescem rápido) e brilham
    this.lancas.visible = apareceu > 0.001;
    this.lancas.position.set(cx, cy, 0.5);
    this.lancas.scale.setScalar(M.meiaLargura * 2 * escala * 6);
    this.uLancas.uT.value = t;
    this.uLancas.uCresce.value = easeOutCubic(clamp(fAbrir * 1.3));
    this.uLancas.uForca.value = apareceu;

    // ---- a pupila oca (e, no fim, o espaço vazio tomando a tela)
    const fenda = esc.olho.uIris.uFenda.value; // (R, d) da fenda agora
    const meiaLarguraFenda = fenda.x - fenda.y;
    const meiaAlturaFenda = Math.sqrt(Math.max(fenda.x * fenda.x - fenda.y * fenda.y, 0));
    const porAltura = 1 / (2 * 60 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const ndc = estrelaPos.clone().project(this.camera);
    const vz = this.vazio.uniforms;
    vz.uCentro.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
    vz.uMeio.value.set(meiaLarguraFenda * escala * porAltura * 0.93, meiaAlturaFenda * escala * porAltura * 0.97);
    vz.uAspecto.value = this.camera.aspect;
    vz.uForca.value = smoothstep(0.25, 0.85, fAbrir);
    vz.uForma.value = esc.olho.uIris.uForma.value;
    vz.uEstrelaR.value = M.pupilaEstrela.raio * escala * porAltura * 0.93;
    vz.uTudo.value = smoothstep(0.8, 1, fEntrar);
    vz.uPx.value = 1.5 / Math.max(1, innerHeight);
    vz.uT.value = t;

    // quando o oco já cobre a tela inteira, o olho e a estrela não aparecem mais: param de ser
    // desenhados (são enormes nessa hora e pesariam à toa)
    const coberto = fEntrar > 0.97;
    esc.olho.grupo.visible = !coberto;
    this.lancas.visible = this.lancas.visible && !coberto;
    if (coberto) {
      this.nucleoForte.material.opacity = 0;
      this.auraForte.material.opacity = 0;
    }
    if (coberto) this.estrela.atualizar(t, (tt, out) => out.copy(estrelaPos), { visivel: false });

    // ---- 8. vazio
    if (s >= MARCOS.total && !this.terminou) {
      this.terminou = true;
      for (const o of this.olhos) o.olho.grupo.visible = false;
      this.ceu.atualizar(t, this.camera, 0);
      this.camera.fov = this.fovBase;
      this.camera.position.set(0, 0, 60);
      this.camera.updateProjectionMatrix();
      if (this.aoTerminar) this.aoTerminar();
    }
    if (this.terminou) {
      vz.uForca.value = 1;
      vz.uTudo.value = 1;
      this.estrela.atualizar(t, (tt, out) => out.set(0, 0, 0), { visivel: false });
      this.energia.atualizar(t, 0, this._v, 1);
      this.feixe.material.opacity = 0;
      this.feixeFino.material.opacity = 0;
      this.brilhoFresta.material.opacity = 0;
      this.raios.visible = false;
      this.lancas.visible = false;
      this.irisEstrela.visible = false;
      this.nucleoForte.material.opacity = 0;
      this.auraForte.material.opacity = 0;
      if (this.elementos.clarao) this.elementos.clarao.style.opacity = '0';
    }
  }
}
