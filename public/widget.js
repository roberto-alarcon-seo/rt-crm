/* RT CRM Web Chat Widget — v1.1
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
  var displayMode = 'floating'; // 'floating' | 'sidebar'
  var pendingCapture = null;    // 'email' | 'phone' | null
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)].join(',');
  }

  function esc(t) {
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function q(id) { return document.getElementById(id); }

  // ── Icon SVGs ─────────────────────────────────────────────────────────────
  var SVGS = {
    chat: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v4"/><path d="M2 19h4"/></svg>',
    bot: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
  };

  function getIconHTML(iconName, logoUrl, size) {
    size = size || 26;
    if (iconName === 'logo' && logoUrl) {
      return '<img src="' + logoUrl + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain">';
    }
    var svg = SVGS[iconName] || SVGS.chat;
    return svg.replace(/(<svg[^>]*?)>/, '$1 style="width:' + size + 'px;height:' + size + 'px">');
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS(color, pos, mode, theme) {
    if (document.getElementById('rtw-css')) return;
    var rgb = toRgb(color);
    var isLeft = pos === 'bottom-left';
    var edgeRight = isLeft ? 'auto' : '24px';
    var edgeLeft  = isLeft ? '24px' : 'auto';
    var dark = theme === 'dark';
    var s = document.createElement('style');
    s.id = 'rtw-css';

    // Color scheme
    var bgMsgs   = dark ? '#1a1a2e' : '#f6f7fb';
    var bgBot    = dark ? '#2d2d3d' : '#fff';
    var bgFoot   = dark ? '#1e1e30' : '#fff';
    var bgInp    = dark ? '#2d2d3d' : '#fff';
    var borderInp= dark ? '#3d3d55' : '#e2e2e6';
    var txtMain  = dark ? '#e8e8f0' : '#1a1a2e';
    var txtMuted = dark ? '#9999b3' : '#888';
    var borderFt = dark ? '#2d2d3d' : '#eff0f3';
    var dotClr   = dark ? '#555580' : '#c0c0c0';
    var creditTxt= dark ? '#555580' : '#bbb';
    var chipBg   = dark ? '#2d2d3d' : '#fff';

    var shared = [
      '#rtw-root *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0}',
      '#rtw-hdr{background:' + color + ';color:#fff;padding:13px 15px;display:flex;align-items:center;gap:10px;flex-shrink:0}',
      '#rtw-av{width:36px;height:36px;background:rgba(255,255,255,.22);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}',
      '#rtw-av img{width:26px;height:26px;object-fit:contain}',
      '#rtw-hdr-name{font-weight:600;font-size:14.5px;line-height:1.2}',
      '#rtw-hdr-sub{font-size:11px;opacity:.85;line-height:1}',
      '#rtw-hdr-info{display:flex;flex-direction:column;gap:2px}',
      '#rtw-online{font-size:11px;opacity:.75;line-height:1}',
      '#rtw-close{margin-left:auto;background:none;border:none;cursor:pointer;color:#fff;opacity:.8;display:flex;padding:4px;border-radius:4px}',
      '#rtw-close:hover{opacity:1}',
      '#rtw-msgs{flex:1;overflow-y:auto;padding:14px 13px;display:flex;flex-direction:column;gap:9px;background:' + bgMsgs + ';scroll-behavior:smooth}',
      '.rtw-msg-wrap{display:flex;flex-direction:column;align-self:flex-start;max-width:82%}',
      '.rtw-m{padding:12px 16px;border-radius:15px;font-size:13.5px;line-height:1.48;word-break:break-word;white-space:pre-wrap}',
      '.rtw-bot{background:' + bgBot + ';color:' + txtMain + ';box-shadow:0 1px 4px rgba(0,0,0,.09);border-bottom-left-radius:4px}',
      '.rtw-usr{background:' + color + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px;max-width:82%}',
      '.rtw-dot{display:flex;gap:4px;padding:10px 14px;align-self:flex-start}',
      '.rtw-dot span{width:7px;height:7px;background:' + dotClr + ';border-radius:50%;animation:rtw-b 1.2s infinite}',
      '.rtw-dot span:nth-child(2){animation-delay:.2s}.rtw-dot span:nth-child(3){animation-delay:.4s}',
      '@keyframes rtw-b{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}',
      // Feedback buttons
      '.rtw-fb{display:none;gap:2px;padding:2px 0 0 2px}',
      '.rtw-msg-wrap:hover .rtw-fb{display:flex}',
      '.rtw-fb-btn{background:none;border:none;cursor:pointer;font-size:13px;padding:2px 5px;border-radius:6px;opacity:.55;transition:opacity .15s,background .15s;line-height:1}',
      '.rtw-fb-btn:hover{opacity:1;background:' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + '}',
      // Chips (AI suggestions)
      '#rtw-chips{display:flex;flex-wrap:wrap;gap:5px;padding:8px 13px 4px;background:' + bgMsgs + ';flex-shrink:0;min-height:0}',
      '.rtw-chip{background:' + chipBg + ';border:1.5px solid ' + color + ';color:' + color + ';border-radius:20px;padding:5px 11px;font-size:11.5px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;line-height:1.3}',
      '.rtw-chip:hover{background:' + color + ';color:#fff}',
      // Product chips
      '#rtw-products{display:flex;flex-wrap:wrap;gap:6px;padding:8px 13px 2px;background:' + bgMsgs + ';flex-shrink:0}',
      '.rtw-prod{display:inline-flex;align-items:center;gap:5px;border:none;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:500;cursor:pointer;transition:opacity .15s,transform .1s;white-space:nowrap;line-height:1.3;color:#fff;text-decoration:none}',
      '.rtw-prod:hover{opacity:.85;transform:translateY(-1px)}',
      '.rtw-prod-icon{font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:rgba(255,255,255,.25);border-radius:50%;font-size:10px;font-weight:700}',
      // CTA buttons
      '#rtw-ctas{display:flex;flex-wrap:wrap;gap:6px;padding:6px 13px 8px;background:' + bgMsgs + ';flex-shrink:0}',
      '.rtw-cta{display:inline-flex;align-items:center;gap:5px;border:1.5px solid ' + color + ';background:transparent;color:' + color + ';border-radius:22px;padding:6px 13px;font-size:12px;font-weight:500;cursor:pointer;transition:background .15s,color .15s;text-decoration:none;line-height:1.3;white-space:nowrap}',
      '.rtw-cta:hover{background:' + color + ';color:#fff}',
      '.rtw-cta-icon{font-size:14px;line-height:1}',
      // Footer
      '#rtw-foot{padding:9px 11px;background:' + bgFoot + ';border-top:1px solid ' + borderFt + ';flex-shrink:0}',
      '#rtw-hint{font-size:11.5px;color:' + txtMuted + ';margin-bottom:5px;display:none}',
      '#rtw-row{display:flex;gap:7px;align-items:flex-end}',
      '#rtw-inp{flex:1;border:1.5px solid ' + borderInp + ';border-radius:22px;padding:9px 13px;font-size:13px;outline:none;resize:none;min-height:38px;max-height:80px;overflow-y:auto;line-height:1.4;transition:border-color .15s;background:' + bgInp + ';color:' + txtMain + '}',
      '#rtw-inp::placeholder{color:' + txtMuted + '}',
      '#rtw-inp:focus{border-color:' + color + '}',
      '#rtw-send{width:38px;height:38px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}',
      '#rtw-send:hover{opacity:.85}',
      '#rtw-send svg{width:15px;height:15px;fill:#fff}',
      '#rtw-send:disabled{opacity:.45;cursor:not-allowed}',
      '#rtw-credit{text-align:center;font-size:10px;color:' + creditTxt + ';padding:3px 0 6px;background:' + bgFoot + '}',
    ];

    var modeCSS = [];
    if (mode === 'sidebar') {
      var tabRight = isLeft ? 'auto' : '0';
      var tabLeft  = isLeft ? '0'    : 'auto';
      var tabBr    = isLeft ? '0 10px 10px 0' : '10px 0 0 10px';
      var tabShadow = isLeft ? '3px 0 16px rgba(' + rgb + ',.45)' : '-3px 0 16px rgba(' + rgb + ',.45)';
      var tabHover  = isLeft ? 'translateY(-50%) translateX(3px)' : 'translateY(-50%) translateX(-3px)';
      modeCSS = [
        '#rtw-tab{position:fixed;top:50%;right:' + tabRight + ';left:' + tabLeft + ';transform:translateY(-50%);background:' + color + ';border:none;border-radius:' + tabBr + ';padding:14px 10px;cursor:pointer;z-index:999998;display:flex;flex-direction:column;align-items:center;gap:8px;box-shadow:' + tabShadow + ';transition:transform .2s}',
        '#rtw-tab:hover{transform:' + tabHover + '}',
        '#rtw-sidebar{position:fixed;top:0;' + (isLeft ? 'left' : 'right') + ':0;width:380px;max-width:100vw;height:100%;height:100dvh;background:#fff;z-index:999999;box-shadow:' + (isLeft ? '6px' : '-6px') + ' 0 30px rgba(0,0,0,.18);display:flex;flex-direction:column;transform:translateX(' + (isLeft ? '-100%' : '100%') + ');transition:transform .3s cubic-bezier(.4,0,.2,1)}',
        '#rtw-sidebar.open{transform:translateX(0)}',
        '@media(max-width:480px){#rtw-sidebar{width:100%}#rtw-tab{display:none}}',
      ];
    } else {
      modeCSS = [
        '#rtw-bubble{position:fixed;bottom:24px;right:' + edgeRight + ';left:' + edgeLeft + ';width:56px;height:56px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;z-index:999998;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(' + rgb + ',.45);transition:transform .2s,box-shadow .2s}',
        '#rtw-bubble:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(' + rgb + ',.55)}',
        '#rtw-win{position:fixed;bottom:92px;right:' + edgeRight + ';left:' + edgeLeft + ';width:360px;height:530px;background:#fff;border-radius:18px;z-index:999999;box-shadow:0 10px 50px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .25s;transform-origin:bottom ' + (isLeft ? 'left' : 'right') + '}',
        '#rtw-win.rtw-hide{transform:scale(.85) translateY(8px);opacity:0;pointer-events:none}',
        '@media(max-width:480px){#rtw-win{right:0!important;left:0!important;bottom:0;width:100%;height:100%;border-radius:0}#rtw-bubble{bottom:16px;right:' + edgeRight + ';left:' + edgeLeft + '}}',
      ];
    }

    s.textContent = shared.concat(modeCSS).join('');
    document.head.appendChild(s);
  }

  // ── Chat content HTML (shared between floating and sidebar) ───────────────
  function chatContentHTML(name, iconName, logoUrl, poweredByText, subtitle, ctaButtons, productChips) {
    var avatarHTML = getIconHTML(iconName === 'logo' ? 'logo' : iconName, logoUrl, 22);
    var creditLabel = poweredByText ? 'Powered by ' + esc(poweredByText) : 'Powered by RT CRM';
    var subtitleHTML = subtitle
      ? '<div id="rtw-hdr-sub">' + esc(subtitle) + '</div><div id="rtw-online">● En línea</div>'
      : '<div id="rtw-online">● En línea</div>';

    // Product chips — shown always, before messages
    var productsHTML = '';
    if (productChips && productChips.length) {
      productsHTML = '<div id="rtw-products">' +
        productChips.map(function (chip) {
          var iconHTML = chip.icon
            ? '<span class="rtw-prod-icon">' + esc(chip.icon) + '</span>'
            : '';
          var style = 'background:' + esc(chip.color || '#6366F1');
          if (chip.url) {
            return '<a href="' + esc(chip.url) + '" target="_blank" rel="noopener" class="rtw-prod" style="' + style + '">' + iconHTML + esc(chip.label || '') + '</a>';
          }
          return '<button class="rtw-prod rtw-prod-msg" data-msg="' + esc(chip.label || '') + '" style="' + style + '">' + iconHTML + esc(chip.label || '') + '</button>';
        }).join('') +
      '</div>';
    }

    // CTA buttons — shown always, after chips
    var ctasHTML = '';
    if (ctaButtons && ctaButtons.length) {
      ctasHTML = '<div id="rtw-ctas">' +
        ctaButtons.map(function (btn) {
          return '<a href="' + esc(btn.url || '#') + '" target="_blank" rel="noopener" class="rtw-cta">' +
            (btn.icon ? '<span class="rtw-cta-icon">' + esc(btn.icon) + '</span>' : '') +
            esc(btn.label || '') +
          '</a>';
        }).join('') +
      '</div>';
    }

    return (
      '<div id="rtw-hdr">' +
        '<div id="rtw-av">' + avatarHTML + '</div>' +
        '<div id="rtw-hdr-info"><div id="rtw-hdr-name">' + esc(name) + '</div>' + subtitleHTML + '</div>' +
        '<button id="rtw-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
      '</div>' +
      productsHTML +
      '<div id="rtw-msgs"></div>' +
      '<div id="rtw-chips"></div>' +
      ctasHTML +
      '<div id="rtw-foot">' +
        '<div id="rtw-hint"></div>' +
        '<div id="rtw-row">' +
          '<textarea id="rtw-inp" placeholder="Escribe tu mensaje…" rows="1"></textarea>' +
          '<button id="rtw-send" aria-label="Enviar"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div id="rtw-credit">' + creditLabel + '</div>'
    );
  }

  // ── DOM builders ──────────────────────────────────────────────────────────
  function buildDOM(name, logoUrl, iconName, mode, poweredByText, subtitle, ctaButtons, productChips) {
    iconName = iconName || 'logo';
    mode = mode || 'floating';
    displayMode = mode;

    var root = document.createElement('div');
    root.id = 'rtw-root';
    document.body.appendChild(root);

    if (mode === 'sidebar') {
      var tab = document.createElement('button');
      tab.id = 'rtw-tab';
      tab.setAttribute('aria-label', 'Abrir chat');
      tab.innerHTML = getIconHTML(iconName, logoUrl, 24);
      tab.addEventListener('click', toggle);
      root.appendChild(tab);

      var panel = document.createElement('div');
      panel.id = 'rtw-sidebar';
      panel.innerHTML = chatContentHTML(name, iconName, logoUrl, poweredByText, subtitle, ctaButtons, productChips);
      root.appendChild(panel);
    } else {
      var bubble = document.createElement('button');
      bubble.id = 'rtw-bubble';
      bubble.setAttribute('aria-label', 'Abrir chat');
      bubble.innerHTML = getIconHTML(iconName, logoUrl, 28);
      bubble.addEventListener('click', toggle);
      root.appendChild(bubble);

      var win = document.createElement('div');
      win.id = 'rtw-win';
      win.className = 'rtw-hide';
      win.innerHTML = chatContentHTML(name, iconName, logoUrl, poweredByText, subtitle, ctaButtons, productChips);
      root.appendChild(win);
    }

    q('rtw-close').addEventListener('click', toggle);
    q('rtw-send').addEventListener('click', function () { submit(); });
    q('rtw-inp').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    q('rtw-inp').addEventListener('input', autoResize);

    // Product chips that send a message on click
    var prodBtns = document.querySelectorAll('#rtw-root .rtw-prod-msg');
    prodBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var msg = btn.getAttribute('data-msg');
        if (msg) {
          if (!isOpen) toggle();
          submit(msg);
        }
      });
    });
  }

  function autoResize() {
    var el = q('rtw-inp');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }

  // ── Message UI ────────────────────────────────────────────────────────────
  function addMsg(role, text) {
    var box = q('rtw-msgs');
    if (!box) return;
    if (role === 'bot') {
      var wrap = document.createElement('div');
      wrap.className = 'rtw-msg-wrap';
      var bubble = document.createElement('div');
      bubble.className = 'rtw-m rtw-bot';
      bubble.textContent = text;
      wrap.appendChild(bubble);
      // Feedback bar
      var fb = document.createElement('div');
      fb.className = 'rtw-fb';
      var msgText = text;
      [['👍','Útil'], ['👎','No útil'], ['📋','Copiar']].forEach(function (pair) {
        var btn = document.createElement('button');
        btn.className = 'rtw-fb-btn';
        btn.title = pair[1];
        btn.textContent = pair[0];
        if (pair[0] === '📋') {
          btn.addEventListener('click', function () {
            navigator.clipboard && navigator.clipboard.writeText(msgText);
            btn.textContent = '✅';
            setTimeout(function () { btn.textContent = '📋'; }, 1500);
          });
        } else {
          btn.addEventListener('click', function () {
            console.log('[RT Widget] feedback:', pair[0] === '👍' ? 'positive' : 'negative', msgText.slice(0, 60));
            btn.style.opacity = '1';
          });
        }
        fb.appendChild(btn);
      });
      wrap.appendChild(fb);
      box.appendChild(wrap);
    } else {
      var d = document.createElement('div');
      d.className = 'rtw-m rtw-usr';
      d.textContent = text;
      box.appendChild(d);
    }
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

  // ── Toggle open/close ─────────────────────────────────────────────────────
  function toggle() {
    isOpen = !isOpen;
    if (displayMode === 'sidebar') {
      var panel = q('rtw-sidebar');
      if (panel) panel.classList.toggle('open', isOpen);
    } else {
      var win = q('rtw-win');
      if (win) win.classList.toggle('rtw-hide', !isOpen);
    }
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
      if (!data.response) console.error('[RT Widget] error:', JSON.stringify(data));
      addMsg('bot', data.response || '(sin respuesta)');
      if (data.suggestions && data.suggestions.length) setChips(data.suggestions);
      if (data.detected) {
        if (data.detected.request_email && !captured.email) {
          pendingCapture = 'email';
          var h3 = q('rtw-hint');
          if (h3) { h3.textContent = 'Escribe tu correo electrónico:'; h3.style.display = 'block'; }
        } else if (data.detected.request_phone && !captured.phone) {
          pendingCapture = 'phone';
          var h4 = q('rtw-hint');
          if (h4) { h4.textContent = 'Escribe tu número de WhatsApp (con código de país):'; h4.style.display = 'block'; }
        }
      }
    }).catch(function () {
      hideDots();
      addMsg('bot', 'Hubo un problema al procesar tu mensaje. Intenta de nuevo.');
    }).finally(function () {
      isBusy = false;
      var b2 = q('rtw-send');
      if (b2) b2.disabled = false;
      var i2 = q('rtw-inp');
      if (i2) i2.focus();
    });
  }

  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

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

        var color         = config.primary_color    || '#6366F1';
        var pos           = config.position         || 'bottom-right';
        var name          = config.greeting_name    || 'Asistente';
        var logoUrl       = config.logo_url         || null;
        var iconName      = config.bubble_icon      || 'logo';
        var mode          = config.display_mode     || 'floating';
        var poweredByText = config.powered_by_text  || 'RT CRM';
        var subtitle      = config.header_subtitle  || '';
        var ctaButtons    = config.cta_buttons      || [];
        var productChips  = config.product_chips    || [];
        var theme         = config.theme            || 'light';

        injectCSS(color, pos, mode, theme);
        buildDOM(name, logoUrl, iconName, mode, poweredByText, subtitle, ctaButtons, productChips);

        if (history.length > 0) {
          history.forEach(function (m) { addMsg(m.role === 'user' ? 'user' : 'bot', m.content); });
          if (mode === 'sidebar') toggle(); // auto-open sidebar if resuming session
        } else {
          if (config.greeting_message) addMsg('bot', config.greeting_message);
          if (config.initial_suggestions && config.initial_suggestions.length) {
            setChips(config.initial_suggestions);
          }
          if (mode === 'floating' && window.innerWidth > 768) {
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
