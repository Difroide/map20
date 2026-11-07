/**
 * O heatmap.js: desenha o mapa de calor por cima da página de vendas real.
 *
 * Quem carrega é o próprio tracker.js, quando a página abre com
 * ?stl_heatmap=<token> (o painel monta esse link). Ele deixa em
 * window.__stlHeatmap o id da área, o token e o endereço dos dados, e não
 * rastreia a visita.
 *
 * Cliques: cada ponto vai preso ao elemento clicado (seletor + posição
 * relativa dentro dele), então cai no lugar certo mesmo que a página tenha
 * outra largura agora. Sem o elemento (sumiu, está escondido), usa os pixels
 * da página de quem clicou, ajustados à largura atual.
 *
 * Rolagem: faixas coloridas pela página inteira, do quente (todo mundo viu)
 * ao frio (pouca gente chegou), com a % a cada 10% e a linha da primeira tela.
 *
 * ES5, pelo mesmo motivo do tracker.js.
 */

const SOURCE = `(function (w, d) {
  'use strict';
  var cfg = w.__stlHeatmap;
  if (!cfg || w.__stlHmOn) return;
  w.__stlHmOn = 1;

  var Z = 2147483000, MAX_PIXELS = 8000000;
  var mode = param('stl_hm') === 'scroll' ? 'scroll' : 'clicks';
  var device = param('stl_hm_dev');
  if (device !== 'mobile' && device !== 'desktop') device = (w.innerWidth || 1024) < 768 ? 'mobile' : 'desktop';
  var days = param('stl_hm_days');
  if (days !== '7' && days !== '30' && days !== '90') days = '30';
  var data = null, layer = null, bar = null, status = null, hidden = false, redrawTimer = null, palette = null;

  function param(k) {
    var m = location.search.match(new RegExp('[?&]' + k + '=([^&#]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function docSize() {
    var e = d.documentElement, b = d.body;
    return {
      w: Math.max(e.scrollWidth, b ? b.scrollWidth : 0, e.clientWidth),
      h: Math.max(e.scrollHeight, b ? b.scrollHeight : 0, e.clientHeight)
    };
  }

  function el(tag, css, text) {
    var x = d.createElement(tag);
    if (css) x.style.cssText = css;
    if (text) x.textContent = text;
    return x;
  }

  // ---- Barra no topo ------------------------------------------------------
  var BTN = 'border:0;border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer;';
  function button(label, active, onClick) {
    var b = el('button', BTN + (active ? 'background:#f9fafb;color:#111827;' : 'background:#374151;color:#f9fafb;'), label);
    b.type = 'button';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  }

  function renderBar() {
    if (!bar) {
      bar = el('div', 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:' + (Z + 10) + ';' +
        'font:13px/1.3 system-ui,-apple-system,sans-serif;background:#111827;color:#f9fafb;border-radius:10px;' +
        'padding:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 20px)');
      bar.setAttribute('data-stl-heatmap', '');
      d.documentElement.appendChild(bar);
    }
    bar.innerHTML = '';
    bar.appendChild(el('strong', 'padding:0 6px', 'Mapa de calor'));
    bar.appendChild(button('Cliques', mode === 'clicks', function () { mode = 'clicks'; renderBar(); draw(); }));
    bar.appendChild(button('Rolagem', mode === 'scroll', function () { mode = 'scroll'; renderBar(); draw(); }));
    bar.appendChild(el('span', 'width:1px;height:18px;background:#4b5563;margin:0 2px'));
    bar.appendChild(button('Celular', device === 'mobile', function () { device = 'mobile'; load(); }));
    bar.appendChild(button('Computador', device === 'desktop', function () { device = 'desktop'; load(); }));
    bar.appendChild(el('span', 'width:1px;height:18px;background:#4b5563;margin:0 2px'));
    var ds = ['7', '30', '90'], i;
    for (i = 0; i < ds.length; i++) {
      (function (v) { bar.appendChild(button(v + 'd', days === v, function () { days = v; load(); })); })(ds[i]);
    }
    bar.appendChild(el('span', 'width:1px;height:18px;background:#4b5563;margin:0 2px'));
    bar.appendChild(button(hidden ? 'Mostrar' : 'Ocultar', false, function () {
      hidden = !hidden;
      if (layer) layer.style.display = hidden ? 'none' : 'block';
      renderBar();
    }));
    status = el('span', 'padding:0 6px;opacity:.85', statusText());
    bar.appendChild(status);
  }

  function statusText() {
    if (!data) return 'carregando…';
    if (data.error) return data.error;
    var t = data.views + (data.views == 1 ? ' visita' : ' visitas') + ' · ' + data.clicks + (data.clicks == 1 ? ' clique' : ' cliques');
    var wide = (w.innerWidth || 0) >= 768;
    if ((device === 'mobile') === wide) t += ' · ' + (device === 'mobile' ? 'dados de celular numa tela larga: estreite a janela' : 'dados de computador numa tela estreita');
    return t;
  }

  // ---- Dados --------------------------------------------------------------
  function load() {
    data = null;
    renderBar();
    var url = cfg.endpoint + '?tid=' + encodeURIComponent(cfg.tid) + '&token=' + encodeURIComponent(cfg.token) +
      '&device=' + device + '&days=' + days + '&url=' + encodeURIComponent(location.origin + location.pathname);
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onload = function () {
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) {}
      if (!j || !j.ok) data = { error: (j && j.reason) || 'não foi possível carregar os dados' };
      else data = j;
      renderBar();
      draw();
    };
    x.onerror = function () { data = { error: 'sem conexão com o painel' }; renderBar(); };
    x.send();
  }

  // ---- Camada sobre a página ----------------------------------------------
  function resetLayer(s) {
    if (!layer) {
      layer = el('div', '');
      layer.setAttribute('data-stl-heatmap', '');
      d.documentElement.appendChild(layer);
    }
    layer.style.cssText = 'position:absolute;top:0;left:0;width:' + s.w + 'px;height:' + s.h + 'px;z-index:' + Z +
      ';pointer-events:none;overflow:hidden;display:' + (hidden ? 'none' : 'block');
    layer.innerHTML = '';
  }

  function canvasFor(s) {
    var scale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, s.w * s.h)));
    var c = el('canvas', 'position:absolute;top:0;left:0;width:' + s.w + 'px;height:' + s.h + 'px');
    c.width = Math.max(1, Math.round(s.w * scale));
    c.height = Math.max(1, Math.round(s.h * scale));
    layer.appendChild(c);
    return { c: c, ctx: c.getContext('2d'), scale: scale };
  }

  function makePalette() {
    var c = el('canvas'), ctx, g;
    c.width = 256; c.height = 1;
    ctx = c.getContext('2d');
    g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(0,0,255,1)');
    g.addColorStop(0.35, 'rgba(0,255,255,1)');
    g.addColorStop(0.55, 'rgba(0,255,0,1)');
    g.addColorStop(0.75, 'rgba(255,255,0,1)');
    g.addColorStop(1, 'rgba(255,0,0,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 1);
    return ctx.getImageData(0, 0, 256, 1).data;
  }

  function resolver() {
    var cache = {}, sx = w.pageXOffset || 0, sy = w.pageYOffset || 0, s = docSize();
    return function (p) {
      var sel = p[0], r, node;
      if (sel && p[1] !== null) {
        if (!cache.hasOwnProperty(sel)) {
          node = null;
          try { node = d.querySelector(sel); } catch (e) {}
          r = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
          cache[sel] = r && r.width > 0 && r.height > 0 ? { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height } : null;
        }
        r = cache[sel];
        if (r) return [r.x + p[1] * r.w, r.y + p[2] * r.h];
      }
      return [p[3] * s.w / (p[5] || s.w), p[4]];
    };
  }

  function drawClicks(s) {
    var pts = data.points || [], cv, ctx, i, xy, x, y, r, g, img, px, a, j, alpha;
    layer.appendChild(el('div', 'position:absolute;inset:0;background:rgba(17,24,39,.35)'));
    if (!pts.length) return;
    cv = canvasFor(s);
    ctx = cv.ctx;
    r = Math.max(8, Math.round(26 * cv.scale));
    alpha = Math.max(0.06, Math.min(0.5, 3 / Math.sqrt(pts.length)));
    var at = resolver();
    for (i = 0; i < pts.length; i++) {
      xy = at(pts[i]);
      x = xy[0] * cv.scale;
      y = xy[1] * cv.scale;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,' + alpha + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (!palette) palette = makePalette();
    img = ctx.getImageData(0, 0, cv.c.width, cv.c.height);
    px = img.data;
    for (i = 3; i < px.length; i += 4) {
      a = px[i];
      if (!a) continue;
      j = a * 4;
      px[i - 3] = palette[j];
      px[i - 2] = palette[j + 1];
      px[i - 1] = palette[j + 2];
      px[i] = Math.min(230, 60 + a);
    }
    ctx.putImageData(img, 0, 0);
  }

  function reachAt(pct) {
    var reach = data.reach || [], i = Math.floor(pct / 5), f = (pct - i * 5) / 5;
    if (i >= reach.length - 1) return reach[reach.length - 1] || 0;
    return reach[i] + (reach[i + 1] - reach[i]) * f;
  }

  function drawScroll(s) {
    var cv = canvasFor(s), ctx = cv.ctx, step = Math.max(1, Math.round(4 * cv.scale)), y, v, hue, k, top, lbl;
    for (y = 0; y < cv.c.height; y += step) {
      v = reachAt((y / cv.c.height) * 100);
      hue = Math.round(240 * (1 - v / 100));
      ctx.fillStyle = 'hsla(' + hue + ',90%,50%,.45)';
      ctx.fillRect(0, y, cv.c.width, step);
    }
    for (k = 10; k < 100; k += 10) {
      top = Math.round(s.h * k / 100);
      layer.appendChild(el('div', 'position:absolute;left:0;right:0;top:' + top + 'px;border-top:1px dashed rgba(255,255,255,.8)'));
      lbl = el('div', 'position:absolute;left:8px;top:' + (top + 4) + 'px;font:600 12px/1.2 system-ui,sans-serif;' +
        'background:#111827;color:#f9fafb;border-radius:6px;padding:3px 7px',
        Math.round(reachAt(k)) + '% chegaram aqui');
      layer.appendChild(lbl);
    }
    if (data.fold) {
      top = Math.round(s.h * data.fold / 100);
      layer.appendChild(el('div', 'position:absolute;left:0;right:0;top:' + top + 'px;border-top:3px solid #f9fafb'));
      layer.appendChild(el('div', 'position:absolute;right:8px;top:' + (top + 4) + 'px;font:600 12px/1.2 system-ui,sans-serif;' +
        'background:#f9fafb;color:#111827;border-radius:6px;padding:3px 7px', 'Fim da primeira tela (média)'));
    }
  }

  function draw() {
    if (!data || data.error || !d.body) return;
    var s = docSize();
    resetLayer(s);
    if (mode === 'scroll') drawScroll(s);
    else drawClicks(s);
  }

  function scheduleRedraw() {
    if (redrawTimer) clearTimeout(redrawTimer);
    redrawTimer = setTimeout(draw, 300);
  }

  function start() {
    renderBar();
    load();
    w.addEventListener('resize', scheduleRedraw);
    w.addEventListener('load', scheduleRedraw);
    // Imagens e blocos que carregam depois mudam a altura da página.
    setTimeout(scheduleRedraw, 1500);
    setTimeout(scheduleRedraw, 4000);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})(window, document);
`;

function compact(source: string): string {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}

export const HEATMAP_SCRIPT = compact(SOURCE);
