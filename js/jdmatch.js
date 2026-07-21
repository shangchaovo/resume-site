/**
 * jdmatch.js — 目标岗位 JD 关键词对照（透明「已覆盖 / 缺失」，绝不出 ATS 式总分）
 * 暴露全局：JDMatch = { compute(doc), render(el, doc), renderLists(el, doc) }
 *
 * 关键词来源：① JD 中的英文/版本 token；② 内置词典 DICT 在 JD 里命中的词；③ 用户手动加词。
 * 覆盖判定：归一化（小写）后看简历全文是否 contains 该词。无分词库、无联网、无 AI。
 */
(function () {
  'use strict';

  var DICT = [
    /* 中文：岗位/能力/软素质 */
    '前端', '后端', '全栈', '算法', '数据', '产品', '运营', '设计', '测试', '客户端', '移动端',
    '沟通', '协作', '团队', '独立', '主动', '自驱', '抗压', '责任心', '学习', '逻辑', '表达',
    '优化', '重构', '需求', '接口', '部署', '上线', '迭代', '复盘', '文档', '规范', '排期', '跨部门',
    '英语', '读写', '口语',
    /* 中文：技术/工具 */
    '机器学习', '深度学习', '大模型', '数据分析', '数据可视化', '数据库', '缓存', '微服务', '高并发',
    /* 英文：技术栈 */
    'javascript', 'typescript', 'vue', 'react', 'angular', 'node', 'express', 'webpack', 'vite',
    'python', 'java', 'go', 'c++', 'rust', 'sql', 'mysql', 'redis', 'mongodb', 'docker', 'k8s',
    'kubernetes', 'aws', 'linux', 'git', 'html', 'css', 'sass', 'tailwind', 'figma', 'photoshop',
    'excel', 'ppt', 'tableau', 'spark', 'hadoop', 'tensorflow', 'pytorch', 'nlp', 'cv',
    'ci/cd', 'graphql', 'rest', 'websocket'
  ];

  var ASCII = /[A-Za-z][A-Za-z0-9#+.]{1,}/g;

  function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

  function resumeText(r) {
    var parts = [];
    var b = r.basics || {};
    ['name', 'jobIntent', 'city', 'wechat'].forEach(function (k) { parts.push(b[k]); });
    (r.education || []).forEach(function (e) { parts.push(e.school, e.major, e.courses, e.gpa, e.rank, e.degree); });
    ['internships', 'projects', 'campus', 'research'].forEach(function (k) {
      (r[k] || []).forEach(function (e) {
        parts.push(e.company, e.org, e.name, e.role, e.city, e.link);
        (e.bullets || []).forEach(function (x) { parts.push(x); });
      });
    });
    var sk = r.skills || {};
    (sk.items || []).forEach(function (x) { parts.push(x); });
    (sk.certificates || []).forEach(function (x) { parts.push(x); });
    parts.push(sk.language);
    (r.honors || []).forEach(function (e) { parts.push(e.title); });
    parts.push(r.selfEvaluation);
    return norm(parts.join(' '));
  }

  function extractKeywords(jd, manual) {
    var seen = {}, list = [];
    function add(key, disp) {
      key = norm(key);
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push({ key: key, disp: disp });
    }
    var jdLow = norm(jd);
    /* ① 英文 token */
    var m, re = new RegExp(ASCII.source, 'g');
    while ((m = re.exec(jd)) !== null) add(m[0], m[0]);
    /* ② 词典命中 */
    DICT.forEach(function (t) { if (jdLow.includes(norm(t))) add(t, t); });
    /* ③ 手动 */
    (manual || []).forEach(function (t) { add(t, t); });
    return list;
  }

  function compute(doc) {
    var s = doc.settings || {};
    var jd = (s.jd || '').trim();
    var manual = s.jdKeywords || [];
    var kws = extractKeywords(jd, manual);
    if (!kws.length) return { active: false, total: 0, covered: [], missing: [], ratio: 0 };
    var rt = resumeText(doc.resume || {});
    var covered = [], missing = [];
    kws.forEach(function (k) { (rt.includes(k.key) ? covered : missing).push(k); });
    return { active: true, total: kws.length, covered: covered, missing: missing, ratio: covered.length / kws.length };
  }

  function chips(arr, cls) {
    return arr.map(function (k) { return '<span class="jd-chip ' + cls + '">' + esc(k.disp) + '</span>'; }).join('');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function renderLists(el, doc) {
    if (!el) return;
    var manualBox = el.querySelector('#jd-manual');
    var listBox = el.querySelector('#jd-lists');
    if (!manualBox || !listBox) return;
    var manual = (doc.settings && doc.settings.jdKeywords) || [];
    manualBox.innerHTML = manual.length
      ? manual.map(function (t, i) { return '<span class="jd-chip manual">' + esc(t) + '<button type="button" data-rm="' + i + '" title="移除">✕</button></span>'; }).join('')
      : '';
    manualBox.querySelectorAll('[data-rm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        doc.settings.jdKeywords.splice(Number(btn.dataset.rm), 1);
        window.Store.touch(); renderLists(el, doc);
      });
    });

    var c = compute(doc);
    if (!c.active) {
      listBox.innerHTML = '<div class="jd-empty">粘贴 JD 后，这里会列出你简历<strong>已覆盖</strong>与<strong>还缺</strong>的关键词 —— 只是对照清单，不是评分。</div>';
      return;
    }
    var pct = Math.round(c.ratio * 100);
    var html = '<div class="jd-cover-head"><span class="mono">关键词覆盖 ' + c.covered.length + ' / ' + c.total + '（仅对照，非评分）</span></div>' +
      '<div class="progress-track"><div class="progress-bar' + (pct === 100 ? ' full' : '') + '" style="width:' + pct + '%"></div></div>';
    if (c.missing.length) {
      html += '<div class="jd-col-label bad">还缺 · 在相关经历/技能里自然体现，勿堆砌</div><div class="jd-chips">' + chips(c.missing, 'miss') + '</div>';
    } else {
      html += '<div class="jd-ok mono">JD 关键词已全部在简历中体现 ✓</div>';
    }
    html += '<div class="jd-col-label good">已覆盖</div><div class="jd-chips">' + (c.covered.length ? chips(c.covered, 'hit') : '<span class="jd-empty">暂无</span>') + '</div>';
    listBox.innerHTML = html;
  }

  function render(el, doc) {
    if (!el) return;
    var jd = (doc.settings && doc.settings.jd) || '';
    el.innerHTML =
      '<div class="jd-head"><span class="section-num">JD</span>' +
      '<span class="jd-title">目标岗位关键词对照</span>' +
      '<button type="button" class="btn ghost jd-clear">清空</button></div>' +
      '<div class="field"><textarea class="jd-text" rows="3" placeholder="粘贴目标岗位描述，如：负责前端开发，熟悉 Vue / React，具备良好的沟通与协作能力…">' + esc(jd) + '</textarea></div>' +
      '<div class="jd-addrow"><input type="text" class="jd-add" placeholder="＋ 词典没收录的词（如某业务术语）">' +
      '<button type="button" class="btn ghost jd-addbtn">加词</button></div>' +
      '<div class="jd-chips" id="jd-manual"></div>' +
      '<div id="jd-lists"></div>';

    var ta = el.querySelector('.jd-text');
    var addInput = el.querySelector('.jd-add');
    function addWord() {
      var v = addInput.value.trim();
      if (!v) return;
      var arr = doc.settings.jdKeywords || (doc.settings.jdKeywords = []);
      if (!arr.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) arr.push(v);
      addInput.value = '';
      window.Store.touch(); renderLists(el, doc);
    }
    ta.addEventListener('input', function () { doc.settings.jd = ta.value; window.Store.touch(); renderLists(el, doc); });
    el.querySelector('.jd-addbtn').addEventListener('click', addWord);
    addInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addWord(); } });
    el.querySelector('.jd-clear').addEventListener('click', function () {
      doc.settings.jd = ''; doc.settings.jdKeywords = [];
      ta.value = ''; window.Store.touch(); renderLists(el, doc);
    });
    renderLists(el, doc);
  }

  window.JDMatch = { compute: compute, render: render, renderLists: renderLists };
})();
