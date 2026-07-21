/**
 * templates.js — 三个纯函数渲染器：doc → A4 简历 HTML
 * 暴露全局：Templates.render(doc)
 * 规则：空字段/空条目一律跳过，绝不输出空行。
 */
(function () {
  'use strict';

  var S = window.ResumeSchema;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function period(a, b) {
    a = (a || '').trim(); b = (b || '').trim();
    if (a && b) return esc(a) + ' – ' + esc(b);
    return esc(a || b);
  }

  function bulletsHtml(list) {
    if (!Array.isArray(list)) return '';
    var items = list.map(function (b) { return String(b || '').trim(); }).filter(Boolean);
    if (!items.length) return '';
    return '<ul class="r-bullets">' + items.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
  }

  function visible(settings, key) {
    return !(settings.hiddenSections || []).includes(key);
  }

  function hasEntries(kind, list) {
    return Array.isArray(list) && list.some(function (e) { return S.entryHasContent(kind, e); });
  }

  function entryHead(leftHtml, dateText) {
    return '<div class="r-entry-head"><div class="r-entry-org">' + leftHtml +
      '</div><div class="r-entry-date">' + period(dateText && dateText[0], dateText && dateText[1]) + '</div></div>';
  }

  /* ---------- 共享分区片段 ---------- */

  function educationBlock(r, titleCls) {
    if (!hasEntries('education', r.education)) return '';
    var items = r.education.filter(function (e) { return S.entryHasContent('education', e); });
    var inner = items.map(function (e) {
      var left = esc(e.school) + (e.major ? '<em>' + esc(e.major) + (e.degree ? ' · ' + esc(e.degree) : '') + '</em>' : '');
      var h = '<div class="r-entry">' + entryHead(left, [e.start, e.end]);
      if (e.gpa || e.rank) {
        h += '<div class="r-subline r-gpa-line">' +
          (e.gpa ? 'GPA <strong>' + esc(e.gpa) + '</strong>' : '') +
          (e.gpa && e.rank ? ' ' : '') +
          (e.rank ? '排名 <strong>' + esc(e.rank) + '</strong>' : '') + '</div>';
      }
      if (e.courses) h += '<div class="r-courses">主修课程：' + esc(e.courses) + '</div>';
      return h + '</div>';
    }).join('');
    return sec('education', '教育背景', titleCls, inner);
  }

  function entryBlock(key, title, kind, list, leftFn, titleCls) {
    if (!hasEntries(kind, list)) return '';
    var inner = list.filter(function (e) { return S.entryHasContent(kind, e); }).map(function (e) {
      var h = '<div class="r-entry">' + entryHead(leftFn(e), [e.start, e.end]);
      if (kind === 'projects' && e.link) h += '<div class="r-subline">' + esc(e.link) + '</div>';
      h += bulletsHtml(e.bullets);
      return h + '</div>';
    }).join('');
    return sec(key, title, titleCls, inner);
  }

  function internLeft(e) {
    return esc(e.company) + (e.role ? '<em>' + esc(e.role) + '</em>' : '') +
      (e.city ? '<span class="r-org-extra">' + esc(e.city) + '</span>' : '');
  }
  function projectLeft(e) { return esc(e.name) + (e.role ? '<em>' + esc(e.role) + '</em>' : ''); }
  function campusLeft(e) { return esc(e.org) + (e.role ? '<em>' + esc(e.role) + '</em>' : ''); }
  function researchLeft(e) { return esc(e.name) + (e.role ? '<em>' + esc(e.role) + '</em>' : ''); }

  function skillsHas(r) {
    var sk = r.skills || {};
    return (sk.items || []).some(function (i) { return String(i).trim(); }) ||
      (sk.certificates || []).some(function (c) { return String(c).trim(); }) ||
      String(sk.language || '').trim();
  }

  function contactParts(b, skip) {
    skip = skip || [];
    var out = [];
    if (b.phone && !skip.includes('phone')) out.push(esc(b.phone));
    if (b.email && !skip.includes('email')) out.push(esc(b.email));
    if (b.wechat && !skip.includes('wechat')) out.push('微信 ' + esc(b.wechat));
    if (b.city) out.push(esc(b.city));
    if (b.birthYear) out.push(esc(b.birthYear) + ' 年');
    if (b.politicalStatus) out.push(esc(b.politicalStatus));
    return out;
  }

  function photoImg(b, extraCls) {
    if (!b.photo) return '';
    return '<img class="r-photo' + (extraCls ? ' ' + extraCls : '') + '" src="' + esc(b.photo) + '" alt="证件照">';
  }

  function sec(key, title, titleCls, inner) {
    return '<section class="r-sec" data-sec="' + key + '"><h3 class="r-sec-title' +
      (titleCls ? ' ' + titleCls : '') + '">' + esc(title) + '</h3>' + inner + '</section>';
  }

  /* =====================================================================
     模板一：tpl-modern 简约现代单栏
     ===================================================================== */

  function renderModern(r, settings) {
    var b = r.basics || {};
    var head =
      '<header class="r-head"><div class="r-head-left">' +
      '<div class="r-name">' + esc(b.name || '你的姓名') + '</div>' +
      (b.jobIntent ? '<div class="r-intent">' + esc(b.jobIntent) + '</div>' : '') +
      '<div class="r-contact">' + contactParts(b).join('<span class="sep">|</span>') + '</div>' +
      '</div>' + photoImg(b) + '</header>';

    var body = '<div class="r-body">' +
      educationBlock(r) +
      (visible(settings, 'internships') ? entryBlock('internships', '实习经历', 'internships', r.internships, internLeft) : '') +
      (visible(settings, 'projects') ? entryBlock('projects', '项目经历', 'projects', r.projects, projectLeft) : '') +
      (visible(settings, 'campus') ? entryBlock('campus', '校园经历', 'campus', r.campus, campusLeft) : '') +
      (visible(settings, 'skills') && skillsHas(r) ? skillsBlock(r) : '') +
      (visible(settings, 'honors') ? honorsBlock(r) : '') +
      (visible(settings, 'selfEvaluation') && String(r.selfEvaluation || '').trim() ?
        sec('selfEvaluation', '自我评价', '', '<p class="r-self">' + esc(r.selfEvaluation) + '</p>') : '') +
      '</div>';
    return head + body;
  }

  function skillsBlock(r) {
    var sk = r.skills || {};
    var items = (sk.items || []).filter(function (i) { return String(i).trim(); });
    var certs = (sk.certificates || []).filter(function (c) { return String(c).trim(); });
    var h = '';
    if (items.length) {
      h += '<ul class="r-bullets r-skill-items">' +
        items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
    }
    if (String(sk.language || '').trim()) h += '<ul class="r-bullets r-skill-items"><li>' + esc(sk.language) + '</li></ul>';
    if (certs.length) h += '<ul class="r-bullets r-skill-items"><li>证书：' + certs.map(esc).join('、') + '</li></ul>';
    return sec('skills', '技能 · 证书', '', h);
  }

  function honorsBlock(r) {
    if (!hasEntries('honors', r.honors)) return '';
    var inner = '<div class="r-honors">' +
      r.honors.filter(function (e) { return S.entryHasContent('honors', e); }).map(function (e) {
        return '<div class="r-honor"><span>' + esc(e.title) +
          (e.level ? '<span class="lv">' + esc(e.level) + '</span>' : '') + '</span>' +
          (e.date ? '<span class="date">' + esc(e.date) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    return sec('honors', '荣誉奖项', '', inner);
  }

  /* =====================================================================
     模板二：tpl-classic 经典双栏
     ===================================================================== */

  function renderClassic(r, settings) {
    var b = r.basics || {};
    var sk = r.skills || {};

    /* 左栏 */
    var contactList = '';
    var rows = [
      ['电话', b.phone], ['邮箱', b.email], ['微信', b.wechat],
      ['城市', b.city], ['出生', b.birthYear ? b.birthYear + ' 年' : ''],
      ['政治面貌', b.politicalStatus]
    ].filter(function (x) { return x[1]; });
    if (rows.length) {
      contactList = '<ul class="r-contact-list">' + rows.map(function (x) {
        return '<li><span class="k">' + x[0] + '</span>' + esc(x[1]) + '</li>';
      }).join('') + '</ul>';
    }

    var side =
      photoImg(b) +
      '<div class="r-name">' + esc(b.name || '你的姓名') + '</div>' +
      (b.jobIntent ? '<div class="r-intent">' + esc(b.jobIntent) + '</div>' : '');

    if (contactList) side += sec('contact', '联系方式', 'side', contactList);
    if (visible(settings, 'skills') && (sk.items || []).some(function (i) { return String(i).trim(); })) {
      side += sec('skills', '专业技能', 'side',
        '<ul class="r-bullets r-skill-items">' +
        sk.items.filter(function (i) { return String(i).trim(); })
          .map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>');
    }
    if (visible(settings, 'skills') && (String(sk.language || '').trim() || (sk.certificates || []).some(function (c) { return String(c).trim(); }))) {
      var certHtml = '';
      if (String(sk.language || '').trim()) certHtml += '<div class="r-cert">' + esc(sk.language) + '</div>';
      (sk.certificates || []).filter(function (c) { return String(c).trim(); }).forEach(function (c) {
        certHtml += '<div class="r-cert">' + esc(c) + '</div>';
      });
      side += sec('cert', '语言 · 证书', 'side', certHtml);
    }
    if (visible(settings, 'honors') && hasEntries('honors', r.honors)) {
      side += sec('honors', '荣誉奖项', 'side',
        r.honors.filter(function (e) { return S.entryHasContent('honors', e); }).map(function (e) {
          return '<div class="r-honor-s">' + esc(e.title) +
            (e.level ? '<span class="lv">' + esc(e.level) + '</span>' : '') +
            (e.date ? '<span class="date">' + esc(e.date) + '</span>' : '') + '</div>';
        }).join(''));
    }
    if (visible(settings, 'selfEvaluation') && String(r.selfEvaluation || '').trim()) {
      side += sec('selfEvaluation', '自我评价', 'side', '<p class="r-self">' + esc(r.selfEvaluation) + '</p>');
    }

    /* 右栏 */
    var main =
      educationBlock(r) +
      (visible(settings, 'internships') ? entryBlock('internships', '实习经历', 'internships', r.internships, internLeft) : '') +
      (visible(settings, 'projects') ? entryBlock('projects', '项目经历', 'projects', r.projects, projectLeft) : '') +
      (visible(settings, 'campus') ? entryBlock('campus', '校园经历', 'campus', r.campus, campusLeft) : '');

    return '<div class="r-grid"><aside class="r-side">' + side + '</aside><div class="r-main">' + main + '</div></div>';
  }

  /* =====================================================================
     模板三：tpl-academic 学术深造
     ===================================================================== */

  function renderAcademic(r, settings) {
    var b = r.basics || {};
    var head =
      '<header class="r-head">' +
      '<div class="r-name">' + esc(b.name || '你的姓名') + '</div>' +
      (b.jobIntent ? '<div class="r-head-sub">' + esc(b.jobIntent) + '</div>' : '') +
      '<div class="r-contact">' + contactParts(b).join('<span class="sep">|</span>') + '</div>' +
      '</header>';

    var papersBlock = '';
    if (visible(settings, 'papers') && hasEntries('papers', r.papers)) {
      var idx = 0;
      papersBlock = sec('papers', '论文发表', '',
        r.papers.filter(function (e) { return S.entryHasContent('papers', e); }).map(function (e) {
          idx += 1;
          return '<div class="r-paper">' +
            (e.date ? '<span class="date">' + esc(e.date) + '</span>' : '') +
            '[' + idx + '] <span class="t">' + esc(e.title) + '</span>. ' +
            (e.venue ? '<span class="venue">' + esc(e.venue) + '</span>. ' : '') +
            (e.note ? '<span class="note">' + esc(e.note) + '</span>' : '') + '</div>';
        }).join(''));
    }

    var body = '<div class="r-body">' +
      educationBlock(r) +
      (visible(settings, 'research') ? entryBlock('research', '科研经历', 'research', r.research, researchLeft) : '') +
      papersBlock +
      (visible(settings, 'projects') ? entryBlock('projects', '项目经历', 'projects', r.projects, projectLeft) : '') +
      (visible(settings, 'internships') ? entryBlock('internships', '实习经历', 'internships', r.internships, internLeft) : '') +
      (visible(settings, 'campus') ? entryBlock('campus', '校园经历', 'campus', r.campus, campusLeft) : '') +
      (visible(settings, 'honors') ? honorsBlock(r) : '') +
      (visible(settings, 'skills') && skillsHas(r) ? skillsBlock(r) : '') +
      '</div>';
    return head + body;
  }

  var RENDERERS = { modern: renderModern, classic: renderClassic, academic: renderAcademic };

  function render(doc) {
    var settings = doc.settings || {};
    var fn = RENDERERS[settings.template] || renderModern;
    return fn(doc.resume || {}, settings);
  }

  window.Templates = { render: render, esc: esc };
})();
