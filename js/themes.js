/**
 * themes.js — 界面外壳主题切换。
 *
 * 切换时先以非匹配 media 加载下一份样式；它完整就绪后才启用，
 * 并在两帧后移除旧样式。这样网络慢或连续点按也不会出现无样式页面。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'crb:ui-theme';
  var VERSION = '20260814h';
  var FILES = {
    workshop: 'workshop.css',
    playful: 'playful.css',
    'liquid-glass': 'liquid-glass.css'
  };
  var COLORS = {
    workshop: '#E7EBE4',
    playful: '#FFE7A8',
    'liquid-glass': '#F5F5F7'
  };

  var style = document.getElementById('ui-theme-style');
  var switcher = document.getElementById('ui-theme-switch');
  var browserColor = document.getElementById('browser-theme-color');
  var pending = null;
  var sequence = 0;
  if (!style || !switcher) return;

  function normalize(theme) {
    return Object.prototype.hasOwnProperty.call(FILES, theme) ? theme : 'workshop';
  }

  function hrefFor(theme) {
    return 'css/' + FILES[theme] + '?v=' + VERSION;
  }

  function setControls(theme) {
    document.documentElement.dataset.uiTheme = theme;
    if (browserColor) browserColor.content = COLORS[theme];
    switcher.removeAttribute('aria-busy');
    switcher.removeAttribute('data-theme-loading');
    switcher.querySelectorAll('[data-ui-theme]').forEach(function (button) {
      var active = button.dataset.uiTheme === theme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
  }

  function cancelPending() {
    if (!pending) return;
    pending.onload = null;
    pending.onerror = null;
    pending.remove();
    pending = null;
  }

  function removeOldStyles(activeStyle) {
    document.querySelectorAll('link[data-ui-theme-active]').forEach(function (link) {
      if (link !== activeStyle) link.remove();
    });
  }

  function applyTheme(theme) {
    var selected = normalize(theme);
    var nextHref = hrefFor(selected);
    var request = ++sequence;
    cancelPending();

    if (style.getAttribute('href') === nextHref) {
      removeOldStyles(style);
      setControls(selected);
      return;
    }

    switcher.setAttribute('aria-busy', 'true');
    switcher.dataset.themeLoading = selected;

    var candidate = document.createElement('link');
    candidate.rel = 'stylesheet';
    candidate.media = 'not all';
    candidate.href = nextHref;
    candidate.dataset.uiThemePending = selected;
    pending = candidate;

    candidate.onload = function () {
      if (request !== sequence || pending !== candidate) {
        candidate.remove();
        return;
      }

      var previous = style;
      pending = null;
      candidate.onload = null;
      candidate.onerror = null;
      previous.removeAttribute('id');
      candidate.removeAttribute('data-ui-theme-pending');
      candidate.dataset.uiThemeActive = selected;
      candidate.id = 'ui-theme-style';
      candidate.media = 'all';
      style = candidate;
      setControls(selected);

      // 保留上一份已生效样式到新主题绘制完成，彻底避免 FOUC。
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (request === sequence) removeOldStyles(style);
        });
      });
    };

    candidate.onerror = function () {
      if (request !== sequence) return;
      pending = null;
      candidate.remove();
      switcher.removeAttribute('aria-busy');
      switcher.removeAttribute('data-theme-loading');
      console.warn('主题样式加载失败，已保留当前主题。');
    };

    document.head.appendChild(candidate);
  }

  style.dataset.uiThemeActive = 'initial';
  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  applyTheme(saved);

  switcher.addEventListener('click', function (event) {
    var button = event.target.closest('[data-ui-theme]');
    if (button) applyTheme(button.dataset.uiTheme);
  });

  window.UIThemes = {
    apply: applyTheme,
    current: function () { return document.documentElement.dataset.uiTheme; }
  };
})();
