(function () {
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'he');

  var PHONE = '972526618395';
  var rows = [].slice.call(document.querySelectorAll('#menuList [data-id]'));
  var rowById = {};
  var qty = {};
  var state = { sub: 0, count: 0, fee: 0, hasDoro: false };
  var attempted = false;
  var inCheckout = false;

  function money(n) { return n + ' ₪'; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  var deliver = $('mDeliver'), pickup = $('mPickup'), town = $('town');
  var lines = $('lines'), rlines = $('rlines'), out = $('out'), copyOrder = $('copyOrder'), wa = $('waBtn');

  // menu steppers
  rows.forEach(function (row) {
    var id = row.getAttribute('data-id');
    qty[id] = 0;
    rowById[id] = row;
    paintRow(row, id);
    row.querySelector('.qty').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) change(id, b.classList.contains('minus') ? -1 : 1, 'menu');
    });
  });

  // cart steppers
  lines.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    var box = e.target.closest('.qty');
    if (b && box) change(box.getAttribute('data-id'), b.classList.contains('minus') ? -1 : 1, 'cart');
  });

  function paintRow(row, id) {
    var box = row.querySelector('.qty');
    var q = qty[id];
    var name = esc(row.getAttribute('data-name'));
    row.classList.toggle('has', q > 0);
    if (q === 0) {
      box.innerHTML = '<button type="button" class="add" aria-label="הוספת ' + name + '">+</button>';
    } else {
      box.innerHTML = '<button type="button" class="minus" aria-label="הפחתת ' + name + '">−</button><output>' + q + '</output><button type="button" class="add" aria-label="הוספת ' + name + '">+</button>';
    }
  }

  function triggerCartBump() {
    var cartEl = $('cart');
    var mbarEl = $('mbar');
    cartEl.classList.remove('bump');
    mbarEl.classList.remove('bump');
    void cartEl.offsetWidth;
    cartEl.classList.add('bump');
    mbarEl.classList.add('bump');
  }

  function change(id, d, from) {
    qty[id] = Math.max(0, Math.min(20, qty[id] + d));
    paintRow(rowById[id], id);
    render();

    if (d > 0) {
      triggerCartBump();
    }

    var scope = from === 'cart' ? lines.querySelector('.qty[data-id="' + id + '"]') : rowById[id].querySelector('.qty');
    var btn = scope && (scope.querySelector(d > 0 ? '.add' : '.minus') || scope.querySelector('.add'));
    if (btn) btn.focus({ preventScroll: true });
    else if (from === 'cart') $('cartTitle').focus({ preventScroll: true });
  }

  function niceDate(v) {
    try {
      var p = v.split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
    } catch (e) { return v; }
  }

  function validate() {
    var errs = [], d = deliver.checked, now = new Date();
    if (state.count === 0) errs.push({ id: null, msg: 'בחרו לפחות מנה אחת מהתפריט' });
    if (d && !town.value) errs.push({ id: 'town', msg: 'בחרו ישוב למשלוח' });
    if (d && !$('addr').value.trim()) errs.push({ id: 'addr', msg: 'כתבו כתובת למשלוח' });
    var dv = $('date').value, tv = $('time').value;
    if (!dv) errs.push({ id: 'date', msg: 'בחרו תאריך' });
    else if (dv < $('date').min) errs.push({ id: 'date', msg: state.hasDoro ? 'מנת דורו ווט מזמינים יום מראש, בחרו מחר או יום אחר' : 'בחרו תאריך מהיום והלאה' });
    if (!tv) errs.push({ id: 'time', msg: 'בחרו שעה' });
    else if (dv && dv === ymd(now)) {
      var t = tv.split(':');
      var when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(t[0]), Number(t[1]));
      if (when.getTime() - now.getTime() < 2 * 3600 * 1000) errs.push({ id: 'time', msg: 'מזמינים לפחות שעתיים מראש, בחרו שעה מאוחרת יותר או יום אחר' });
    }
    if (!$('who').value.trim()) errs.push({ id: 'who', msg: 'כתבו את שמכם' });
    return errs;
  }

  function showErrors(errs, announce) {
    [].slice.call(document.querySelectorAll('.fld.bad')).forEach(function (f) { f.classList.remove('bad'); });
    [].slice.call(document.querySelectorAll('.ferr')).forEach(function (p) { p.hidden = true; p.textContent = ''; });
    ['town', 'addr', 'date', 'time', 'who'].forEach(function (id) { $(id).removeAttribute('aria-invalid'); });
    var html = '';
    errs.forEach(function (e) {
      html += '<li>' + esc(e.msg) + '</li>';
      if (e.id) {
        $(e.id).closest('.fld').classList.add('bad');
        $(e.id).setAttribute('aria-invalid', 'true');
        var p = $('e-' + e.id);
        p.textContent = e.msg;
        p.hidden = false;
      }
    });
    if (announce) $('errList').innerHTML = html;
    $('errs').hidden = errs.length === 0;
  }

  function updateBar() {
    var bar = $('mbar');
    bar.hidden = state.count === 0 || inCheckout;
    document.body.classList.toggle('hasbar', !bar.hidden);
  }

  function render() {
    var sub = 0, count = 0, lhtml = '', rhtml = '', text = [];
    rows.forEach(function (row) {
      var id = row.getAttribute('data-id'), q = qty[id];
      if (!q) return;
      var p = Number(row.getAttribute('data-price')), name = row.getAttribute('data-name');
      var bq = Number(row.getAttribute('data-bq')) || 0, bp = Number(row.getAttribute('data-bp')) || 0;
      var bundles = bq ? Math.floor(q / bq) : 0;
      var lineTotal = bundles * bp + (q - bundles * bq) * p;
      var promo = bundles ? ' (מבצע ' + bq + ' ב-' + money(bp) + ')' : '';
      sub += lineTotal; count += q;
      lhtml += '<li><span class="nm">' + esc(name) + promo + '</span><span class="pr">' + money(lineTotal) + '</span>' +
        '<div class="qty" data-id="' + esc(id) + '"><button type="button" class="minus" aria-label="הפחתת ' + esc(name) + '">−</button><output>' + q + '</output><button type="button" class="add" aria-label="הוספת ' + esc(name) + '">+</button></div></li>';
      rhtml += '<li><span>' + esc(name) + ' ×' + q + promo + '</span><span>' + money(lineTotal) + '</span></li>';
      text.push('• ' + name + ' ×' + q + promo + ' — ' + money(lineTotal));
    });
    lines.innerHTML = lhtml;
    rlines.innerHTML = rhtml;

    var isDeliver = deliver.checked;
    var fee = (count === 0 || !isDeliver || !town.value) ? 0 : Number(town.value);
    var hasDoro = ((qty.doro || 0) + (qty.doroS || 0)) > 0;
    state = { sub: sub, count: count, fee: fee, hasDoro: hasDoro };

    $('empty').hidden = count > 0;
    $('sums').hidden = count === 0;
    $('feeNote').hidden = count === 0;
    $('toCheckout').hidden = count === 0;
    $('sSub').textContent = money(sub);
    $('warn').textContent = hasDoro ? 'מנת דורו ווט מזמינים יום מראש.' : '';

    $('coEmpty').hidden = count > 0;
    $('coFull').hidden = count === 0;
    $('cSub').textContent = money(sub);
    $('cFee').textContent = !isDeliver ? 'איסוף עצמי, ללא עלות' : (town.value ? money(fee) : 'יחושב אחרי בחירת ישוב');
    $('cTot').textContent = money(sub + fee);
    $('mTot').textContent = money(sub + fee);

    var now = new Date();
    $('date').min = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (hasDoro ? 1 : 0)));
    $('dateHelp').textContent = hasDoro
      ? 'יש בהזמנה מנת דורו ווט, לכן מזמינים יום מראש ואפשר לבחור מחר ואילך.'
      : 'מזמינים לפחות שעתיים מראש.' + (isDeliver ? ' השליח מגיע בחלון של שעתיים.' : '');

    copyOrder.disabled = count === 0;
    buildText(text, sub, fee, count);
    var errs = validate();
    wa.href = errs.length === 0 ? 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(out.value) : '#checkout';
    if (attempted) showErrors(errs, false);
    updateBar();
  }

  function buildText(text, sub, fee, count) {
    if (!count) { out.value = ''; return; }
    var d = deliver.checked;
    var parts = ['הזמנה מהאנג\'רה של אמא פרנוס', ''];
    parts = parts.concat(text);
    parts.push('');
    parts.push('מנות: ' + money(sub));
    if (d) {
      var tn = town.value ? town.options[town.selectedIndex].getAttribute('data-name') : '';
      parts.push('משלוח' + (tn ? ' ל' + tn : '') + ': ' + (town.value ? money(fee) : 'לא נבחר ישוב'));
    } else {
      parts.push('איסוף עצמי: ללא עלות');
    }
    parts.push('סה"כ לתשלום: ' + money(sub + fee));
    parts.push('');
    if ($('date').value) parts.push('מועד מבוקש: ' + niceDate($('date').value) + ($('time').value ? ' בשעה ' + $('time').value : ''));
    else if ($('time').value) parts.push('שעה מבוקשת: ' + $('time').value);
    if ($('who').value.trim()) parts.push('שם: ' + $('who').value.trim());
    if (d && $('addr').value.trim()) parts.push('כתובת: ' + $('addr').value.trim());
    if ($('note').value.trim()) parts.push('הערות: ' + $('note').value.trim());
    out.value = parts.join('\n');
  }

  function syncMethod() {
    var d = deliver.checked;
    $('townField').hidden = !d;
    $('addrField').hidden = !d;
    $('methodHelp').textContent = d ? '' : 'פרטי האיסוף מתואמים איתכם באישור ההזמנה.';
    render();
  }

  ['addr', 'who', 'note', 'date', 'time'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  town.addEventListener('change', render);
  deliver.addEventListener('change', syncMethod);
  pickup.addEventListener('change', syncMethod);

  wa.addEventListener('click', function (e) {
    var errs = validate();
    if (errs.length) {
      e.preventDefault();
      attempted = true;
      showErrors(errs, true);
      var first = errs.filter(function (x) { return x.id; })[0];
      if (first) $(first.id).focus();
      else $('menu').scrollIntoView();
      return;
    }
    $('sent').hidden = false;
  });

  function copyText(src, btn, idle) {
    function done() { btn.textContent = 'הועתק'; setTimeout(function () { btn.textContent = idle; }, 1800); }
    function fallback() { try { src.focus(); src.select(); } catch (e) {} }
    try { navigator.clipboard.writeText(src.value !== undefined ? src.value : src.textContent).then(done, fallback); }
    catch (e) { fallback(); }
  }
  copyOrder.addEventListener('click', function () { copyText(out, copyOrder, 'העתקת ההזמנה'); });

  var phone = $('phone'), cbtn = $('copy');
  cbtn.addEventListener('click', function () {
    function done() { cbtn.textContent = 'הועתק'; setTimeout(function () { cbtn.textContent = 'העתקת המספר'; }, 1800); }
    function fallback() { var r = document.createRange(); r.selectNodeContents(phone); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    try { navigator.clipboard.writeText(phone.textContent).then(done, fallback); } catch (e) { fallback(); }
  });

  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var f = t.getAttribute('data-f');
      tabs.forEach(function (x) { x.setAttribute('aria-pressed', x === t ? 'true' : 'false'); });
      [].slice.call(document.querySelectorAll('.grp')).forEach(function (g) { 
        g.hidden = f !== 'all' && g.getAttribute('data-g') !== f; 
      });
    });
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      inCheckout = es[0].isIntersecting;
      updateBar();
    }, { rootMargin: '0px 0px -25% 0px' }).observe($('checkout'));
  }

  syncMethod();
})();

