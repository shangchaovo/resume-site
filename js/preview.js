/**
 * preview.js — 预览挂载、缩放适配、A4 页数测量、折页警示、打印前同步重渲染
 * 暴露全局：Preview
 */
(function () {
  'use strict';

  /* A4 @96dpi */
  var A4_W = 793.7;   /* 210mm */
  var A4_H = 1122.5;  /* 297mm */

  var THEMES = {
    navy:     { name: '藏青', accent: '#1F3A5F', soft: '#E8EDF4', ink: '#16283f' },
    pine:     { name: '墨绿', accent: '#1F5C46', soft: '#E6F0EB', ink: '#153f30' },
    brick:    { name: '砖红', accent: '#9E3B2F', soft: '#F5E9E7', ink: '#6e2a21' },
    graphite: { name: '石墨', accent: '#474D57', soft: '#EBECEE', ink: '#33383f' },
    teal:     { name: '黛青', accent: '#0F5257', soft: '#E4EFF0', ink: '#0b3a3e' },
    bronze:   { name: '棕金', accent: '#8A6D3B', soft: '#F3EEE3', ink: '#5f4b28' }
  };

  var sheet, measure, wrap, stage, badge, foldFlag, readout;
  var zoomMode = 'fit';      /* 'fit' | number(%) */
  var manualZoom = 100;
  var lastPages = 1;
  var pageCountCbs = [];

  function $(id) { return document.getElementById(id); }

  function init() {
    sheet = $('resume-sheet');
    measure = $('sheet-measure');
    wrap = $('sheet-wrap');
    stage = $('preview-stage');
    badge = $('page-badge');
    foldFlag = $('fold-flag');
    readout = $('zoom-readout');

    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (zoomMode === 'fit') applyZoom(); }).observe(stage);
    } else {
      window.addEventListener('resize', function () { if (zoomMode === 'fit') applyZoom(); });
    }
    window.addEventListener('beforeprint', function () {
      /* 用户直接 Cmd+P 时保证内容是最新的 */
      if (window.App && App.refreshNow) App.refreshNow();
    });
  }

  function classFor(settings) {
    return 'tpl-' + (settings.template || 'modern') + ' density-' + (settings.density || 'standard');
  }

  function applyTheme(el, settings) {
    var t = THEMES[settings.theme] || THEMES.navy;
    el.style.setProperty('--tpl-accent', t.accent);
    el.style.setProperty('--tpl-accent-soft', t.soft);
    el.style.setProperty('--tpl-accent-ink', t.ink);
  }

  /* 主渲染：doc → sheet + 测量副本 → 页数 → 徽章/折页线 → 缩放 */
  function render(doc) {
    var settings = doc.settings || {};
    var cls = classFor(settings);

    sheet.className = 'sheet ' + cls;
    measure.className = 'sheet-measure ' + cls;
    applyTheme(sheet, settings);
    applyTheme(measure, settings);

    var html = window.Templates.render(doc);
    sheet.innerHTML = html;
    measure.innerHTML = html;

    measurePages();
    applyZoom();
  }

  /* 强制同步重渲染（打印前） */
  function refreshNow() {
    if (window.App && App.refreshNow) App.refreshNow();
  }

  function measurePages() {
    var h = measure.scrollHeight;
    var pages = Math.max(1, Math.ceil((h - 2) / A4_H));
    updatePageBadge(pages, h);
    if (pages !== lastPages) {
      lastPages = pages;
      pageCountCbs.forEach(function (fn) { fn(pages); });
    }
    return pages;
  }

  function updatePageBadge(pages, h) {
    if (pages <= 1) {
      badge.textContent = '1 页 · A4';
      badge.classList.remove('overflow');
      foldFlag.hidden = true;
    } else {
      badge.textContent = pages + ' 页 — 校招建议 1 页';
      badge.classList.add('overflow');
      foldFlag.hidden = false;
      foldFlag.setAttribute('data-label', '第 2 页折页线');
      /* 折页线位置随缩放同步（applyZoom 里重算） */
    }
    foldFlag._ratio = A4_H;  /* 记录折页位置（未缩放 px） */
  }

  function applyZoom() {
    if (!stage || !wrap) return;
    var scale;
    if (zoomMode === 'fit') {
      scale = (stage.clientWidth - 64) / A4_W;
      scale = Math.min(scale, 1.4);
      readout.textContent = '适配';
    } else {
      scale = manualZoom / 100;
      readout.textContent = manualZoom + '%';
    }
    wrap.style.transform = 'scale(' + scale + ')';
    /* 占位：让滚动区高度与实际缩放后一致 */
    var pages = lastPages;
    var h = pages > 1 ? Math.min(measure.scrollHeight, pages * A4_H) : (measure.scrollHeight || A4_H);
    wrap.style.width = A4_W + 'px';
    wrap.style.height = (h * scale) + 'px';
    sheet.style.transformOrigin = 'top left';

    if (!foldFlag.hidden) {
      foldFlag.style.top = (A4_H * scale) + 'px';
    }
  }

  function setZoom(mode, value) {
    if (mode === 'fit') { zoomMode = 'fit'; }
    else {
      zoomMode = 'manual';
      manualZoom = Math.max(50, Math.min(150, value != null ? value : manualZoom));
    }
    applyZoom();
  }
  function zoomIn() { setZoom('manual', (zoomMode === 'fit' ? fitPct() : manualZoom) + 10); }
  function zoomOut() { setZoom('manual', (zoomMode === 'fit' ? fitPct() : manualZoom) - 10); }
  function fitPct() { return Math.round((stage.clientWidth - 64) / A4_W * 100); }

  function onPageCount(fn) { pageCountCbs.push(fn); }
  function getPages() { return lastPages; }

  window.Preview = {
    init: init,
    render: render,
    refreshNow: refreshNow,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    fit: function () { setZoom('fit'); },
    onPageCount: onPageCount,
    getPages: getPages,
    THEMES: THEMES,
    A4: { w: A4_W, h: A4_H }
  };
})();
