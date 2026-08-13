/**
 * themes.js — 界面外壳主题切换。
 * 只替换编辑器 UI 样式，不接触 Store、ResumeSchema 或简历正文数据。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'crb:ui-theme';
  var VERSION = '20260814c';
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
  if (!style || !switcher) return;

  function normalize(theme) {
    return Object.prototype.hasOwnProperty.call(FILES, theme) ? theme : 'workshop';
  }

  function applyTheme(theme) {
    var selected = normalize(theme);
    var nextHref = 'css/' + FILES[selected] + '?v=' + VERSION;
    if (style.getAttribute('href') !== nextHref) style.href = nextHref;
    document.documentElement.dataset.uiTheme = selected;
    if (browserColor) browserColor.content = COLORS[selected];
    switcher.querySelectorAll('[data-ui-theme]').forEach(function (button) {
      var active = button.dataset.uiTheme === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    try { localStorage.setItem(STORAGE_KEY, selected); } catch (e) {}
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  applyTheme(saved);

  switcher.addEventListener('click', function (event) {
    var button = event.target.closest('[data-ui-theme]');
    if (button) applyTheme(button.dataset.uiTheme);
  });

  window.UIThemes = { apply: applyTheme, current: function () { return document.documentElement.dataset.uiTheme; } };
})();