(function () {
  function $(id) { return document.getElementById(id); }
  var calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function bump(el) {
    if (calm || !el || !el.animate) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }

  ['sSub', 'cSub', 'cFee', 'cTot', 'mTot'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    var last = el.textContent;
    new MutationObserver(function () {
      var t = el.textContent;
      if (t !== last) { last = t; bump(el); }
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  var lines = $('lines'), seen = {};
  if (lines) {
    new MutationObserver(function () {
      var cur = {};
      [].slice.call(lines.querySelectorAll('li')).forEach(function (li) {
        var q = li.querySelector('.qty'), id = q && q.getAttribute('data-id');
        cur[id] = 1;
        if (!seen[id]) li.classList.add('new');
      });
      seen = cur;
    }).observe(lines, { childList: true });
  }

  function fly(r) {
    if (calm || !document.body.animate) return;
    var mb = $('mbar'), tx, ty;
    if (mb && !mb.hidden && getComputedStyle(mb).display !== 'none') {
      var t = $('mTot').getBoundingClientRect();
      tx = t.left + t.width / 2; ty = window.innerHeight - 30;
    } else {
      var c = $('cartTitle').getBoundingClientRect();
      tx = c.left + c.width / 2; ty = Math.min(Math.max(c.top + 14, 24), window.innerHeight - 24);
    }
    var sx = r.left + r.width / 2, sy = r.top + r.height / 2;
    var dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = 'position:fixed;z-index:60;left:' + (sx - 9) + 'px;top:' + (sy - 9) + 'px;width:18px;height:18px;border-radius:50%;background:var(--green);pointer-events:none;box-shadow:0 0 0 4px rgba(6,122,45,.25)';
    document.body.appendChild(dot);
    var dx = tx - sx, dy = ty - sy;
    var a = dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + (dx * .45) + 'px,' + (dy * .45 - 70) + 'px) scale(.9)', opacity: 1, offset: .5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: .5 }
    ], { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' });
    a.onfinish = a.oncancel = function () { if (dot.parentNode) dot.parentNode.removeChild(dot); };
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#menuList .qty .add');
    if (!b) return;
    var r = b.getBoundingClientRect();
    setTimeout(function () { fly(r); }, 0);
  }, true);

  if (!calm && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.classList.add('in');
        el.classList.remove('pre');
        io.unobserve(el);
        setTimeout(function () { el.classList.remove('rv', 'in'); el.style.transitionDelay = ''; }, 1100);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    [].slice.call(document.querySelectorAll('.band h2, .steps li, .fact, .story p, .grp .group, .grp .item, .coform .card, .towns-wrap, .visit > *, .faq details')).forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      var i = [].indexOf.call(el.parentNode.children, el) % 4;
      el.classList.add('rv');
      if (el.tagName === 'H2') el.classList.add('pre');
      el.style.transitionDelay = (i * 70) + 'ms';
      io.observe(el);
    });
  }

  var prog = $('prog'), tb = $('topbar'), ticking = false;
  function onScroll() {
    ticking = false;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ')';
    tb.classList.toggle('stuck', window.scrollY > 24);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  var links = [].slice.call(document.querySelectorAll('.topbar nav ul a'));
  var byHref = {};
  links.forEach(function (a) { byHref[a.getAttribute('href')] = a; });
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (l) { l.removeAttribute('aria-current'); });
        var a = byHref['#' + e.target.id];
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    ['how', 'story', 'menu', 'checkout', 'delivery', 'faq'].forEach(function (id) { if ($(id)) spy.observe($(id)); });
  }
})();
