// 1. 防闪烁主题初始化（已经在 head 中执行）
// 2. 高亮当前所在页面
function highlightNav() {
  var path = window.location.pathname;
  var items = document.querySelectorAll('[data-path]');
  for (var i = 0; i < items.length; i++) {
    var el = items[i];
    var target = el.getAttribute('data-path');
    if (target === path || (target === '/' && path === '/')) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
}
highlightNav();
document.addEventListener('astro:page-load', highlightNav);

// 3. 外观：色相 + 明暗，两属性独立
function syncThemeUI() {
  var root = document.documentElement;
  var t = root.getAttribute('data-theme') || 'ink';
  var m = root.getAttribute('data-mode') || 'light';
  var hues = document.querySelectorAll('.tp-hue');
  for (var i = 0; i < hues.length; i++) {
    var on = hues[i].getAttribute('data-hue') === t;
    hues[i].classList.toggle('on', on);
    hues[i].setAttribute('aria-checked', on ? 'true' : 'false');
  }
  var sw = document.getElementById('mode-switch');
  if (sw) {
    sw.classList.toggle('on', m === 'dark');
    sw.setAttribute('aria-checked', m === 'dark' ? 'true' : 'false');
  }
}

function applyTheme(mutate) {
  var root = document.documentElement;
  root.classList.add('theme-transitioning');
  mutate(root);
  localStorage.setItem('zj-theme', root.getAttribute('data-theme'));
  localStorage.setItem('zj-mode', root.getAttribute('data-mode'));
  syncThemeUI();
  clearTimeout(window.__zjThemeT);
  window.__zjThemeT = setTimeout(function () {
    root.classList.remove('theme-transitioning');
  }, 380);
}

function setupTheme() {
  syncThemeUI();
  var btn = document.getElementById('theme-btn');
  var panel = document.getElementById('theme-panel');
  if (!btn || !panel || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
  });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });

  var hues = panel.querySelectorAll('.tp-hue');
  for (var i = 0; i < hues.length; i++) {
    hues[i].addEventListener('click', function () {
      var hue = this.getAttribute('data-hue');
      if (hue) applyTheme(function (r) { r.setAttribute('data-theme', hue); });
    });
  }

  var sw = document.getElementById('mode-switch');
  if (sw) {
    sw.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
      applyTheme(function (r) { r.setAttribute('data-mode', next); });
    });
  }
}
setupTheme();
document.addEventListener('astro:page-load', setupTheme);

// 4. 登录态同步
function refreshAuth() {
  var sessionStr = localStorage.getItem('ziji_uid');
  
  var lb = document.getElementById('nav-login');
  var db = document.getElementById('nav-draft');
  var sb = document.getElementById('nav-settings');
  var menu = document.getElementById('user-menu');
  var av = document.getElementById('nav-avatar');
  var panel = document.getElementById('menu-panel');
  var profileLink = document.getElementById('menu-profile');
  var logoutBtn = document.getElementById('menu-logout');
  var bnUser = document.getElementById('bn-user');
  
  if (!lb || !menu || !av || !panel) return;

  if (sessionStr) {
    var u = localStorage.getItem('ziji_user') || 'U';
    lb.style.display = 'none';
    menu.style.display = 'block';
    if (db) db.style.display = 'inline-flex';
    if (sb) sb.style.display = 'flex';
    if (bnUser) bnUser.setAttribute('href', '/' + u);
    
    av.textContent = u.charAt(0).toUpperCase();
    av.title = u;
    if (profileLink) profileLink.setAttribute('href', '/' + u);

    if (av.dataset.bound !== '1') {
      av.dataset.bound = '1';
      var toggle = function (e) {
        e.stopPropagation();
        var open = panel.hidden;
        panel.hidden = !open;
      };
      av.addEventListener('click', toggle);
      document.addEventListener('click', function (e) {
        if (!panel.hidden && !menu.contains(e.target)) panel.hidden = true;
      });
    }
    if (logoutBtn && logoutBtn.dataset.bound !== '1') {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', function () {
        localStorage.removeItem('ziji_uid');
        localStorage.removeItem('ziji_user');
        window.location.href = '/';
      });
    }
  } else {
    lb.style.display = 'flex';
    menu.style.display = 'none';
    if (db) db.style.display = 'none';
    if (sb) sb.style.display = 'none';
    if (bnUser) bnUser.setAttribute('href', '/login');
    panel.hidden = true;
  }
}
refreshAuth();
document.addEventListener('astro:page-load', refreshAuth);