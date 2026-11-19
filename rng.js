/**
 * Deterministic Mulberry32 PRNG for reproducible 20Hz match simulation & QA tests
 */
(function (root) {
  'use strict';

  function createRng(seed = 123456789) {
    let a = (seed >>> 0) || 1;
    function next() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function range(min, max) {
      return min + next() * (max - min);
    }
    function int(min, maxInclusive) {
      return min + Math.floor(next() * (maxInclusive - min + 1));
    }
    function pick(arr) {
      if (!arr || !arr.length) return null;
      return arr[Math.floor(next() * arr.length)];
    }
    return { next, range, int, pick };
  }

  const api = { createRng };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Rng = api;
})(typeof window !== 'undefined' ? window : globalThis);
