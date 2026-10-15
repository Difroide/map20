/**
 * O tracker.js que roda na página de vendas do cliente — o "container web"
 * deste GTM simplificado.
 *
 * Fica numa string, e não num arquivo .js ao lado: a API roda como função da
 * Vercel a partir do dist compilado pelo tsc, e um asset solto não é copiado
 * pelo nest build nem garantidamente empacotado na função. Uma constante vai
 * junto com o código, sempre.
 *
 * ES5 de propósito — sem arrow, sem let/const, sem template string. O script
 * roda em qualquer navegador que abrir a página do cliente, e um erro de
 * sintaxe num navegador velho derruba só o rastreio, mas derruba em silêncio.
 *
 * O que ele faz:
 *   - _stl_vid (1 ano) identifica o navegador; _stl_sid (30 min, renovado a
 *     cada evento) identifica a visita; _stl_utm guarda as UTMs da chegada.
 *   - _fbp e _fbc: lê os do pixel do Meta, ou cria no mesmo formato quando não
 *     existem (fbc a partir do fbclid da URL).
 *   - O indexador stl_<sessão> vai no parâmetro da plataforma (sck, src, xcod,
 *     trk ou utm_term): na URL da página, nos links e nos formulários de
 *     checkout. A plataforma o devolve no webhook, e é ele que liga a compra à
 *     visita — o papel do Stape Store nos containers do sGTM.
 *   - Todos os parâmetros da URL de chegada (_stl_qs, 7 dias) seguem para o
 *     checkout, não só as UTMs. Links que aparecem depois do carregamento são
 *     decorados por um MutationObserver.
 *   - pageview quando o DOM carrega; checkout_click (InitiateCheckout) quando a
 *     página vai para o checkout: link, formulário, window.open, botão com a
 *     URL no onclick/data-href, redirecionamento por script (Navigation API)
 *     ou sentinel('checkout', url). Os dois com event_id, que o servidor usa
 *     na CAPI.
 *   - Com PIXEL configurado, carrega o pixel do Meta e dispara PageView e
 *     InitiateCheckout no navegador com o mesmo event_id da CAPI: o Meta
 *     deduplica pelo event_id.
 *   - Hotmart (XCOD_UTM): as UTMs da chegada vão também no xcod.
 *   - page_exit ao sair, com o tempo na página.
 *   - sentinel('track', 'nome', {props}) para eventos manuais.
 *   - Do Not Track ligado: não faz nada.
 *
 * Modo preview (debug web): a página aberta pelo painel com
 * ?stl_debug=<token> entra em modo debug, que dura enquanto o cookie
 * _stl_dbg (1 hora) existir — vale para as próximas páginas do site também.
 * Nele o snippet mostra um selo no canto da página e manda ao painel
 * (POST /api/t/debug) cada passo, no formato do Tag Assistant: o que
 * carregou, as variáveis, os eventos, as tags que dispararam no navegador,
 * os links decorados, os dataLayer.push da página e os erros. O /collect
 * leva o mesmo token, e o preview do servidor marca as requisições deste
 * navegador. ?stl_debug=off sai do modo.
 */

