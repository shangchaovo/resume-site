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

  /* 预览点选编辑：给文本片段包一层可点击标记（screen-only，不影响打印）。
     data-edit = 数据路径；data-k="c" 表示组合字段，data-parts 记录子字段顺序。 */
  function ed(path, inner, opts) {
    opts = opts || {};
    var cls = 'ped' + (opts.b ? ' ped-b' : '');
    var parts = opts.parts ? ' data-parts="' + opts.parts + '"' : '';
    var k = opts.k ? ' data-k="' + opts.k + '"' : '';
    return '<span class="' + cls + '" data-edit="' + path + '"' + parts + k + '>' + inner + '</span>';
  }
  /* 组合字段：把若干子值各自包成可点，再整体标成 combo，路径指向条目级（如 internships.<id>） */
  function combo(id, partKeys, segs) {
    var inner = segs.filter(Boolean).map(function (s, i) {
      return '<span data-part="' + i + '">' + s + '</span>';
    }).join('');
    return ed(id, inner, { k: 'c', parts: partKeys });
  }

  function period(a, b) {
    a = (a || '').trim(); b = (b || '').trim();
    if (a && b) return esc(a) + ' – ' + esc(b);
    return esc(a || b);
  }

  function bulletsHtml(kind, id, list) {
    if (!Array.isArray(list)) return '';
    var items = list.map(function (b) { return String(b || '').trim(); }).filter(Boolean);
    if (!items.length) return '';
    return '<ul class="r-bullets">' + items.map(function (b, i) {
      return '<li>' + ed(kind + '.' + id + '.bullets.' + i, esc(b), { b: 1 }) + '</li>';
    }).join('') + '</ul>';
  }

  function visible(settings, key) {
    return !(settings.hiddenSections || []).includes(key);
  }

  function hasEntries(kind, list) {
    return Array.isArray(list) && list.some(function (e) { return S.entryHasContent(kind, e); });
  }

  function entryHead(leftHtml, id, a, b) {
    var dateHtml = (a || b)
      ? ed(id + '.__period', period(a, b), { k: 'p' })
      : period(a, b);
    return '<div class="r-entry-head"><div class="r-entry-org">' + leftHtml +
      '</div><div class="r-entry-date">' + dateHtml + '</div></div>';
  }

  /* ---------- 共享分区片段 ---------- */

  function educationBlock(r, titleCls) {
    if (!hasEntries('education', r.education)) return '';
    var items = r.education.filter(function (e) { return S.entryHasContent('education', e); });
    var inner = items.map(function (e) {
      var segs = [e.school ? esc(e.school) : '',
        (e.major ? '<em>' + esc(e.major) + (e.degree ? ' · ' + esc(e.degree) : '') + '</em>' : '')];
      var left = combo('education.' + e.id, 'school,major,degree', segs);
      var h = '<div class="r-entry">' + entryHead(left, 'education.' + e.id, e.start, e.end);
      if (e.gpa || e.rank) {
        h += '<div class="r-subline r-gpa-line">' +
          (e.gpa ? ed('education.' + e.id + '.gpa', 'GPA <strong>' + esc(e.gpa) + '</strong>') : '') +
          (e.gpa && e.rank ? ' ' : '') +
          (e.rank ? ed('education.' + e.id + '.rank', '排名 <strong>' + esc(e.rank) + '</strong>') : '') + '</div>';
      }
      if (e.courses) h += '<div class="r-courses">' + ed('education.' + e.id + '.courses', '主修课程：' + esc(e.courses)) + '</div>';
      return h + '</div>';
    }).join('');
    return sec('education', '教育背景', titleCls, inner);
  }

  function entryBlock(key, title, kind, list, leftFn, titleCls) {
    if (!hasEntries(kind, list)) return '';
    var inner = list.filter(function (e) { return S.entryHasContent(kind, e); }).map(function (e) {
      var h = '<div class="r-entry">' + entryHead(leftFn(e), kind + '.' + e.id, e.start, e.end);
      if (kind === 'projects' && e.link) h += '<div class="r-subline">' + ed('projects.' + e.id + '.link', esc(e.link)) + '</div>';
      h += bulletsHtml(kind, e.id, e.bullets);
      return h + '</div>';
    }).join('');
    return sec(key, title, titleCls, inner);
  }

  function internLeft(e) {
    return combo('internships.' + e.id, 'company,role,city', [
      e.company ? esc(e.company) : '',
      e.role ? '<em>' + esc(e.role) + '</em>' : '',
      e.city ? '<span class="r-org-extra">' + esc(e.city) + '</span>' : ''
    ]);
  }
  function projectLeft(e) {
    return combo('projects.' + e.id, 'name,role', [
      e.name ? esc(e.name) : '',
      e.role ? '<em>' + esc(e.role) + '</em>' : ''
    ]);
  }
  function campusLeft(e) {
    return combo('campus.' + e.id, 'org,role', [
      e.org ? esc(e.org) : '',
      e.role ? '<em>' + esc(e.role) + '</em>' : ''
    ]);
  }
  function researchLeft(e) {
    return combo('research.' + e.id, 'name,role', [
      e.name ? esc(e.name) : '',
      e.role ? '<em>' + esc(e.role) + '</em>' : ''
    ]);
  }

  function skillsHas(r) {
    var sk = r.skills || {};
    return (sk.items || []).some(function (i) { return String(i).trim(); }) ||
      (sk.certificates || []).some(function (c) { return String(c).trim(); }) ||
      String(sk.language || '').trim();
  }

  function contactParts(b) {
    var out = [];
    if (b.phone) out.push(ed('basics.phone', esc(b.phone)));
    if (b.email) out.push(ed('basics.email', esc(b.email)));
    if (b.wechat) out.push(ed('basics.wechat', '微信 ' + esc(b.wechat)));
    if (b.city) out.push(ed('basics.city', esc(b.city)));
    if (b.birthYear) out.push(ed('basics.birthYear', esc(b.birthYear) + ' 年'));
    if (b.politicalStatus) out.push(ed('basics.politicalStatus', esc(b.politicalStatus)));
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
      '<div class="r-name">' + ed('basics.name', esc(b.name || '你的姓名')) + '</div>' +
      (b.jobIntent ? '<div class="r-intent">' + ed('basics.jobIntent', esc(b.jobIntent)) + '</div>' : '') +
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
        sec('selfEvaluation', '自我评价', '', '<p class="r-self">' + ed('selfEvaluation', esc(r.selfEvaluation), { b: 1 }) + '</p>') : '') +
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
        items.map(function (i, x) { return '<li>' + ed('skills.items.' + x, esc(i), { b: 1 }) + '</li>'; }).join('') + '</ul>';
    }
    if (String(sk.language || '').trim()) h += '<ul class="r-bullets r-skill-items"><li>' + ed('skills.language', esc(sk.language), { b: 1 }) + '</li></ul>';
    if (certs.length) h += '<ul class="r-bullets r-skill-items"><li>' + ed('skills.certificates', '证书：' + certs.map(esc).join('、'), { b: 1 }) + '</li></ul>';
    return sec('skills', '技能 · 证书', '', h);
  }

  function honorsBlock(r) {
    if (!hasEntries('honors', r.honors)) return '';
    var inner = '<div class="r-honors">' +
      r.honors.filter(function (e) { return S.entryHasContent('honors', e); }).map(function (e) {
        return '<div class="r-honor"><span>' + ed('honors.' + e.id + '.title', esc(e.title)) +
          (e.level ? '<span class="lv">' + esc(e.level) + '</span>' : '') + '</span>' +
          (e.date ? '<span class="date">' + ed('honors.' + e.id + '.date', esc(e.date)) + '</span>' : '') + '</div>';
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
      ['电话', b.phone, 'phone'], ['邮箱', b.email, 'email'], ['微信', b.wechat, 'wechat'],
      ['城市', b.city, 'city'], ['出生', b.birthYear ? b.birthYear + ' 年' : '', 'birthYear'],
      ['政治面貌', b.politicalStatus, 'politicalStatus']
    ].filter(function (x) { return x[1]; });
    if (rows.length) {
      contactList = '<ul class="r-contact-list">' + rows.map(function (x) {
        return '<li><span class="k">' + x[0] + '</span>' + ed('basics.' + x[2], esc(x[1])) + '</li>';
      }).join('') + '</ul>';
    }

    var photoHtml = b.photo
      ? '<span class="ped" data-edit="basics.photo" data-k="photo">' + photoImg(b) + '</span>'
      : '';
    var side =
      photoHtml +
      '<div class="r-name">' + ed('basics.name', esc(b.name || '你的姓名')) + '</div>' +
      (b.jobIntent ? '<div class="r-intent">' + ed('basics.jobIntent', esc(b.jobIntent)) + '</div>' : '');

    if (contactList) side += sec('contact', '联系方式', 'side', contactList);
    if (visible(settings, 'skills') && (sk.items || []).some(function (i) { return String(i).trim(); })) {
      side += sec('skills', '专业技能', 'side',
        '<ul class="r-bullets r-skill-items">' +
        sk.items.filter(function (i) { return String(i).trim(); })
          .map(function (i, x) { return '<li>' + ed('skills.items.' + x, esc(i), { b: 1 }) + '</li>'; }).join('') + '</ul>');
    }
    if (visible(settings, 'skills') && (String(sk.language || '').trim() || (sk.certificates || []).some(function (c) { return String(c).trim(); }))) {
      var certHtml = '';
      if (String(sk.language || '').trim()) certHtml += '<div class="r-cert">' + ed('skills.language', esc(sk.language)) + '</div>';
      (sk.certificates || []).filter(function (c) { return String(c).trim(); }).forEach(function (c) {
        certHtml += '<div class="r-cert">' + esc(c) + '</div>';
      });
      side += sec('cert', '语言 · 证书', 'side', certHtml);
    }
    if (visible(settings, 'honors') && hasEntries('honors', r.honors)) {
      side += sec('honors', '荣誉奖项', 'side',
        r.honors.filter(function (e) { return S.entryHasContent('honors', e); }).map(function (e) {
          return '<div class="r-honor-s">' + ed('honors.' + e.id + '.title', esc(e.title)) +
            (e.level ? '<span class="lv">' + esc(e.level) + '</span>' : '') +
            (e.date ? '<span class="date">' + ed('honors.' + e.id + '.date', esc(e.date)) + '</span>' : '') + '</div>';
        }).join(''));
    }
    if (visible(settings, 'selfEvaluation') && String(r.selfEvaluation || '').trim()) {
      side += sec('selfEvaluation', '自我评价', 'side', '<p class="r-self">' + ed('selfEvaluation', esc(r.selfEvaluation), { b: 1 }) + '</p>');
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
      '<div class="r-name">' + ed('basics.name', esc(b.name || '你的姓名')) + '</div>' +
      (b.jobIntent ? '<div class="r-head-sub">' + ed('basics.jobIntent', esc(b.jobIntent)) + '</div>' : '') +
      '<div class="r-contact">' + contactParts(b).join('<span class="sep">|</span>') + '</div>' +
      '</header>';

    var papersBlock = '';
    if (visible(settings, 'papers') && hasEntries('papers', r.papers)) {
      var idx = 0;
      papersBlock = sec('papers', '论文发表', '',
        r.papers.filter(function (e) { return S.entryHasContent('papers', e); }).map(function (e) {
          idx += 1;
          return '<div class="r-paper">' +
            (e.date ? '<span class="date">' + ed('papers.' + e.id + '.date', esc(e.date)) + '</span>' : '') +
            '[' + idx + '] <span class="t">' + ed('papers.' + e.id + '.title', esc(e.title)) + '</span>. ' +
            (e.venue ? '<span class="venue">' + ed('papers.' + e.id + '.venue', esc(e.venue)) + '</span>. ' : '') +
            (e.note ? '<span class="note">' + ed('papers.' + e.id + '.note', esc(e.note)) + '</span>' : '') + '</div>';
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
