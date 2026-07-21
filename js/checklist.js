/**
 * checklist.js — 完成度规则引擎（11 条计算项 + 3 条手动确认）
 * 暴露全局：Checklist
 */
(function () {
  'use strict';

  var S = window.ResumeSchema;
  var root = null;
  var manualState = {};   // 从 Store.getUI 恢复
  var currentPage = 1;

  var MANUAL = [
    { id: 'truth', text: '每条经历都真实、能在面试里被追问核验' },
    { id: 'relevant', text: '每条都与目标岗位相关（无关的果断删掉）' },
    { id: 'expand', text: '每条都能在面试里展开讲 1–2 分钟' },
    { id: 'polish', text: '已通读：无错别字、无中英文标点混用' }
  ];

  /* 每条规则：{ id, text, tip(失败提示), target(点击跳转的 data-path 前缀), pass(doc, pages) } */
  var RULES = [
    {
      id: 'name', text: '姓名已填写', tip: '简历最上方必须是你真实的姓名', target: 'basics.name',
      pass: function (d) { return !!(d.resume.basics.name || '').trim(); }
    },
    {
      id: 'phone', text: '手机号格式正确', tip: '11 位大陆手机号，HR 联系你的主要方式', target: 'basics.phone',
      pass: function (d) { return /^1[3-9]\d{9}$/.test((d.resume.basics.phone || '').trim()); }
    },
    {
      id: 'email', text: '邮箱格式正确', tip: '建议用 edu 邮箱或 Gmail/Outlook，避免 QQ 数字邮箱', target: 'basics.email',
      pass: function (d) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((d.resume.basics.email || '').trim()); }
    },
    {
      id: 'intent', text: '求职意向已填写', tip: '明确写出目标岗位，如「前端开发工程师（2026 届校招）」', target: 'basics.jobIntent',
      pass: function (d) { return !!(d.resume.basics.jobIntent || '').trim(); }
    },
    {
      id: 'edu', text: '教育经历完整', tip: '至少一条：学校 + 专业 + 起止时间', target: 'education',
      pass: function (d) {
        return (d.resume.education || []).some(function (e) {
          return e.school && e.major && e.start && e.end;
        });
      }
    },
    {
      id: 'exp2', text: '至少 2 段经历', tip: '实习 + 项目 + 校园经历合计至少 2 段，校招看重实践', target: 'internships',
      pass: function (d) {
        var n = 0;
        ['internships', 'projects', 'campus'].forEach(function (k) {
          (d.resume[k] || []).forEach(function (e) { if (S.entryHasContent(k, e)) n++; });
        });
        return n >= 2;
      }
    },
    {
      id: 'quant', text: '经历含量化数据', tip: '至少 2 条描述带数字（%、万、人次、倍、天…）——量化是校招简历的分水岭', target: 'internships',
      pass: function (d) {
        var n = 0;
        ['internships', 'projects', 'campus', 'research'].forEach(function (k) {
          (d.resume[k] || []).forEach(function (e) {
            (e.bullets || []).forEach(function (b) {
              if (/\d+\s*(%|％|万|倍|人次|名|天|小时|元|ms|k|万\+|\+)/.test(b)) n++;
            });
          });
        });
        return n >= 2;
      }
    },
    {
      id: 'hollow', text: '经历无空心描述', target: null,
      detail: function (doc) {
        var s = window.ContentLib.scanDoc(doc);
        return {
          ok: s.count === 0,
          tip: s.count + ' 条疑似空心句：动词开头后补「方法 + 量化结果」',
          target: s.firstPath
        };
      }
    },
    {
      id: 'specific', text: '经历描述够具体', tip: '至少 60% 的描述行 ≥15 字；太短说明没有展开「做了什么 + 结果」', target: 'internships',
      pass: function (d) {
        var all = [], longEnough = 0;
        ['internships', 'projects', 'campus', 'research'].forEach(function (k) {
          (d.resume[k] || []).forEach(function (e) {
            (e.bullets || []).forEach(function (b) {
              b = String(b || '').trim();
              if (!b) return;
              all.push(b);
              if (b.length >= 15) longEnough++;
            });
          });
        });
        if (all.length < 2) return false;
        return longEnough / all.length >= 0.6;
      }
    },
    {
      id: 'order', text: '时间倒序排列', tip: '最近的经历写在最前面（可用条目右侧 ▲▼ 或拖拽调整）', target: 'internships',
      pass: function (d) {
        var ok = true;
        ['education', 'internships', 'projects', 'campus', 'research'].forEach(function (k) {
          var dated = (d.resume[k] || []).filter(function (e) { return e && e.start; });
          for (var i = 1; i < dated.length; i++) {
            if (normDate(dated[i - 1].start) < normDate(dated[i].start)) ok = false;
          }
        });
        return ok;
      }
    },
    {
      id: 'jdmatch', text: 'JD 关键词已覆盖', target: '__jd',
      detail: function (doc) {
        var jd = (doc.settings && doc.settings.jd || '').trim();
        if (!jd) return { ok: true, tip: '', target: '__jd' };
        var m = window.JDMatch.compute(doc);
        if (!m.active || !m.missing.length) return { ok: true, tip: '', target: '__jd' };
        return {
          ok: false,
          tip: 'JD 还缺：' + m.missing.slice(0, 4).map(function (x) { return x.disp; }).join('、'),
          target: '__jd'
        };
      }
    },
    {
      id: 'onepage', text: '页数控制得当', tip: '校招建议 1 页；保研 / 学术模板最多 2 页。超出请删减低相关经历或切换「紧凑」密度', target: null,
      pass: function (d) {
        var limit = (d.settings && d.settings.template === 'academic') ? 2 : 1;
        return currentPage <= limit;
      }
    },
    {
      id: 'self', text: '自我评价精炼', tip: '自评控制在 100 字以内；没有实质证据就不写', target: 'selfEvaluation',
      pass: function (d) {
        var t = (d.resume.selfEvaluation || '').trim();
        return !t || t.length <= 100;
      }
    }
  ];

  function normDate(s) {
    var m = String(s || '').match(/(\d{4})[.\-/年]?(\d{1,2})?/);
    if (!m) return 0;
    return Number(m[1]) * 12 + Number(m[2] || 0);
  }

  function init(container) {
    root = container;
    var ui = window.Store.getUI();
    manualState = ui.manualChecks || {};
    window.Preview.onPageCount(function (p) { currentPage = p; render(window.Store.getCurrent()); });
  }

  function render(doc) {
    if (!root || !doc) return;
    var passed = 0;
    var rows = RULES.map(function (r) {
      var info = r.detail ? r.detail(doc, currentPage)
        : { ok: !!r.pass(doc, currentPage), tip: r.tip, target: r.target };
      var ok = !!info.ok;
      if (ok) passed++;
      return '<button class="check-row ' + (ok ? 'pass' : 'fail') + '"' +
        (info.target ? ' data-target="' + info.target + '"' : '') + ' type="button">' +
        '<span class="check-icon">' + (ok ? '✓' : '!') + '</span>' +
        '<span class="check-row-body"><span>' + r.text + '</span>' +
        (!ok && info.tip ? '<span class="check-tip">' + info.tip + '</span>' : '') +
        '</span></button>';
    }).join('');

    var manualDone = MANUAL.filter(function (m) { return manualState[m.id]; }).length;
    var manualRows = MANUAL.map(function (m) {
      return '<button class="check-row manual-row' + (manualState[m.id] ? ' checked' : '') + '" data-manual="' + m.id + '" type="button">' +
        '<span class="check-icon">✓</span><span class="check-row-body"><span>' + m.text + '</span></span></button>';
    }).join('');

    var pct = Math.round(passed / RULES.length * 100);
    root.innerHTML =
      '<div class="checklist-head">' +
      '<span class="checklist-title">完成度</span>' +
      '<span class="checklist-score"><strong>' + passed + '</strong>/' + RULES.length + ' · 自查 ' + manualDone + '/' + MANUAL.length + '</span>' +
      '</div>' +
      '<div class="progress-track"><div class="progress-bar' + (pct === 100 ? ' full' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<div class="checklist-rows">' + rows + '</div>' +
      '<hr class="checklist-divider">' +
      '<div class="manual-label">投递前自查</div>' +
      '<div class="checklist-rows">' + manualRows + '</div>';

    root.querySelectorAll('.check-row[data-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.dataset.target;
        if (t === '__jd') {
          var ta = document.querySelector('#jd-card textarea');
          if (ta) {
            ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            ta.focus({ preventScroll: true });
            ta.classList.remove('flash'); void ta.offsetWidth; ta.classList.add('flash');
          }
          return;
        }
        window.Editor.flashField(t);
      });
    });
    root.querySelectorAll('.check-row[data-manual]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.manual;
        manualState[id] = !manualState[id];
        window.Store.setUI({ manualChecks: manualState });
        render(window.Store.getCurrent());
      });
    });
  }

  window.Checklist = { init: init, render: render };
})();
