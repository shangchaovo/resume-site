/**
 * apps.js — 本地投递追踪看板（研究报告里多数工具缺失的「投递闭环」）
 * 暴露全局：Apps = { list, add, update, remove, render, openModal, close, refreshDraftOptions }
 * 持久化：crb:apps（全局数组，独立于简历 doc；模块自管，不随 Store.touch 存）。
 * 每条引用草稿时快照 draftName，避免改名/删草稿后显示断裂。
 */
(function () {
  'use strict';

  var KEY = 'crb:apps';
  var STATUSES = ['想投', '已投', '笔试', '面试', 'offer', '已拒', '已撤回'];
  var dragId = null;
  var editingId = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function $(id) { return document.getElementById(id); }

  function list() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function save(a) { localStorage.setItem(KEY, JSON.stringify(a)); }

  function add(obj) {
    var a = list();
    var item = Object.assign({
      id: window.ResumeSchema.uid('a'), company: '', role: '', date: today(),
      status: '想投', link: '', draftId: '', draftName: '', note: ''
    }, obj || {});
    if (STATUSES.indexOf(item.status) === -1) item.status = '想投';
    a.push(item); save(a); return item;
  }
  function update(id, patch) {
    var a = list(); var t = a.filter(function (x) { return x.id === id; })[0];
    if (t) { Object.assign(t, patch || {}); if (STATUSES.indexOf(t.status) === -1) t.status = '想投'; save(a); }
  }
  function remove(id) { save(list().filter(function (x) { return x.id !== id; })); }

  function draftOptions(selectedId) {
    var drafts = window.Store.listDrafts();
    var opts = '<option value="">— 不关联 —</option>' + drafts.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === selectedId ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    return opts;
  }
  function refreshDraftOptions() {
    var sel = $('m-draft');
    if (sel) { var cur = sel.value; sel.innerHTML = draftOptions(cur); }
  }

  function cardHtml(app) {
    return '<div class="app-card" draggable="true" data-id="' + app.id + '">' +
      '<div class="app-co">' + esc(app.company || '（未填公司）') + '</div>' +
      (app.role ? '<div class="app-role">' + esc(app.role) + '</div>' : '') +
      '<div class="app-meta mono">' +
      (app.date ? '<span>' + esc(app.date) + '</span>' : '') +
      (app.link ? '<a href="' + esc(/^https?:/.test(app.link) ? app.link : 'https://' + app.link) + '" target="_blank" rel="noopener">链接↗</a>' : '') +
      '</div>' +
      (app.draftName ? '<div class="app-draft mono">↳ ' + esc(app.draftName) + '</div>' : '') +
      (app.note ? '<div class="app-note">' + esc(app.note) + '</div>' : '') +
      '<div class="app-foot">' +
      '<select class="app-status" data-id="' + app.id + '">' +
      STATUSES.map(function (s) { return '<option' + (s === app.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
      '</select>' +
      '<button class="app-edit" data-id="' + app.id + '" title="编辑">✎</button>' +
      '<button class="app-del" data-id="' + app.id + '" title="删除">✕</button>' +
      '</div></div>';
  }

  function render() {
    var kb = $('kanban');
    if (!kb) return;
    var apps = list();
    var total = $('apps-total'); if (total) total.textContent = apps.length + ' 条投递';
    kb.innerHTML = STATUSES.map(function (st) {
      var col = apps.filter(function (a) { return a.status === st; });
      return '<div class="kanban-col" data-status="' + st + '">' +
        '<div class="kanban-head"><span class="kanban-title">' + st + '</span><span class="kanban-count mono">' + col.length + '</span>' +
        '<button class="icon-btn kanban-add" data-status="' + st + '" title="在此列新增">＋</button></div>' +
        '<div class="kanban-cards">' + col.map(cardHtml).join('') + '</div></div>';
    }).join('');

    /* 卡片事件 */
    kb.querySelectorAll('.app-status').forEach(function (sel) {
      sel.addEventListener('change', function () { update(sel.dataset.id, { status: sel.value }); render(); });
    });
    kb.querySelectorAll('.app-edit').forEach(function (b) {
      b.addEventListener('click', function () { openModal(list().filter(function (x) { return x.id === b.dataset.id; })[0]); });
    });
    kb.querySelectorAll('.app-del').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = list().filter(function (x) { return x.id === b.dataset.id; })[0];
        if (t && confirm('删除「' + (t.company || '该投递') + '」的记录？')) { remove(b.dataset.id); render(); }
      });
    });
    /* 拖拽改状态 */
    kb.querySelectorAll('.app-card').forEach(function (card) {
      card.addEventListener('dragstart', function () { dragId = card.dataset.id; card.classList.add('dragging'); });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); dragId = null; });
    });
    kb.querySelectorAll('.kanban-col').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('col-over'); });
      col.addEventListener('dragleave', function () { col.classList.remove('col-over'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('col-over');
        if (dragId) { update(dragId, { status: col.dataset.status }); render(); }
      });
    });
    kb.querySelectorAll('.kanban-add').forEach(function (b) {
      b.addEventListener('click', function () { openModal({ status: b.dataset.status }); });
    });
  }

  /* ---------------- 模态框 ---------------- */

  function openModal(prefill) {
    prefill = prefill || {};
    editingId = prefill.id || null;
    $('m-title').textContent = editingId ? '编辑投递' : '记一笔投递';
    $('m-company').value = prefill.company || '';
    $('m-role').value = prefill.role || '';
    $('m-link').value = prefill.link || '';
    $('m-date').value = prefill.date || today();
    $('m-note').value = prefill.note || '';
    var sel = $('m-draft'); sel.innerHTML = draftOptions(prefill.draftId || window.Store.currentId());
    var st = $('m-status'); st.innerHTML = STATUSES.map(function (s) { return '<option>' + s + '</option>'; }).join('');
    st.value = prefill.status || '想投';
    $('app-modal').hidden = false;
    var scrim = $('app-scrim'); scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add('show'); });
    setTimeout(function () { $('m-company').focus(); }, 50);
  }

  function close() {
    $('app-modal').hidden = true;
    var scrim = $('app-scrim'); scrim.classList.remove('show'); setTimeout(function () { scrim.hidden = true; }, 250);
    editingId = null;
  }

  function gatherAndSave() {
    var company = $('m-company').value.trim();
    if (!company) { $('m-company').focus(); $('m-company').classList.add('flash'); setTimeout(function () { $('m-company').classList.remove('flash'); }, 1200); return; }
    var draftId = $('m-draft').value;
    var draftName = '';
    if (draftId) { var d = window.Store.listDrafts().filter(function (x) { return x.id === draftId; })[0]; draftName = d ? d.name : ''; }
    var data = {
      company: company, role: $('m-role').value.trim(), link: $('m-link').value.trim(),
      date: $('m-date').value.trim(), status: $('m-status').value, note: $('m-note').value.trim(),
      draftId: draftId, draftName: draftName
    };
    if (editingId) update(editingId, data); else add(data);
    close(); render();
  }

  function wireModal() {
    $('m-save').addEventListener('click', gatherAndSave);
    $('m-cancel').addEventListener('click', close);
    $('m-cancel-top').addEventListener('click', close);
    $('app-scrim').addEventListener('click', close);
    $('app-modal').addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  window.Apps = {
    list: list, add: add, update: update, remove: remove,
    render: render, openModal: openModal, close: close,
    refreshDraftOptions: refreshDraftOptions, wireModal: wireModal, STATUSES: STATUSES
  };
})();