const SOURCE = `(function (w, d) {
  'use strict';
  var TID = __TID__, ENDPOINT = __ENDPOINT__, PARAM = __PARAM__, PIXEL = __PIXEL__, XCOD_UTM = __XCOD_UTM__;
  var n = w.navigator || {};
  var pending = (w.sentinel && w.sentinel.q) || [];
  if (n.doNotTrack == '1' || n.doNotTrack == 'yes' || w.doNotTrack == '1' || n.msDoNotTrack == '1') {
    w.sentinel = function () {};
    return;
  }
  if (w.__stlLoaded) return;
  w.__stlLoaded = 1;

  var YEAR = 31536000, SESSION = 1800, UTM_TTL = 604800, FB_TTL = 7776000, DBG_TTL = 3600;
  var PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ad_id'];
  var CHECKOUT = /(hotmart|kiwify|kirvano|perfectpay|payt|cakto|hub\\.la|hubla|ticto|cartpanda|ggcheckout|lastlink|eduzz|mundpay|monetizze|greenn|clkdmg|digitalmanager|assiny|doppus|frendz|herospark|kavoo|pagtrust|wiapy|wiven|yampi|checkout)/i;
  var CHECKOUT_SUB = /^(pay|payment|seguro|secure|checkout|compra|comprar|pagamento)\\./i;
  var URL_IN_TEXT = /https?:\\/\\/[^\\s'"<>()]+/g;
  var URL_ATTRS = ['onclick', 'data-href', 'data-url', 'data-link', 'formaction'];
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var DBG_TOKEN = /^[a-f0-9]{48}$/;

  function uuid() {
    var c = w.crypto, h = '', i, b;
    if (c && c.getRandomValues) {
      b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = (b[6] & 15) | 64;
      b[8] = (b[8] & 63) | 128;
      for (i = 0; i < 16; i++) {
        h += (b[i] + 256).toString(16).slice(1);
        if (i == 3 || i == 5 || i == 7 || i == 9) h += '-';
      }
      return h;
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = Math.random() * 16 | 0;
      return (ch == 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function getCookie(k) {
    var m = d.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }

  var cookieDomain;
  function setCookie(k, v, maxAge) {
    var base = k + '=' + encodeURIComponent(v) + '; max-age=' + maxAge + '; path=/; SameSite=Lax' +
      (location.protocol == 'https:' ? '; Secure' : '');
    var parts, i, dom;
    if (cookieDomain === undefined) {
      cookieDomain = '';
      parts = location.hostname.split('.');
      for (i = parts.length - 2; i >= 0; i--) {
        dom = parts.slice(i).join('.');
        d.cookie = base + '; domain=' + dom;
        if (getCookie(k) === v) { cookieDomain = dom; return; }
      }
    }
    d.cookie = base + (cookieDomain ? '; domain=' + cookieDomain : '');
  }

  function urlParam(s, k) {
    var m = s.match(new RegExp('[?&]' + k + '=([^&#]*)'));
    if (!m || !m[1]) return null;
    try { return decodeURIComponent(m[1].replace(/\\+/g, ' ')); } catch (e) { return m[1]; }
  }

  // ---- Modo preview -------------------------------------------------------
  var dbg = null, dbgQueue = [], dbgTimer = null, dbgBadge = null, dbgCount = 0, dbgState = 'conectando';
  var DBG_ENDPOINT = ENDPOINT.replace(/\\/collect$/, '/debug');

  function dropDebugParam() {
    if (!w.history || !history.replaceState || location.search.indexOf('stl_debug=') < 0) return;
    var next = location.href.replace(/([?&])stl_debug=[^&#]*&?/, '$1').replace(/[?&](#|$)/, '$1');
    try { history.replaceState(history.state, '', next); } catch (e) {}
  }

  (function () {
    var p = urlParam(location.search, 'stl_debug'), c;
    if (p === 'off') { setCookie('_stl_dbg', '', 0); dropDebugParam(); return; }
    if (p && DBG_TOKEN.test(p)) { dbg = p; setCookie('_stl_dbg', p, DBG_TTL); dropDebugParam(); return; }
    c = getCookie('_stl_dbg');
    if (c && DBG_TOKEN.test(c)) dbg = c;
  })();

  function badge() {
    if (!dbg || !d.body) return;
    if (!dbgBadge) {
      dbgBadge = d.createElement('div');
      dbgBadge.setAttribute('data-stl-debug', '');
      dbgBadge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;font:12px/1.4 system-ui,sans-serif;' +
        'background:#111827;color:#f9fafb;border-radius:8px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:8px;align-items:center';
      d.body.appendChild(dbgBadge);
      dbgBadge.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-stl-close') !== null) {
          setCookie('_stl_dbg', '', 0);
          dbg = null;
          dbgBadge.parentNode.removeChild(dbgBadge);
        }
      });
    }
    var ok = dbgState === 'conectado';
    dbgBadge.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + (ok ? '#22c55e' : '#f59e0b') + '"></span>' +
      '<span>Preview · ' + dbgCount + ' mensage' + (dbgCount == 1 ? 'm' : 'ns') + ' · ' + dbgState + '</span>' +
      '<span data-stl-close style="cursor:pointer;opacity:.7;padding:0 2px" title="Sair do preview">&#x2715;</span>';
  }

  function dbgFlush(beacon) {
    if (dbgTimer) { clearTimeout(dbgTimer); dbgTimer = null; }
    if (!dbg || !dbgQueue.length) return;
    var body = JSON.stringify({ tid: TID, dbg: dbg, vid: vid, sid: sid, msgs: dbgQueue });
    dbgQueue = [];
    if (beacon && n.sendBeacon) {
      try { n.sendBeacon(DBG_ENDPOINT, body); return; } catch (e) {}
    }
    if (!w.fetch) return;
    try {
      w.fetch(DBG_ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
        .then(function (r) { return r.json(); })
        .then(function (j) { dbgState = j && j.ok ? 'conectado' : ((j && j.reason) || 'recusado'); badge(); })
        ['catch'](function () { dbgState = 'sem conexão'; badge(); });
    } catch (e) {}
  }

  function msg(type, title, data) {
    if (!dbg) return;
    data = data || {};
    data.url = location.href;
    data.t = new Date().getTime();
    data.vid = vid;
    data.sid = sid;
    dbgQueue.push({ type: type, title: title, page_id: pageId, data: data });
    dbgCount++;
    badge();
    if (!dbgTimer) dbgTimer = setTimeout(dbgFlush, 300);
  }

  function pixelTag(name, id) {
    return PIXEL
      ? { name: 'Meta Pixel — ' + name + ' (navegador)', status: pixelFailed ? 'failed' : 'fired',
          detail: pixelFailed ? 'fbevents.js não carregou: bloqueador de anúncio ou CSP da página.' : 'Pixel ' + PIXEL + ' · eventID ' + id }
      : { name: 'Meta Pixel — ' + name + ' (navegador)', status: 'not_fired', detail: 'Sem ID do pixel em Integrações.' };
  }

  function serverTag(name, id) {
    return { name: 'Enviar ao servidor → Meta CAPI — ' + name, status: 'fired', detail: 'POST ' + ENDPOINT + ' · event_id ' + id };
  }
  // -------------------------------------------------------------------------

  function readParams() {
    var out = {}, found = false, i, v;
    for (i = 0; i < PARAMS.length; i++) {
      v = urlParam(location.search, PARAMS[i]);
      if (v && v.indexOf('stl_') !== 0) { out[PARAMS[i]] = v; found = true; }
    }
    if (found) {
      setCookie('_stl_utm', JSON.stringify(out), UTM_TTL);
      return out;
    }
    try { return JSON.parse(getCookie('_stl_utm') || '{}') || {}; } catch (e) { return {}; }
  }

  function readQuery() {
    var pairs = location.search.replace(/^\\?/, '').split('&'), keep = [], i, k;
    for (i = 0; i < pairs.length; i++) {
      k = pairs[i].split('=')[0];
      if (k && k !== 'stl_debug' && pairs[i].indexOf('=stl_') < 0) keep.push(pairs[i]);
    }
    if (keep.length) {
      var qs = keep.join('&').slice(0, 1500);
      setCookie('_stl_qs', qs, UTM_TTL);
      return qs;
    }
    return getCookie('_stl_qs') || '';
  }

  var queue = [], timer = null, sid = null;
  var vid = getCookie('_stl_vid'), vidNew = !UUID.test(vid || '');
  if (vidNew) vid = uuid();
  setCookie('_stl_vid', vid, YEAR);
  var utm = readParams();
  var arrival = readQuery();

  // Nome e ID sempre em dois pedaços, para o parseXcod achar cada um no lugar.
  function pair(v) {
    v = v || '';
    return v.indexOf('|') >= 0 ? v : v + '|';
  }

  function utmXcod() {
    if (!XCOD_UTM || !(utm.utm_source || utm.utm_campaign || utm.utm_medium || utm.utm_content)) return null;
    return [utm.utm_source || '', pair(utm.utm_medium), pair(utm.utm_campaign), pair(utm.utm_content), utm.utm_term || ''].join('|');
  }

  var now0 = new Date().getTime();
  var fbp = getCookie('_fbp'), fbpFrom = 'cookie _fbp da página';
  if (!/^fb\\.\\d\\.\\d+\\.\\d+$/.test(fbp || '')) {
    fbp = 'fb.1.' + now0 + '.' + Math.floor(1000000000 + Math.random() * 8999999999);
    fbpFrom = 'criado pelo snippet';
    setCookie('_fbp', fbp, FB_TTL);
  }
  var fbc = getCookie('_fbc'), fbcFrom = fbc ? 'cookie _fbc da página' : 'sem fbclid: não há clique de anúncio';
  var fbclid = urlParam(location.search, 'fbclid');
  if (fbclid && (!fbc || fbc.slice(-fbclid.length - 1) !== '.' + fbclid)) {
    fbc = 'fb.1.' + now0 + '.' + fbclid;
    fbcFrom = 'criado do fbclid da URL';
    setCookie('_fbc', fbc, FB_TTL);
  }

  function send(body) {
    try { if (n.sendBeacon && n.sendBeacon(ENDPOINT, body)) return; } catch (e) {}
    try {
      if (w.fetch) {
        w.fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', credentials: 'include',
          headers: { 'Content-Type': 'text/plain' } })['catch'](function () {});
        return;
      }
    } catch (e) {}
    try {
      var x = new XMLHttpRequest();
      x.open('POST', ENDPOINT, true);
      x.withCredentials = true;
      x.setRequestHeader('Content-Type', 'text/plain');
      x.send(body);
    } catch (e) {}
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    var batch = queue, body = {
      tid: TID, vid: vid, sid: sid, fbp: fbp, fbc: fbc || null,
      sr: (w.screen ? w.screen.width + 'x' + w.screen.height : null),
      lang: n.language || null,
      events: batch
    };
    queue = [];
    if (dbg) body.dbg = dbg;
    send(JSON.stringify(body));
  }

  function setParam(href, value, force) {
    var hash = '', h = href.indexOf('#'), re = new RegExp('([?&])' + PARAM + '=([^&#]*)'), m;
    if (h >= 0) { hash = href.slice(h); href = href.slice(0, h); }
    m = href.match(re);
    if (m) {
      if (force || m[2].indexOf('stl_') === 0) href = href.replace(re, '$1' + PARAM + '=' + value);
    } else {
      href += (href.indexOf('?') >= 0 ? '&' : '?') + PARAM + '=' + value;
    }
    return href + hash;
  }

  function markPage() {
    if (!w.history || !history.replaceState) return;
    var next = setParam(location.href, 'stl_' + sid, PARAM === 'utm_term');
    if (next !== location.href) {
      try { history.replaceState(history.state, '', next); } catch (e) {}
    }
  }

  function touchSession() {
    var cur = getCookie('_stl_sid'), fresh = false;
    if (!UUID.test(cur || '')) {
      if (queue.length) flush();
      cur = uuid();
      fresh = true;
    }
    var changed = cur !== sid, first = sid === null;
    sid = cur;
    setCookie('_stl_sid', sid, SESSION);
    if (changed) {
      markPage();
      if (ready) scheduleDecorate();
      if (!first) msg('session', 'Nova sessão', { vars: { session_id: sid, motivo: '30 minutos sem atividade' } });
    }
    return fresh;
  }

  function enqueue(ev, now) {
    touchSession();
    queue.push(ev);
    if (now || queue.length >= 20) flush();
    else if (!timer) timer = setTimeout(flush, 2000);
  }

  var pageId = uuid().slice(0, 8), start = now0, exited = false, icSent = false, ready = false, decorateTimer = null;

  function event(type, extra) {
    var e = { type: type, url: location.href, page_id: pageId }, k;
    for (k in extra) if (extra.hasOwnProperty(k)) e[k] = extra[k];
    return e;
  }

  var pixelOn = false, pixelFailed = false, pageFbq = typeof w.fbq === 'function';
  function loadPixel() {
    if (pixelOn) return;
    pixelOn = true;
    if (typeof w.fbq !== 'function') {
      var f = w.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!w._fbq) w._fbq = f;
      f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      var s = d.createElement('script'), first = d.getElementsByTagName('script')[0];
      s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      s.onerror = function () {
        pixelFailed = true;
        msg('error', 'Pixel do Meta não carregou', {
          level: 'error',
          tags: [{ name: 'Meta Pixel (navegador)', status: 'failed', detail: 'connect.facebook.net/en_US/fbevents.js falhou: bloqueador de anúncio, CSP ou rede. A CAPI do servidor continua enviando.' }]
        });
      };
      if (first && first.parentNode) first.parentNode.insertBefore(s, first);
      else (d.head || d.documentElement).appendChild(s);
    }
    try { w.fbq('init', PIXEL, { external_id: vid }); } catch (e) {}
  }

  function mirror(name, id) {
    if (!PIXEL) return;
    try {
      loadPixel();
      w.fbq('trackSingle', PIXEL, name, {}, { eventID: id });
    } catch (e) {}
  }

  function exit() {
    if (exited) return;
    exited = true;
    var secs = Math.round((new Date().getTime() - start) / 1000);
    enqueue(event('page_exit', { duration_seconds: secs }), true);
    msg('exit', 'Saída da página', { vars: { segundos_na_pagina: secs } });
    dbgFlush(true);
  }

  function linkFor(url) {
    var a = d.createElement('a');
    a.href = url;
    return a;
  }

  function isCheckout(a, marked) {
    if (!a || !a.href || String(a.protocol).indexOf('http') !== 0) return false;
    if (marked) return true;
    return a.hostname !== location.hostname && (CHECKOUT.test(a.hostname) || CHECKOUT_SUB.test(a.hostname));
  }

  function hasKey(href, k) {
    var p = (href.split('#')[0].split('?')[1] || '').split('&'), i;
    for (i = 0; i < p.length; i++) if (p[i].split('=')[0] === k) return true;
    return false;
  }

  function decorateUrl(href) {
    var add = [], pairs = arrival ? arrival.split('&') : [], i, k, xc = utmXcod();
    href = setParam(href, 'stl_' + sid, true);
    if (xc && !hasKey(href, 'xcod')) add.push('xcod=' + encodeURIComponent(xc));
    for (i = 0; i < pairs.length; i++) {
      k = pairs[i].split('=')[0];
      if (k !== PARAM && !hasKey(href, k) && !(xc && k === 'xcod')) add.push(pairs[i]);
    }
    if (!add.length) return href;
    var hash = '', h = href.indexOf('#');
    if (h >= 0) { hash = href.slice(h); href = href.slice(0, h); }
    return href + (href.indexOf('?') >= 0 ? '&' : '?') + add.join('&') + hash;
  }

  var decorated = [];
  function decorate(a) {
    var before = a.href, next = decorateUrl(before);
    if (next !== before) {
      a.href = next;
      if (dbg && decorated.length < 20) decorated.push({ antes: before, depois: next });
    }
  }

  function checkout(url, via) {
    if (icSent) return;
    icSent = true;
    var id = uuid(), dest = String(url);
    enqueue(event('checkout_click', { event_id: id, props: { href: dest.split('?')[0] } }), true);
    mirror('InitiateCheckout', id);
    msg('checkout', 'InitiateCheckout', {
      vars: { destino: dest, detectado_por: via, indexador: PARAM + '=stl_' + sid },
      event: { event_name: 'InitiateCheckout', event_id: id },
      tags: [pixelTag('InitiateCheckout', id), serverTag('InitiateCheckout', id)]
    });
  }

  var checkoutLinks = 0;
  function decorateAll() {
    decorateTimer = null;
    var links = d.getElementsByTagName('a'), i, found = 0;
    for (i = 0; i < links.length; i++) {
      if (links[i].hasAttribute && links[i].hasAttribute('data-stl-debug')) continue;
      if (isCheckout(links[i], links[i].hasAttribute && links[i].hasAttribute('data-sentinel-checkout'))) {
        found++;
        decorate(links[i]);
      }
    }
    if (decorated.length) {
      msg('decorate', 'Links de checkout decorados', { vars: { indexador: PARAM + '=stl_' + sid, links: decorated } });
      decorated = [];
    }
    checkoutLinks = Math.max(checkoutLinks, found);
  }

  function scheduleDecorate() {
    if (!decorateTimer) decorateTimer = setTimeout(decorateAll, 50);
  }

  function checkoutInAttrs(el) {
    var i, v, urls, j, found = null;
    if (!el.getAttribute) return null;
    for (i = 0; i < URL_ATTRS.length; i++) {
      v = el.getAttribute(URL_ATTRS[i]);
      urls = v && v.match(URL_IN_TEXT);
      for (j = 0; urls && j < urls.length; j++) {
        if (!isCheckout(linkFor(urls[j]), el.hasAttribute('data-sentinel-checkout'))) continue;
        found = found || urls[j];
        v = v.split(urls[j]).join(decorateUrl(urls[j]));
        el.setAttribute(URL_ATTRS[i], v);
      }
    }
    return found;
  }

  function onClick(ev) {
    var a = ev.target, el = ev.target, url;
    while (a && a.nodeName !== 'A') a = a.parentNode;
    if (isCheckout(a, a && a.hasAttribute && a.hasAttribute('data-sentinel-checkout'))) {
      touchSession();
      decorate(a);
      checkout(a.href, 'link');
      return;
    }
    touchSession();
    for (; el && el !== d; el = el.parentNode) {
      url = checkoutInAttrs(el);
      if (url) { checkout(url, 'botão com a URL no onclick/data-href'); return; }
    }
  }

  function goCheckout(url) {
    if (!url) return;
    touchSession();
    var next = decorateUrl(linkFor(url).href);
    checkout(next, "sentinel('checkout')");
    location.href = next;
  }

  function onSubmit(ev) {
    var f = ev.target, action, input;
    if (!f || f.nodeName !== 'FORM') return;
    action = linkFor(f.getAttribute('action') || location.href);
    if (!isCheckout(action, f.hasAttribute('data-sentinel-checkout'))) return;
    touchSession();
    input = f.querySelector ? f.querySelector('input[name="' + PARAM + '"]') : null;
    if (!input) {
      input = d.createElement('input');
      input.type = 'hidden';
      input.name = PARAM;
      f.appendChild(input);
    }
    if (!input.value || input.value.indexOf('stl_') === 0 || PARAM === 'utm_term') input.value = 'stl_' + sid;
    var xc = utmXcod();
    if (xc && !(f.querySelector && f.querySelector('input[name="xcod"]'))) {
      input = d.createElement('input');
      input.type = 'hidden';
      input.name = 'xcod';
      input.value = xc;
      f.appendChild(input);
    }
    checkout(action.href, 'formulário');
  }

  function track(name, props) {
    if (!name) return;
    if (name === 'checkout_click') { checkout(location.href, "sentinel('track')"); return; }
    enqueue(event('custom', { name: String(name), props: props || null }));
    msg('custom', 'Evento: ' + String(name), {
      vars: { nome: String(name), props: props || null },
      tags: [{ name: 'Enviar ao servidor (gravado, sem CAPI)', status: 'fired', detail: 'Eventos próprios ficam na visita; só PageView, InitiateCheckout e Purchase vão ao Meta.' }]
    });
  }

  function api(cmd) {
    if (cmd === 'track') track(arguments[1], arguments[2]);
    else if (cmd === 'checkout') goCheckout(arguments[1]);
  }

  function watchDataLayer() {
    if (!dbg) return;
    var dl = w.dataLayer = w.dataLayer || [], i, orig;
    function report(o) {
      var name;
      try { name = o && typeof o === 'object' && !o.length && o.event ? String(o.event) : 'push'; } catch (e) { name = 'push'; }
      var data;
      try { data = JSON.parse(JSON.stringify(o)); } catch (e) { data = String(o); }
      msg('datalayer', 'dataLayer: ' + name, { vars: { 'dataLayer.push': data } });
    }
    for (i = 0; i < dl.length; i++) report(dl[i]);
    orig = dl.push;
    dl.push = function () {
      for (var j = 0; j < arguments.length; j++) report(arguments[j]);
      return orig.apply(dl, arguments);
    };
  }

  function pageview() {
    var ref = d.referrer || null;
    var id = uuid(), pv = event('pageview', { referrer: ref, event_id: id }), i;
    for (i = 0; i < PARAMS.length; i++) if (utm[PARAMS[i]]) pv[PARAMS[i]] = utm[PARAMS[i]];
    enqueue(pv, true);
    mirror('PageView', id);
    msg('pageview', 'PageView', {
      event: pv,
      tags: [pixelTag('PageView', id), serverTag('PageView', id)]
    });
    ready = true;
    decorateAll();
    if (dbg && !checkoutLinks) {
      msg('warning', 'Nenhum link de checkout na página', {
        level: 'warning',
        vars: { dica: "Se o botão aparece depois (vídeo) ou redireciona por script, ele é pego no clique. Botão para um domínio fora da lista? Marque com data-sentinel-checkout ou use sentinel('checkout', url)." }
      });
    }
    if (w.MutationObserver) {
      new w.MutationObserver(scheduleDecorate).observe(d.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['href']
      });
    }
  }

  var sessionFresh = touchSession();

  msg('container', 'Snippet carregado', {
    vars: {
      area: TID,
      endpoint: ENDPOINT,
      parametro_do_indexador: PARAM,
      indexador: PARAM + '=stl_' + sid,
      pixel: PIXEL || 'não configurado',
      xcod_utm: XCOD_UTM,
      visitor_id: vid + (vidNew ? ' (novo)' : ' (cookie _stl_vid)'),
      session_id: sid + (sessionFresh ? ' (nova)' : ' (cookie _stl_sid)'),
      fbp: fbp + ' — ' + fbpFrom,
      fbc: fbc ? fbc + ' — ' + fbcFrom : fbcFrom,
      utms_da_chegada: utm,
      query_levada_ao_checkout: arrival || '(nenhuma)',
      dominio_dos_cookies: cookieDomain || location.hostname,
      referrer: d.referrer || '(nenhum)',
      user_agent: n.userAgent
    },
    level: pageFbq && PIXEL ? 'warning' : undefined,
    aviso: pageFbq && PIXEL ? 'Já existe um fbq na página (pixel colado à mão?). O snippet dispara só no pixel da área, mas o PageView do código colado conta à parte.' : undefined
  });

  if (typeof w.open === 'function') {
    var open = w.open;
    w.open = function (url) {
      if (url && isCheckout(linkFor(url))) {
        touchSession();
        arguments[0] = decorateUrl(linkFor(url).href);
        checkout(arguments[0], 'window.open');
      }
      return open.apply(this, arguments);
    };
  }
  if (w.navigation && w.navigation.addEventListener) {
    w.navigation.addEventListener('navigate', function (e) {
      var url = e.destination && e.destination.url, next;
      if (!url || !isCheckout(linkFor(url))) return;
      touchSession();
      checkout(url, 'redirecionamento por script');
      next = decorateUrl(linkFor(url).href);
      if (next !== url && e.cancelable && !e.formData && !e.hashChange && e.navigationType !== 'traverse') {
        e.preventDefault();
        setTimeout(function () { location.href = next; }, 0);
      }
    });
  }

  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') exit();
    else exited = false;
  });
  w.addEventListener('pagehide', exit);
  w.addEventListener('beforeunload', exit);
  w.addEventListener('pageshow', function (e) { if (e.persisted) { exited = false; icSent = false; } });
  d.addEventListener('click', onClick, true);
  d.addEventListener('submit', onSubmit, true);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { badge(); watchDataLayer(); pageview(); });
  else { badge(); watchDataLayer(); pageview(); }

  w.sentinel = api;
  for (var q = 0; q < pending.length; q++) api.apply(null, pending[q]);
})(window, document);
`;

