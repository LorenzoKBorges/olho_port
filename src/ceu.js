import * as THREE from 'three';
import { materialPontos, geometria, pontos, sprite } from './materiais.js';
import { criarRng, naEsfera } from './utils.js';

/** Céu estrelado roxo, com brumas (o mesmo do Big Bang). */
export class Ceu {
  constructor(cena, tex, q) {
    this.grupo = new THREE.Group();
    cena.add(this.grupo);
    const rand = criarRng(101);
    const n = Math.round(8000 * q);
    const pos = new Float32Array(n * 3);
    const cor = new Float32Array(n * 3);
    const tam = new Float32Array(n);
    const sem = new Float32Array(n);
    const cs = ['#ffffff', '#f3e8ff', '#e9d5ff', '#ddd6fe', '#c4b5fd', '#f5d0fe', '#e2d1ff'].map((h) => new THREE.Color(h));
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      naEsfera(rand, v);
      // um pouco mais de estrelas perto de uma faixa (como a Via Láctea)
      if (rand() < 0.35) v.y *= 0.18;
      v.normalize().multiplyScalar(3000);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = cs[Math.floor(rand() * cs.length)];
      const b = 0.4 + rand() * 0.9;
      cor.set([c.r * b, c.g * b, c.b * b], i * 3);
      tam[i] = 4.5 + Math.pow(rand(), 4) * 22;
      sem[i] = rand();
    }
    this.u = { uOpac: { value: 0 }, uT: { value: 0 } };
    this.estrelas = pontos(
      geometria({ position: [pos, 3], aCor: [cor, 3], aTam: [tam, 1], aSem: [sem, 1] }, n),
      materialPontos({
        uniforms: this.u,
        cabecalho: 'attribute vec3 aCor; attribute float aTam; attribute float aSem; uniform float uOpac; uniform float uT;',
        corpo: /* glsl */ `
          pos = position; cor = aCor * 1.15; tam = aTam;
          alfa = uOpac * (0.7 + 0.3 * sin(uT * (0.8 + aSem * 2.5) + aSem * 80.0));
        `,
      })
    );
    this.grupo.add(this.estrelas);

    this.brumas = [];
    const brumas = [
      ['#6d28d9', [-0.6, 0.15, -0.8], 2800, 0.3],
      ['#7e22ce', [0.7, -0.1, -0.7], 2500, 0.26],
      ['#a21caf', [0.1, 0.4, -0.9], 2000, 0.18],
      ['#4c1d95', [-0.8, -0.3, 0.5], 2800, 0.28],
      ['#6d28d9', [0.6, 0.2, 0.75], 2600, 0.26],
      ['#581c87', [0.0, -0.7, 0.2], 3000, 0.3],
      ['#9333ea', [-0.3, 0.8, 0.1], 2400, 0.2],
      ['#5b21b6', [0.9, 0.1, -0.1], 2600, 0.24],
    ];
    brumas.forEach(([c, d, s, op], i) => {
      const b = sprite(tex.nuvens[i % tex.nuvens.length], c, s, 0);
      b.position.set(...d).normalize().multiplyScalar(2700);
      b.userData.op = op;
      this.grupo.add(b);
      this.brumas.push(b);
    });
  }

  atualizar(t, camera, opac) {
    this.grupo.position.copy(camera.position);
    this.u.uOpac.value = opac;
    this.u.uT.value = t;
    this.grupo.visible = opac > 0.001;
    for (const b of this.brumas) b.material.opacity = b.userData.op * opac * 0.8;
  }
}
