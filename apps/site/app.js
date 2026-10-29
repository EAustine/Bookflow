
  // page-load entrance
  /* theme toggle */
  (function(){
    var root = document.documentElement;
    var btn = document.getElementById('themeToggle');
    function sync(){
      var dark = root.getAttribute('data-theme') === 'dark';
      if (btn){ btn.setAttribute('aria-pressed', String(dark)); btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'); }
      root.style.colorScheme = dark ? 'dark' : 'light';
    }
    sync();
    if (btn) btn.addEventListener('click', function(){
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.classList.add('theme-anim');
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('bf-theme', next); } catch(e){}
      sync();
      setTimeout(function(){ root.classList.remove('theme-anim'); }, 260);
    });
    if (window.matchMedia){
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var follow = function(e){ var s; try { s = localStorage.getItem('bf-theme'); } catch(_){} if (s !== 'light' && s !== 'dark'){ root.setAttribute('data-theme', e.matches ? 'dark' : 'light'); sync(); } };
      if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
    }
  })();
  window.addEventListener('load', function(){ document.body.classList.add('in'); });

  // sticky nav border on scroll
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function(){
    if(window.scrollY > 8) nav.classList.add('scrolled'); else nav.classList.remove('scrolled');
  }, { passive:true });

  // fade the sticky nav out while the footer is in view; fade it back in on leaving
  (function(){
    var footer = document.querySelector('footer');
    if(!nav || !footer || !('IntersectionObserver' in window)) return;
    if(document.body.getAttribute('data-nav-fade') === 'off') return;  // per-page opt-out (e.g. Contact)
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ nav.classList.toggle('nav-hidden', e.isIntersecting); });
    }, { threshold: 0 });
    io.observe(footer);
  })();

  // toolkit carousel: "next" advances one card (mobile; wraps at the end)
  (function(){
    var bento = document.querySelector('.bento');
    var nextBtn = document.querySelector('.bento-next');
    if(!bento || !nextBtn) return;
    nextBtn.addEventListener('click', function(){
      var tile = bento.querySelector('.tile');
      var step = tile ? tile.getBoundingClientRect().width + 14 : Math.round(bento.clientWidth * 0.9);
      if(bento.scrollLeft >= bento.scrollWidth - bento.clientWidth - 4){
        bento.scrollTo({ left:0, behavior:'smooth' });
      } else {
        bento.scrollBy({ left:step, behavior:'smooth' });
      }
    });
  })();

  // scroll reveals
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('seen'); io.unobserve(e.target); } });
    }, { threshold:0.16 });
    document.querySelectorAll('.sr, .sr-stagger').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.sr, .sr-stagger').forEach(function(el){ el.classList.add('seen'); });
  }

  /* ---------- Waitlist capture ----------
     Paste your Supabase project values below to go live. Until then the form
     runs in DEMO MODE (shows the success state without sending anywhere).
     Run the table + RLS SQL provided alongside this file first. */
  var SUPABASE_URL      = 'https://wqybsuhccyixpnrvmlxr.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxeWJzdWhjY3lpeHBucnZtbHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzI4MTQsImV4cCI6MjA5Mjk0ODgxNH0.4KUd3r-6-nmocRp7UKKy6jV8tohF0yGc_XFXKi-cZxM';
  var WAITLIST_TABLE    = 'site_waitlist';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var WL_SUCCESS = 'Thanks \u2014 you\u2019re on the list. We\u2019ll email you the moment Bookflow opens.';

  function wlMsg(wrap, text){
    var m = wrap.parentNode.querySelector('.wl-msg');
    if(!m){ m = document.createElement('div'); m.className = 'wl-msg'; wrap.parentNode.insertBefore(m, wrap.nextSibling); }
    m.textContent = text || '';
    m.style.display = text ? 'block' : 'none';
  }
  function bindWlInput(inp){
    inp.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); var w = inp.closest('.wl'); if(w) joinWaitlist(w.id); }
    });
    inp.addEventListener('input', function(){
      inp.removeAttribute('aria-invalid');
      var w = inp.closest('.wl'); if(!w) return;
      var m = w.parentNode.querySelector('.wl-msg'); if(m) m.style.display = 'none';
    });
  }
  function wlReset(wrap){
    if(!wrap._wlOriginal) return;
    wrap.innerHTML = wrap._wlOriginal;
    var inp = wrap.querySelector('input');
    if(inp){ inp.value = ''; bindWlInput(inp); }
  }
  function wlDone(wrap, text){
    wlMsg(wrap, '');
    if(!wrap._wlOriginal) wrap._wlOriginal = wrap.innerHTML;
    wrap.innerHTML = '<div class="wl-done">' + text + '</div>';
    clearTimeout(wrap._wlRevert);
    wrap._wlRevert = setTimeout(function(){ wlReset(wrap); }, 4000);
  }

  function joinWaitlist(id){
    var wrap = document.getElementById(id);
    if(!wrap) return;
    if(!wrap._wlOriginal) wrap._wlOriginal = wrap.innerHTML;  /* stash pristine form once */
    var input = wrap.querySelector('input');
    var btn   = wrap.querySelector('button');
    var email = ((input && input.value) || '').trim();

    if(!EMAIL_RE.test(email)){
      wlMsg(wrap, 'Please enter a valid email address.');
      if(input){ input.setAttribute('aria-invalid','true'); input.focus(); }
      return;
    }
    if(input) input.removeAttribute('aria-invalid');
    wlMsg(wrap, '');

    var label = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Joining\u2026'; }

    var configured = SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR-') === -1;
    if(!configured){
      console.warn('[Bookflow] Waitlist backend not configured \u2014 set SUPABASE_URL and SUPABASE_ANON_KEY. Running in demo mode.');
      setTimeout(function(){ wlDone(wrap, WL_SUCCESS); }, 450);
      return;
    }

    fetch(SUPABASE_URL + '/rest/v1/' + WAITLIST_TABLE, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ email: email, source: id.replace('wl-','') })
    }).then(function(res){
      if(res.ok){ wlDone(wrap, WL_SUCCESS); return; }
      if(res.status === 409){ wlDone(wrap, 'You\u2019re already on the list \u2014 we\u2019ll be in touch.'); return; }
      throw new Error('HTTP ' + res.status);
    }).catch(function(err){
      console.error('[Bookflow] Waitlist error:', err);
      if(btn){ btn.disabled = false; btn.textContent = label || 'Join the waitlist'; }
      wlMsg(wrap, 'Something went wrong. Please try again.');
    });
  }

  /* Enter submits the nearest waitlist form; typing clears any error */
  Array.prototype.forEach.call(document.querySelectorAll('.wl input'), bindWlInput);
  /* mobile menu */
  (function(){
    var burger = document.getElementById('navBurger');
    var menu   = document.getElementById('mobileMenu');
    var scrim  = document.getElementById('mmScrim');
    if(!burger || !menu) return;
    function setOpen(open){
      menu.classList.toggle('open', open);
      if(scrim) scrim.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
    }
    burger.addEventListener('click', function(){ setOpen(!menu.classList.contains('open')); });
    if(scrim) scrim.addEventListener('click', function(){ setOpen(false); });
    menu.addEventListener('click', function(e){ if(e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && menu.classList.contains('open')){ setOpen(false); burger.focus(); } });
    window.addEventListener('resize', function(){ if(window.innerWidth > 600 && menu.classList.contains('open')) setOpen(false); });
  })();

  function setBilling(mode){
    var bm=document.getElementById('bm'), ba=document.getElementById('ba');
    var amt=document.getElementById('std-amt'), per=document.getElementById('std-per'), note=document.getElementById('std-note');
    var samt=document.getElementById('stu-amt'), sper=document.getElementById('stu-per'), snote=document.getElementById('stu-note');
    if(mode==='annual'){
      ba.classList.add('on'); bm.classList.remove('on');
      amt.textContent='$79'; per.textContent='/ year'; note.textContent='Billed annually, save 34%.';
      samt.textContent='$39'; sper.textContent='/ year'; snote.textContent='Billed annually, save 35%.';
    } else {
      bm.classList.add('on'); ba.classList.remove('on');
      amt.textContent='$9.99'; per.textContent='/ month'; note.textContent='Billed monthly.';
      samt.textContent='$4.99'; sper.textContent='/ month'; snote.textContent='With a valid student email.';
    }
  }


  /* ---------- Contact form ---------- */
  var CONTACT_TABLE = 'site_contact_messages';
  function cfStatus(el, text, kind){ if(!el) return; el.className = 'cf-msg ' + (kind||'') + (text?' show':''); el.textContent = text || ''; }
  function submitContact(){
    var form = document.getElementById('contactForm'); if(!form) return;
    var name = document.getElementById('cf-name'), email = document.getElementById('cf-email'),
        msg = document.getElementById('cf-msg'), status = document.getElementById('cf-status'),
        btn = form.querySelector('button');
    [name,email,msg].forEach(function(f){ if(f) f.removeAttribute('aria-invalid'); });
    var nv=((name&&name.value)||'').trim(), ev=((email&&email.value)||'').trim(), mv=((msg&&msg.value)||'').trim();
    var bad = !nv ? name : (!EMAIL_RE.test(ev) ? email : (mv.length < 2 ? msg : null));
    if(bad){ bad.setAttribute('aria-invalid','true'); bad.focus(); cfStatus(status,'Please add your name, a valid email, and a message.','err'); return; }
    var label = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Sending\u2026'; }
    var done = function(){ form.reset(); cfStatus(status,'Thanks \u2014 your message is on its way. We\u2019ll get back to you soon.','ok'); if(btn){ btn.disabled=false; btn.textContent=label||'Send message'; } };
    var fail = function(e){ console.error('[Bookflow] Contact error:', e); if(btn){ btn.disabled=false; btn.textContent=label||'Send message'; } cfStatus(status,'Something went wrong. Please try again, or email us directly.','err'); };
    var configured = SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR-') === -1;
    if(!configured){ console.warn('[Bookflow] Contact backend not configured \u2014 demo mode.'); setTimeout(done, 500); return; }
    fetch(SUPABASE_URL + '/rest/v1/' + CONTACT_TABLE, { method:'POST',
      headers:{ 'apikey':SUPABASE_ANON_KEY, 'Authorization':'Bearer '+SUPABASE_ANON_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
      body: JSON.stringify({ name:nv, email:ev, message:mv }) })
      .then(function(res){ if(res.ok){ done(); return; } throw new Error('HTTP '+res.status); }).catch(fail);
  }