/**
 * Compactação mínima: tira indentação e linhas vazias. Não há comentário de
 * linha que dependa de quebra dentro do SOURCE (os "//" ficam numa linha
 * própria), então não é preciso entender a sintaxe do JS para isso — e
 * nenhum minificador de verdade vira dependência de produção.
 */
function compact(source: string): string {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}

const COMPACT = compact(SOURCE);

export interface TrackerOptions {
  /** Parâmetro que a plataforma devolve no webhook. */
  param: string;
  /** O snippet carrega e inicia este pixel, e dispara nele com o event_id da CAPI. */
  pixelId?: string | null;
  /** Hotmart: manda as UTMs da chegada no xcod, que é o que ela devolve no webhook. */
  xcodUtm?: boolean;
}

const SAFE_PIXEL = /^\d{5,20}$/;

const SAFE_PARAM = /^(sck|src|xcod|trk|utm_term)$/;

/**
 * O script pronto para uma área. Os valores entram via JSON.stringify, então
 * nada que venha da requisição consegue fechar a string e virar código. A
 * substituição usa função, e não string, porque numa string de reposição o
 * replace interpreta `$&` e afins.
 */
export function buildTrackerScript(
  workspaceId: string,
  endpoint: string,
  options: TrackerOptions = { param: 'sck' },
): string {
  const param = SAFE_PARAM.test(options.param) ? options.param : 'sck';
  const pixel = options.pixelId && SAFE_PIXEL.test(options.pixelId) ? options.pixelId : null;
  return COMPACT.replace('__TID__', () => JSON.stringify(workspaceId))
    .replace('__ENDPOINT__', () => JSON.stringify(endpoint))
    .replace('__PARAM__', () => JSON.stringify(param))
    .replace('__PIXEL__', () => JSON.stringify(pixel))
    .replace('__XCOD_UTM__', () => JSON.stringify(!!options.xcodUtm));
}

/** Resposta para área desconhecida: define sentinel() e não faz nada. */
export const NOOP_TRACKER_SCRIPT =
  '/* Sentinela: area desconhecida, rastreio desligado */\n' +
  'window.sentinel=function(){};\n';
