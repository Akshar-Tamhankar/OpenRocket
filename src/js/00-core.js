import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

/* =====================================================================
   0. basics
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const TEST = window.__TEST || {};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const G = !!(window.gsap && window.ScrollTrigger);
if (G) { gsap.registerPlugin(ScrollTrigger); gsap.ticker.lagSmoothing(0); }
const isMobile = () => innerWidth < 760;
const isNarrow = () => innerWidth < 900;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const cssVar = n => getComputedStyle(html).getPropertyValue(n).trim();
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const docTop = el => el.getBoundingClientRect().top + scrollY;
const state = { paused: false, vel: 0 };
const MET = { vh: innerHeight, dist: 0, max: 1 };
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
