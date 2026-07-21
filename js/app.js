/**
 * app.js — 主控制器：状态接线、模板/主题/密度切换、草稿管理、
 *          指南抽屉、toast、JSON 导入导出、PDF 导出教练、快捷键
 * 暴露全局：App（含 refreshNow 供打印前同步重渲染）
 */
(function () {
  'use strict';

  var doc = null;

  function $(id) { return document.getElementById(id); }

  /* ---------------- Toast ---------------- */

  function toast(msg, opts) {
    opts = opts || {};
    var host = $('toast-host');
    var t = document.createElement('div');
    t.className = 'toast' + (opts.warn ? ' warn' : '');
    t.innerHTML = msg;
    host.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, opts.ms || 3800);
  }

  /* ---------------- 保存状态 ---------------- */

  function setSaveStatus(state) {
    var wrap = $('save-status');
    var text = $('save-text');
    wrap.classList.remove('saving', 'saved');
    if (state === 'saving') {
      wrap.classList.add('saving');
      text.textContent = '编辑中…';
    } else {
      wrap.classList.add('saved');
      var d = new Date();
      text.textContent = '已保存 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  }

  /* ---------------- 全量刷新（切换草稿 / 替换内容后） ---------------- */

  function fullRebuild() {
    Editor.buildForm(doc);
    Preview.render(doc);
    Checklist.render(doc);
    syncControls();
    refreshDraftSelect();
  }

  function lightRefresh() {
    Preview.render(doc);
    Checklist.render(doc);
  }

  /* ---------------- 控件同步 ---------------- */

  function syncControls() {
    var s = doc.settings;
    document.querySelectorAll('#tpl-switch .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tpl === s.template);
    });
    document.querySelectorAll('#density-switch .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.density === s.density);
    });
    document.querySelectorAll('.swatch').forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === s.theme);
      b.title = window.Preview.THEMES[b.dataset.theme].name;
    });
  }

  function buildSwatches() {
    var host = $('theme-swatches');
    Object.keys(window.Preview.THEMES).forEach(function (k) {
      var t = window.Preview.THEMES[k];
      var b = document.createElement('button');
      b.className = 'swatch';
      b.type = 'button';
      b.dataset.theme = k;
      b.style.background = t.accent;
      b.title = t.name;
      b.addEventListener('click', function () {
        doc.settings.theme = k;
        window.Store.touch();
        syncControls();
      });
      host.appendChild(b);
    });
  }

  /* ---------------- 草稿 UI ---------------- */

  function refreshDraftSelect() {
    var sel = $('draft-select');
    var drafts = window.Store.listDrafts();
    var cur = window.Store.currentId();
    sel.innerHTML = drafts.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === cur ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function wireDrafts() {
    $('draft-select').addEventListener('change', function (e) {
      doc = window.Store.switchDraft(e.target.value);
      fullRebuild();
    });
    $('btn-draft-new').addEventListener('click', function () {
      doc = window.Store.createDraft(false);
      fullRebuild();
      toast('已新建空白草稿');
    });
    $('btn-draft-copy').addEventListener('click', function () {
      doc = window.Store.createDraft(true);
      fullRebuild();
      toast('已复制当前草稿');
    });
    $('btn-draft-rename').addEventListener('click', function () {
      var name = prompt('草稿名称：', doc.meta.name);
      if (name === null) return;
      doc = window.Store.renameCurrent(name);
      refreshDraftSelect();
    });
    $('btn-draft-delete').addEventListener('click', function () {
      if (window.Store.listDrafts().length <= 1) {
        toast('至少保留一份草稿', { warn: true });
        return;
      }
      if (!confirm('确定删除「' + doc.meta.name + '」？此操作不可撤销。')) return;
      var res = window.Store.deleteDraft(window.Store.currentId());
      if (res.ok) {
        doc = window.Store.getCurrent();
        fullRebuild();
        toast('草稿已删除');
      }
    });
  }

  /* ---------------- 指南抽屉 ---------------- */

  function wireGuide() {
    var drawer = $('guide-drawer');
    var scrim = $('guide-scrim');
    function open() {
      drawer.classList.add('open');
      scrim.hidden = false;
      requestAnimationFrame(function () { scrim.classList.add('show'); });
    }
    function close() {
      drawer.classList.remove('open');
      scrim.classList.remove('show');
      setTimeout(function () { scrim.hidden = true; }, 300);
    }
    $('btn-guide').addEventListener('click', open);
    $('btn-guide-close').addEventListener('click', close);
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  }

  /* ---------------- PDF 导出教练 ---------------- */

  function wireExport() {
    $('btn-export-pdf').addEventListener('click', function () {
      window.Store.flushSave();
      toast('在打印对话框中：<br><span class="mono">目标 → 另存为 PDF｜纸张 → A4｜边距 → 无｜勾选「背景图形」</span>', { ms: 6500 });
      setTimeout(function () { window.print(); }, 400);
    });
  }

  /* ---------------- JSON 备份 ---------------- */

  function wireBackup() {
    $('btn-export-json').addEventListener('click', function () {
      window.Store.exportJSON();
      toast('已导出 JSON 备份');
    });
    $('btn-import-json').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = window.Store.importJSON(reader.result);
        if (res.ok) {
          doc = window.Store.getCurrent();
          fullRebuild();
          toast('已导入为新草稿：' + escapeHtml(res.name));
        } else {
          toast('导入失败：' + (res.reason === 'parse' ? '不是合法 JSON 文件' : '文件结构不是简历数据'), { warn: true });
        }
      };
      reader.readAsText(f);
      e.target.value = '';
    });
  }

  /* ---------------- 示例数据 ---------------- */

  function loadDemoDoc(cb) {
    fetch('data/demo-resume.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { cb(d || null); })
      .catch(function () { cb(null); });
  }

  function wireFillDemo() {
    $('btn-fill-demo').addEventListener('click', function () {
      var r = doc.resume, b = r.basics;
      var hasContent = !!(b.name || b.phone || (r.internships || []).some(function (e) { return e.company; }));
      if (hasContent && !confirm('用示例数据覆盖当前草稿内容？')) return;
      loadDemoDoc(function (demo) {
        if (!demo) { toast('示例数据加载失败', { warn: true }); return; }
        doc = window.Store.replaceCurrent(demo);
        fullRebuild();
        toast('已填入示例数据，照着改成你自己的经历');
      });
    });
  }

  /* ---------------- 工具栏切换 ---------------- */

  function wireToolbar() {
    document.querySelectorAll('#tpl-switch .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        doc.settings.template = b.dataset.tpl;
        window.Store.touch();
        syncControls();
      });
    });
    document.querySelectorAll('#density-switch .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        doc.settings.density = b.dataset.density;
        window.Store.touch();
        syncControls();
      });
    });
    $('btn-zoom-in').addEventListener('click', function () { window.Preview.zoomIn(); });
    $('btn-zoom-out').addEventListener('click', function () { window.Preview.zoomOut(); });
    $('btn-zoom-fit').addEventListener('click', function () { window.Preview.fit(); });
  }

  /* ---------------- 移动端视图切换 ---------------- */

  function wireMobile() {
    document.querySelectorAll('#mobile-switch .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#mobile-switch .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var wb = document.querySelector('.workbench');
        wb.classList.remove('view-edit', 'view-preview');
        wb.classList.add(b.dataset.view === 'preview' ? 'view-preview' : 'view-edit');
        if (b.dataset.view === 'preview') window.Preview.fit();
      });
    });
    document.querySelector('.workbench').classList.add('view-edit');
  }

  /* ---------------- 快捷键 ---------------- */

  function wireKeys() {
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.Store.flushSave();
        toast('已保存');
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot(demoDoc) {
    doc = window.Store.init(demoDoc);
    Editor.init($('form-sections'));
    window.Preview.init();
    Checklist.init($('checklist-card'));
    buildSwatches();
    wireToolbar();
    wireDrafts();
    wireGuide();
    wireExport();
    wireBackup();
    wireFillDemo();
    wireMobile();
    wireKeys();

    /* change：同一对象 = 打字（轻刷新）；新对象 = 换草稿（重建） */
    window.Store.on('change', function (d) {
      if (d !== doc) { doc = d; fullRebuild(); }
      else lightRefresh();
    });
    window.Store.on('save', function (payload) {
      if (payload && payload.__state === 'quota') {
        toast('浏览器存储已满 — 请「导出 JSON」备份后删除旧草稿或移除照片', { warn: true, ms: 8000 });
      } else if (payload && payload.__state === 'seeded') {
        setSaveStatus('saved');
      } else if (payload && payload.__state === 'saving') {
        setSaveStatus('saving');
      } else {
        setSaveStatus('saved');
      }
    });

    fullRebuild();
    setSaveStatus('saved');
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadDemoDoc(boot);
  });

  window.App = {
    refreshNow: function () { if (doc) { Preview.render(doc); } },
    toast: toast
  };
})();
