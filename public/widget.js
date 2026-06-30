/* RT CRM Web Chat Widget — v1.0
 * Embed: <script src="/widget.js" data-widget-token="TOKEN" data-api-url="https://..." async></script>
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var scriptTag = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var WIDGET_TOKEN = scriptTag.getAttribute('data-widget-token');
  var API_URL = (scriptTag.getAttribute('data-api-url') || '').replace(/\/$/, '');

  if (!WIDGET_TOKEN || !API_URL) {
    console.warn('[RT Widget] Se requieren data-widget-token y data-api-url.');
    return;
  }

  var SESSION_KEY = 'rtw_' + WIDGET_TOKEN;

  // ── State ─────────────────────────────────────────────────────────────────
  var sessionToken = null;
  var config = null;
  var history = [];
  var isOpen = false;
  var isBusy = false;
  var pendingCapture = null; // 'email' | 'phone' | null
  var captured = { name: null, email: null, phone: null };

  // ── UTM helpers ───────────────────────────────────────────────────────────
  function utms() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source'),
      utm_medium: p.get('utm_medium'),
      utm_campaign: p.get('utm_campaign'),
      utm_content: p.get('utm_content'),
      utm_term: p.get('utm_term'),
      landing_page: window.location.href,
      referrer: document.referrer || null,
    };
  }

  // ── API ───────────────────────────────────────────────────────────────────
  function post(path, body) {
    return fetch(API_URL + '/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  // ── Color helpers ─────────────────────────────────────────────────────────
  function toRgb(hex) {
    hex = hex.replace('#', '');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ].join(',');
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS(color, pos) {
    if (document.getElementById('rtw-css')) return;
    var rgb = toRgb(color);
    var right = pos !== 'bottom-left' ? '24px' : 'auto';
    var left  = pos === 'bottom-left'  ? '24px' : 'auto';
    var s = document.createElement('style');
    s.id = 'rtw-css';
    s.textContent = [
      '#rtw-root *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:0}',
      '#rtw-bubble{position:fixed;bottom:24px;right:' + right + ';left:' + left + ';width:56px;height:56px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;z-index:999998;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(' + rgb + ',.45);transition:transform .2s,box-shadow .2s}',
      '#rtw-bubble:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(' + rgb + ',.55)}',
      '#rtw-bubble svg{width:26px;height:26px;fill:#fff}',
      '#rtw-win{position:fixed;bottom:92px;right:' + right + ';left:' + left + ';width:360px;height:530px;background:#fff;border-radius:18px;z-index:999999;box-shadow:0 10px 50px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .25s;transform-origin:bottom ' + (pos === 'bottom-left' ? 'left' : 'right') + '}',
      '#rtw-win.rtw-hide{transform:scale(.85) translateY(8px);opacity:0;pointer-events:none}',
      '#rtw-hdr{background:' + color + ';color:#fff;padding:13px 15px;display:flex;align-items:center;gap:10px;flex-shrink:0}',
      '#rtw-av{width:36px;height:36px;background:rgba(255,255,255,.22);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '#rtw-av svg{width:20px;height:20px;fill:#fff}',
      '#rtw-hdr-name{font-weight:600;font-size:14.5px;line-height:1.2}',
      '#rtw-hdr-sub{font-size:11px;opacity:.85;line-height:1}',
      '#rtw-close{margin-left:auto;background:none;border:none;cursor:pointer;color:#fff;opacity:.8;display:flex;padding:2px;border-radius:4px}',
      '#rtw-close:hover{opacity:1}',
      '#rtw-msgs{flex:1;overflow-y:auto;padding:14px 13px;display:flex;flex-direction:column;gap:9px;background:#f6f7fb;scroll-behavior:smooth}',
      '.rtw-m{max-width:82%;padding:9px 13px;border-radius:15px;font-size:13.5px;line-height:1.48;word-break:break-word;white-space:pre-wrap}',
      '.rtw-bot{background:#fff;color:#1a1a2e;align-self:flex-start;box-shadow:0 1px 4px rgba(0,0,0,.09);border-bottom-left-radius:4px}',
      '.rtw-usr{background:' + color + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}',
      '.rtw-dot{display:flex;gap:4px;padding:10px 14px;align-self:flex-start}',
      '.rtw-dot span{width:7px;height:7px;background:#c0c0c0;border-radius:50%;animation:rtw-b 1.2s infinite}',
      '.rtw-dot span:nth-child(2){animation-delay:.2s}',
      '.rtw-dot span:nth-child(3){animation-delay:.4s}',
      '@keyframes rtw-b{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}',
      '#rtw-chips{display:flex;flex-wrap:wrap;gap:5px;padding:8px 13px 4px;background:#f6f7fb;flex-shrink:0}',
      '.rtw-chip{background:#fff;border:1.5px solid ' + color + ';color:' + color + ';border-radius:20px;padding:5px 11px;font-size:11.5px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;line-height:1.3}',
      '.rtw-chip:hover{background:' + color + ';color:#fff}',
      '#rtw-foot{padding:9px 11px 9px;background:#fff;border-top:1px solid #eff0f3;flex-shrink:0}',
      '#rtw-hint{font-size:11.5px;color:#888;margin-bottom:5px;display:none}',
      '#rtw-row{display:flex;gap:7px;align-items:flex-end}',
      '#rtw-inp{flex:1;border:1.5px solid #e2e2e6;border-radius:22px;padding:9px 13px;font-size:13px;outline:none;resize:none;min-height:38px;max-height:80px;overflow-y:auto;line-height:1.4;transition:border-color .15s}',
      '#rtw-inp:focus{border-color:' + color + '}',
      '#rtw-send{width:38px;height:38px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}',
      '#rtw-send:hover{opacity:.85}',
      '#rtw-send svg{width:15px;height:15px;fill:#fff}',
      '#rtw-send:disabled{opacity:.45;cursor:not-allowed}',
      '#rtw-credit{text-align:center;font-size:10px;color:#bbb;padding:3px 0 6px;background:#fff}',
      '@media(max-width:480px){#rtw-win{right:0!important;left:0!important;bottom:0;width:100%;height:100%;border-radius:0;transform-origin:bottom center}#rtw-bubble{bottom:16px;right:' + right + ';left:' + left + '}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function q(id) { return document.getElementById(id); }

  function buildDOM(name) {
    var root = document.createElement('div');
    root.id = 'rtw-root';

    // Bubble
    var bubble = document.createElement('button');
    bubble.id = 'rtw-bubble';
    bubble.setAttribute('aria-label', 'Abrir chat');
    bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
    bubble.addEventListener('click', toggle);

    // Window
    var win = document.createElement('div');
    win.id = 'rtw-win';
    win.className = 'rtw-hide';
    win.innerHTML =
      '<div id="rtw-hdr">' +
        '<div id="rtw-av"><svg viewBox="0 0 24 24"><path d="M9.5 15.5c.83 0 1.5-.67 1.5-1.5S10.33 12.5 9.5 12.5 8 13.17 8 14s.67 1.5 1.5 1.5zm5 0c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg></div>' +
        '<div><div id="rtw-hdr-name">' + esc(name) + '</div><div id="rtw-hdr-sub">● En línea</div></div>' +
        '<button id="rtw-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
      '</div>' +
      '<div id="rtw-msgs"></div>' +
      '<div id="rtw-chips"></div>' +
      '<div id="rtw-foot">' +
        '<div id="rtw-hint"></div>' +
        '<div id="rtw-row">' +
          '<textarea id="rtw-inp" placeholder="Escribe tu mensaje…" rows="1"></textarea>' +
          '<button id="rtw-send" aria-label="Enviar"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div id="rtw-credit">Powered by RT CRM</div>';

    root.appendChild(bubble);
    root.appendChild(win);
    document.body.appendChild(root);

    q('rtw-close').addEventListener('click', toggle);
    q('rtw-send').addEventListener('click', function () { submit(); });
    q('rtw-inp').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    q('rtw-inp').addEventListener('input', autoResize);
  }

  function autoResize() {
    var el = q('rtw-inp');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function addMsg(role, text) {
    var box = q('rtw-msgs');
    if (!box) return;
    var d = document.createElement('div');
    d.className = 'rtw-m ' + (role === 'user' ? 'rtw-usr' : 'rtw-bot');
    d.textContent = text;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function showDots() {
    var box = q('rtw-msgs');
    if (!box || q('rtw-typing')) return;
    var d = document.createElement('div');
    d.id = 'rtw-typing';
    d.className = 'rtw-dot';
    d.innerHTML = '<span></span><span></span><span></span>';
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function hideDots() {
    var el = q('rtw-typing');
    if (el) el.remove();
  }

  function setChips(arr) {
    var box = q('rtw-chips');
    if (!box) return;
    box.innerHTML = '';
    (arr || []).forEach(function (txt) {
      var btn = document.createElement('button');
      btn.className = 'rtw-chip';
      btn.textContent = txt;
      btn.addEventListener('click', function () { submit(txt); });
      box.appendChild(btn);
    });
  }

  function toggle() {
    var win = q('rtw-win');
    if (!win) return;
    isOpen = !isOpen;
    win.classList.toggle('rtw-hide', !isOpen);
    if (isOpen) {
      var box = q('rtw-msgs');
      if (box) box.scrollTop = box.scrollHeight;
      setTimeout(function () { var inp = q('rtw-inp'); if (inp) inp.focus(); }, 150);
    }
  }

  // ── Send flow ─────────────────────────────────────────────────────────────
  function submit(forceText) {
    var inp = q('rtw-inp');
    var text = forceText || (inp ? inp.value.trim() : '');
    if (!text || isBusy) return;
    if (inp && !forceText) { inp.value = ''; inp.style.height = 'auto'; }

    // Check if this message is a data capture response
    if (pendingCapture === 'email' && isEmail(text) && !captured.email) {
      captured.email = text;
      pendingCapture = null;
      var hint = q('rtw-hint');
      if (hint) hint.style.display = 'none';
    } else if (pendingCapture === 'phone' && text.length >= 7 && !captured.phone) {
      captured.phone = text.replace(/\s/g, '');
      pendingCapture = null;
      var hint2 = q('rtw-hint');
      if (hint2) hint2.style.display = 'none';
    }

    addMsg('user', text);
    setChips([]);
    showDots();
    isBusy = true;
    var btn = q('rtw-send');
    if (btn) btn.disabled = true;

    post('widget-chat', {
      session_token: sessionToken,
      message: text,
      visitor_name: captured.name,
      visitor_email: captured.email,
      visitor_phone: captured.phone,
    }).then(function (data) {
      hideDots();
      addMsg('bot', data.response || '(sin respuesta)');

      if (data.suggestions && data.suggestions.length) {
        setChips(data.suggestions);
      }

      // Show capture prompts if AI requests them
      if (data.detected) {
        if (data.detected.request_email && !captured.email) {
          pendingCapture = 'email';
          var hint3 = q('rtw-hint');
          if (hint3) { hint3.textContent = '📧 Escribe tu correo electrónico:'; hint3.style.display = 'block'; }
        } else if (data.detected.request_phone && !captured.phone) {
          pendingCapture = 'phone';
          var hint4 = q('rtw-hint');
          if (hint4) { hint4.textContent = '📱 Escribe tu número de WhatsApp (con código de país):'; hint4.style.display = 'block'; }
        }
      }
    }).catch(function () {
      hideDots();
      addMsg('bot', 'Hubo un problema al procesar tu mensaje. Intenta de nuevo.');
    }).finally(function () {
      isBusy = false;
      var btn2 = q('rtw-send');
      if (btn2) btn2.disabled = false;
      var inp2 = q('rtw-inp');
      if (inp2) inp2.focus();
    });
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    var saved = null;
    try { saved = localStorage.getItem(SESSION_KEY); } catch (_) {}

    post('widget-init', Object.assign({ widget_token: WIDGET_TOKEN, session_token: saved }, utms()))
      .then(function (data) {
        if (!data || data.error) { console.warn('[RT Widget]', data && data.error); return; }

        sessionToken = data.session_token;
        try { localStorage.setItem(SESSION_KEY, sessionToken); } catch (_) {}

        config = data.config || {};
        history = data.messages || [];

        var color = config.primary_color || '#6366F1';
        var pos   = config.position || 'bottom-right';
        var name  = config.greeting_name || 'Asistente';

        injectCSS(color, pos);
        buildDOM(name);

        // Render existing history
        if (history.length > 0) {
          history.forEach(function (m) { addMsg(m.role === 'user' ? 'user' : 'bot', m.content); });
        } else {
          // Show greeting + initial chips
          if (config.greeting_message) addMsg('bot', config.greeting_message);
          if (config.initial_suggestions && config.initial_suggestions.length) {
            setChips(config.initial_suggestions);
          }
          // Auto-open after 4s on desktop if fresh session
          if (window.innerWidth > 768) {
            setTimeout(function () { if (!isOpen) toggle(); }, 4000);
          }
        }
      })
      .catch(function (e) { console.warn('[RT Widget] Init error', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
