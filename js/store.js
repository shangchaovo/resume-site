/**
 * store.js — localStorage 持久化、草稿管理、防抖自动保存、JSON 导入导出
 * 暴露全局：Store
 *
 * Key 设计（命名空间 crb:）：
 *   crb:meta         { currentId, drafts: [{id,name,template,theme,updatedAt}] }
 *   crb:draft:<id>   单份完整简历 doc
 *   crb:ui           { collapsedSections, zoomMode, guideOpen, manualChecks }（非关键）
 */
(function () {
  'use strict';

  var K_META = 'crb:meta';
  var K_UI = 'crb:ui';
  var K_SEED = 'crb:seeded';
  var SAVE_DEBOUNCE = 400;

  var saveTimer = null;
  var dirty = false;
  var current = null;            // 当前 doc（对象引用）
  var listeners = { save: [], change: [] };
  var lastSavedAt = null;

  /* ---------- 基础读写 ---------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        emitSaveState('quota');
        return false;
      }
      return false;
    }
  }

  function getMeta() {
    var m = readJSON(K_META, null);
    if (!m || !Array.isArray(m.drafts)) m = { currentId: null, drafts: [] };
    return m;
  }

  function setMeta(m) { writeJSON(K_META, m); }

  function draftKey(id) { return 'crb:draft:' + id; }

  /* ---------- 初始化 ---------- */

  function init(demoDoc) {
    var meta = getMeta();
    var seeded = false;

    if (meta.drafts.length === 0 && !localStorage.getItem(K_SEED)) {
      // 首次访问：种入示例简历，首屏即有一张像样的简历
      var demo = ResumeSchema.migrate(demoDoc || ResumeSchema.emptyResume());
      demo.meta.name = '示例：陈晓雨 · 前端校招';
      persistDraftDoc(demo);
      meta = { currentId: demo.meta.id, drafts: [draftSummary(demo)] };
      setMeta(meta);
      localStorage.setItem(K_SEED, '1');
      seeded = true;
    } else if (meta.drafts.length === 0) {
      var fresh = ResumeSchema.emptyResume();
      persistDraftDoc(fresh);
      meta = { currentId: fresh.meta.id, drafts: [draftSummary(fresh)] };
      setMeta(meta);
    }

    var doc = readJSON(draftKey(meta.currentId), null);
    if (!doc) {
      // 当前草稿损坏/丢失 → 回退到第一份
      meta.currentId = meta.drafts[0].id;
      setMeta(meta);
      doc = readJSON(draftKey(meta.currentId), null);
    }
    current = doc ? ResumeSchema.migrate(doc) : ResumeSchema.emptyResume();
    if (!doc) persistDraftDoc(current);
    emitSaveState(seeded ? 'seeded' : 'saved');
    return current;
  }

  function draftSummary(doc) {
    return {
      id: doc.meta.id,
      name: doc.meta.name || '未命名简历',
      template: doc.settings.template,
      theme: doc.settings.theme,
      updatedAt: doc.meta.updatedAt
    };
  }

  function listDrafts() { return getMeta().drafts.slice(); }
  function currentId() { return getMeta().currentId; }
  function getCurrent() { return current; }

  /* ---------- 保存 ---------- */

  function persistDraftDoc(doc) {
    doc.meta.updatedAt = ResumeSchema.nowISO();
    return writeJSON(draftKey(doc.meta.id), doc);
  }

  function bumpMetaSummary() {
    var meta = getMeta();
    var i = meta.drafts.findIndex(function (d) { return d.id === current.meta.id; });
    var sum = draftSummary(current);
    if (i === -1) meta.drafts.push(sum);
    else meta.drafts[i] = sum;
    setMeta(meta);
  }

  function flushSave() {
    if (!dirty || !current) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    dirty = false;
    persistDraftDoc(current);
    bumpMetaSummary();
    lastSavedAt = new Date();
    emitSaveState('saved');
    fire('save', current);
  }

  function scheduleSave() {
    dirty = true;
    emitSaveState('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE);
  }

  /* 外部改完 doc 后调用：触发自动保存 + 通知变更（重渲染/清单） */
  function touch() {
    scheduleSave();
    fire('change', current);
  }

  function on(evt, fn) { if (listeners[evt]) listeners[evt].push(fn); }
  function fire(evt, payload) { listeners[evt].forEach(function (fn) { fn(payload); }); }
  function emitSaveState(state) { fire('save', { __state: state, at: lastSavedAt }); }

  /* 注意：save 监听器会收到两种载荷 —— doc（flushSave）或 {__state}（状态变化）。
     app.js 里据此区分。 */

  /* ---------- 草稿管理 ---------- */

  function renameCurrent(name) {
    name = String(name || '').trim() || '未命名简历';
    current.meta.name = name;
    touch();
    bumpMetaSummary();
    return current;
  }

  function createDraft(copyOfCurrent) {
    flushSave();
    var doc;
    if (copyOfCurrent && current) {
      doc = ResumeSchema.migrate(JSON.parse(JSON.stringify(current)));
      doc.meta.id = ResumeSchema.uid('d');
      doc.meta.name = (current.meta.name || '简历') + ' 副本';
      doc.meta.createdAt = ResumeSchema.nowISO();
    } else {
      doc = ResumeSchema.emptyResume();
      doc.meta.name = '未命名简历 ' + (getMeta().drafts.length + 1);
    }
    persistDraftDoc(doc);
    var meta = getMeta();
    meta.drafts.push(draftSummary(doc));
    meta.currentId = doc.meta.id;
    setMeta(meta);
    current = doc;
    fire('change', current);
    emitSaveState('saved');
    return doc;
  }

  function switchDraft(id) {
    if (id === getMeta().currentId) return current;
    flushSave();
    var doc = readJSON(draftKey(id), null);
    if (!doc) return current;
    var meta = getMeta();
    meta.currentId = id;
    setMeta(meta);
    current = ResumeSchema.migrate(doc);
    fire('change', current);
    emitSaveState('saved');
    return current;
  }

  function deleteDraft(id) {
    var meta = getMeta();
    if (meta.drafts.length <= 1) return { ok: false, reason: 'last' };
    localStorage.removeItem(draftKey(id));
    meta.drafts = meta.drafts.filter(function (d) { return d.id !== id; });
    var switched = null;
    if (meta.currentId === id) {
      meta.currentId = meta.drafts[0].id;
      var doc = readJSON(draftKey(meta.currentId), null);
      current = doc ? ResumeSchema.migrate(doc) : ResumeSchema.emptyResume();
      switched = current;
    }
    setMeta(meta);
    if (switched) fire('change', current);
    return { ok: true, current: switched };
  }

  /* ---------- 用整份 doc 替换当前草稿内容（填入示例 / 导入覆盖场景） ---------- */

  function replaceCurrent(newDoc, newName) {
    var fresh = ResumeSchema.migrate(newDoc);
    fresh.meta.id = current.meta.id;            // 保持当前草稿 id
    fresh.meta.createdAt = current.meta.createdAt;
    if (newName) fresh.meta.name = newName;
    else fresh.meta.name = current.meta.name;
    current = fresh;
    touch();
    bumpMetaSummary();
    return current;
  }

  /* ---------- JSON 备份 ---------- */

  function exportJSON() {
    flushSave();
    var blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date();
    var ds = '' + stamp.getFullYear() +
      String(stamp.getMonth() + 1).padStart(2, '0') +
      String(stamp.getDate()).padStart(2, '0');
    a.href = url;
    a.download = '简历_' + (current.meta.name || '导出') + '_' + ds + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function importJSON(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { ok: false, reason: 'parse' }; }
    if (!parsed || !parsed.resume || !parsed.resume.basics) return { ok: false, reason: 'shape' };
    flushSave();
    var doc = ResumeSchema.migrate(parsed);
    doc.meta.id = ResumeSchema.uid('d');
    doc.meta.createdAt = ResumeSchema.nowISO();
    doc.meta.name = '导入_' + (parsed.meta && parsed.meta.name ? parsed.meta.name : '简历');
    persistDraftDoc(doc);
    var meta = getMeta();
    meta.drafts.push(draftSummary(doc));
    meta.currentId = doc.meta.id;
    setMeta(meta);
    current = doc;
    fire('change', current);
    emitSaveState('saved');
    return { ok: true, name: doc.meta.name };
  }

  /* ---------- UI 状态（非关键，允许丢） ---------- */

  function getUI() { return readJSON(K_UI, {}); }
  function setUI(patch) { writeJSON(K_UI, Object.assign(getUI(), patch)); }

  /* ---------- pagehide 兜底 ---------- */

  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushSave();
  });

  window.Store = {
    init: init,
    getCurrent: getCurrent,
    currentId: currentId,
    listDrafts: listDrafts,
    touch: touch,
    flushSave: flushSave,
    renameCurrent: renameCurrent,
    createDraft: createDraft,
    switchDraft: switchDraft,
    deleteDraft: deleteDraft,
    replaceCurrent: replaceCurrent,
    exportJSON: exportJSON,
    importJSON: importJSON,
    getUI: getUI,
    setUI: setUI,
    on: on
  };
})();
