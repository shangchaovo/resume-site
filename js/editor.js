/**
 * editor.js — 表单构建与双向绑定、条目增删、拖拽/按钮排序、分区折叠与隐藏
 * 暴露全局：Editor
 * 原则：表单只在建表/切换草稿/增删排序时重建；打字只触发预览重渲染（Store.touch）。
 */
(function () {
  'use strict';

  var S = window.ResumeSchema;
  var doc = null;
  var root = null;

  var DEGREE_OPTS = ['本科', '硕士', '博士', '大专'];
  var LEVEL_OPTS = ['国家级', '省级', '校级', '院级'];

  /* ---------------- 分区定义 ---------------- */

  var SECTIONS = [
    { key: 'basics', num: '01', title: '个人信息', hideable: false, kind: 'basics' },
    {
      key: 'education', num: '02', title: '教育经历', kind: 'education',
      label: function (e) { return e.school || '教育经历'; },
      rows: [
        [{ k: 'school', l: '学校', ph: '浙江大学' }, { k: 'degree', l: '学历', w: 'select', opts: DEGREE_OPTS }],
        [{ k: 'major', l: '专业', ph: '计算机科学与技术' }, { k: 'gpa', l: 'GPA', ph: '3.8/4.0', opt: true }],
        [{ k: 'start', l: '入学时间', ph: '2022.09' }, { k: 'end', l: '毕业时间', ph: '2026.06' }],
        [{ k: 'rank', l: '排名', ph: '前 10% 或 5/120', opt: true }],
        [{ k: 'courses', l: '主修课程', ph: '数据结构、操作系统、计算机网络', opt: true, hint: '用顿号分隔，只写与岗位相关的 4–6 门' }]
      ]
    },
    {
      key: 'internships', num: '03', title: '实习经历', kind: 'internships',
      label: function (e) { return e.company ? e.company + (e.role ? ' · ' + e.role : '') : '实习经历'; },
      rows: [
        [{ k: 'company', l: '公司', ph: '字节跳动' }, { k: 'role', l: '岗位', ph: '前端开发实习生' }],
        [{ k: 'city', l: '城市', ph: '杭州', opt: true }, { k: 'start', l: '开始', ph: '2025.07' }, { k: 'end', l: '结束', ph: '2025.10' }]
      ],
      bullets: true
    },
    {
      key: 'projects', num: '04', title: '项目经历', kind: 'projects',
      label: function (e) { return e.name || '项目经历'; },
      rows: [
        [{ k: 'name', l: '项目名称', ph: 'CampusBoard — 校园二手交易小程序' }, { k: 'role', l: '你的角色', ph: '项目负责人 / 前端' }],
        [{ k: 'start', l: '开始', ph: '2025.03' }, { k: 'end', l: '结束', ph: '2025.06' }],
        [{ k: 'link', l: '项目链接', ph: 'github.com/you/project', opt: true }]
      ],
      bullets: true
    },
    {
      key: 'campus', num: '05', title: '校园经历', kind: 'campus',
      label: function (e) { return e.org || '校园经历'; },
      note: '社团 · 学生干部 · 志愿',
      rows: [
        [{ k: 'org', l: '组织', ph: '校学生科协技术部' }, { k: 'role', l: '职务', ph: '副部长' }],
        [{ k: 'start', l: '开始', ph: '2023.09' }, { k: 'end', l: '结束', ph: '2024.06' }]
      ],
      bullets: true
    },
    { key: 'skills', num: '06', title: '技能 · 证书', kind: 'skills', hideable: true },
    { key: 'honors', num: '07', title: '荣誉奖项', kind: 'honors',
      label: function (e) { return e.title || '荣誉奖项'; },
      rows: [
        [{ k: 'title', l: '奖项名称', ph: '国家奖学金' }, { k: 'level', l: '级别', w: 'select', opts: LEVEL_OPTS }],
        [{ k: 'date', l: '获得时间', ph: '2024.11' }]
      ]
    },
    {
      key: 'research', num: '08', title: '科研经历', kind: 'research',
      note: '仅学术模板显示',
      label: function (e) { return e.name || '科研经历'; },
      rows: [
        [{ k: 'name', l: '课题 / 项目名称', ph: '基于 XX 的 XX 研究' }, { k: 'role', l: '你的角色', ph: '核心成员' }],
        [{ k: 'start', l: '开始', ph: '2024.09' }, { k: 'end', l: '结束', ph: '2025.05' }]
      ],
      bullets: true
    },
    {
      key: 'papers', num: '09', title: '论文发表', kind: 'papers',
      note: '仅学术模板显示',
      label: function (e) { return e.title || '论文发表'; },
      rows: [
        [{ k: 'title', l: '论文标题', ph: 'A Survey of …' }, { k: 'venue', l: '期刊 / 会议', ph: 'ACL 2026' }],
        [{ k: 'date', l: '发表时间', ph: '2026.05' }, { k: 'note', l: '备注', ph: '第一作者 / EI 检索', opt: true }]
      ]
    },
    { key: 'selfEvaluation', num: '10', title: '自我评价', kind: 'selfEvaluation', hideable: true, note: '选填' }
  ];

  /* ---------------- 初始化与建表 ---------------- */

  function init(container) {
    root = container;
  }

  function buildForm(d) {
    doc = d;
    /* 先归一各条目区：让左侧表单与右侧预览可见口径一致（有内容才显示 + 末尾一个空槽） */
    SECTIONS.forEach(function (c) {
      if (['basics', 'skills', 'selfEvaluation'].indexOf(c.kind) === -1) syncTrailingSlot(c);
    });
    root.innerHTML = '';
    var ui = window.Store.getUI();
    var collapsed = ui.collapsedSections || [];

    SECTIONS.forEach(function (cfg) {
      root.appendChild(buildSection(cfg, collapsed.indexOf(cfg.key) !== -1));
    });
  }

  function isHidden(cfg) {
    return (doc.settings.hiddenSections || []).indexOf(cfg.key) !== -1;
  }

  function buildSection(cfg, collapsed) {
    var card = el('div', 'card section-card');
    card.dataset.sec = cfg.key;
    if (collapsed) card.classList.add('collapsed');
    if (isHidden(cfg)) card.classList.add('hidden-section');

    /* 头部 */
    var head = el('div', 'section-head');
    head.innerHTML =
      '<span class="section-num">' + cfg.num + '</span>' +
      '<span class="section-title">' + cfg.title + '</span>' +
      (cfg.note ? '<span class="section-note">' + cfg.note + '</span>' : '');
    if (cfg.hideable) {
      var vis = el('button', 'section-toggle-vis');
      vis.type = 'button';
      vis.title = '在简历中显示 / 隐藏该分区';
      vis.textContent = isHidden(cfg) ? '◌' : '◉';
      vis.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleHidden(cfg.key);
        vis.textContent = isHidden(cfg) ? '◌' : '◉';
        card.classList.toggle('hidden-section', isHidden(cfg));
      });
      head.appendChild(vis);
    }
    var chev = el('span', 'section-chevron');
    chev.textContent = '▾';
    head.appendChild(chev);
    head.addEventListener('click', function () {
      card.classList.toggle('collapsed');
      persistCollapsed();
    });

    /* 内容 */
    var body = el('div', 'section-body');
    var inner = el('div', 'section-body-inner');
    body.appendChild(inner);

    switch (cfg.kind) {
      case 'basics': buildBasics(inner); break;
      case 'skills': buildSkills(inner); break;
      case 'selfEvaluation': buildSelf(inner); break;
      default: buildEntries(inner, cfg);
    }

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function persistCollapsed() {
    var list = [];
    root.querySelectorAll('.section-card.collapsed').forEach(function (c) { list.push(c.dataset.sec); });
    window.Store.setUI({ collapsedSections: list });
  }

  /* ---------------- 字段渲染 ---------------- */

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function fieldNode(spec, value, path, onInput) {
    var wrap = el('div', 'field');
    var label = el('label');
    label.textContent = spec.l;
    if (spec.opt) {
      var o = el('span', 'opt');
      o.textContent = ' · 选填';
      label.appendChild(o);
    }
    wrap.appendChild(label);

    var input;
    if (spec.w === 'select') {
      input = el('select');
      spec.opts.forEach(function (o) {
        var op = el('option');
        op.value = o; op.textContent = o;
        input.appendChild(op);
      });
      input.value = value || spec.opts[0];
    } else if (spec.w === 'textarea') {
      input = el('textarea');
      input.rows = spec.rows || 2;
      input.value = value || '';
    } else {
      input = el('input');
      input.type = 'text';
      input.value = value || '';
    }
    if (spec.ph) input.placeholder = spec.ph;
    input.dataset.path = path;
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(input);

    if (spec.hint) {
      var h = el('div', 'field-hint');
      h.textContent = spec.hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  function rowNode(fields) {
    var row = el('div', 'field-row' + (fields.length === 1 ? ' one' : '') + (fields.length === 3 ? ' three' : ''));
    fields.forEach(function (f) { row.appendChild(f); });
    return row;
  }

  /* ---------------- 分区构建：个人信息 ---------------- */

  function buildBasics(inner) {
    var b = doc.resume.basics;
    function bind(k) { return function (v) { b[k] = v; window.Store.touch(); }; }

    inner.appendChild(rowNode([
      fieldNode({ k: 'name', l: '姓名', ph: '陈晓雨' }, b.name, 'basics.name', bind('name')),
      fieldNode({ k: 'phone', l: '手机号', ph: '13800138000' }, b.phone, 'basics.phone', bind('phone'))
    ]));
    inner.appendChild(rowNode([
      fieldNode({ k: 'email', l: '邮箱', ph: 'name@example.edu.cn' }, b.email, 'basics.email', bind('email')),
      fieldNode({ k: 'wechat', l: '微信', ph: 'your_wechat', opt: true }, b.wechat, 'basics.wechat', bind('wechat'))
    ]));
    inner.appendChild(rowNode([
      fieldNode({ k: 'city', l: '所在城市', ph: '杭州', opt: true }, b.city, 'basics.city', bind('city')),
      fieldNode({ k: 'jobIntent', l: '求职意向', ph: '前端开发工程师（2026 届校招）' }, b.jobIntent, 'basics.jobIntent', bind('jobIntent'))
    ]));
    inner.appendChild(rowNode([
      fieldNode({ k: 'birthYear', l: '出生年份', ph: '2003', opt: true }, b.birthYear, 'basics.birthYear', bind('birthYear')),
      fieldNode({ k: 'politicalStatus', l: '政治面貌', ph: '共青团员', opt: true }, b.politicalStatus, 'basics.politicalStatus', bind('politicalStatus'))
    ]));

    /* 照片 */
    var pwrap = el('div', 'field');
    pwrap.innerHTML = '<label>证件照 <span class="opt">· 选填，建议正式证件照</span></label>';
    var picker = el('div', 'photo-picker');
    var thumb = el('div', 'photo-thumb');
    if (b.photo) thumb.style.backgroundImage = 'url(' + b.photo + ')';
    else thumb.textContent = '＋';
    var actions = el('div', 'photo-actions');
    var upBtn = el('button', 'btn ghost'); upBtn.type = 'button'; upBtn.textContent = '上传照片';
    var delBtn = el('button', 'btn ghost'); delBtn.type = 'button'; delBtn.textContent = '移除';
    actions.appendChild(upBtn); actions.appendChild(delBtn);
    picker.appendChild(thumb); picker.appendChild(actions);
    pwrap.appendChild(picker);
    inner.appendChild(pwrap);

    var fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.hidden = true;
    pwrap.appendChild(fileInput);
    upBtn.addEventListener('click', function () { fileInput.click(); });
    delBtn.addEventListener('click', function () {
      b.photo = '';
      thumb.style.backgroundImage = '';
      thumb.textContent = '＋';
      window.Store.touch();
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      compressPhoto(file, function (dataUrl) {
        b.photo = dataUrl;
        thumb.style.backgroundImage = 'url(' + dataUrl + ')';
        thumb.textContent = '';
        window.Store.touch();
      });
      fileInput.value = '';
    });
  }

  /* 压缩到 ≤400×533，JPEG q0.85，避免撑爆 localStorage */
  function compressPhoto(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var maxW = 400, maxH = 533;
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxW / w, maxH / h);
        w = Math.round(w * scale); h = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(canvas.toDataURL('image/jpeg', 0.85)); }
        catch (e) { cb(reader.result); }
      };
      img.onerror = function () { cb(reader.result); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------------- 分区构建：技能 / 自评 ---------------- */

  function linesBind(getArr, setArr) {
    return function (v) {
      var lines = v.split('\n');
      setArr(lines);
      window.Store.touch();
    };
  }

  function buildSkills(inner) {
    var sk = doc.resume.skills;
    inner.appendChild(rowNode([
      fieldNode({ l: '技能点', w: 'textarea', rows: 4, ph: '熟练掌握 HTML / CSS / JavaScript…\n熟练使用 Vue 3 / React…', hint: '一行一条 · 用「熟练 / 熟悉 / 了解」分层，别用百分比进度条' },
        (sk.items || []).join('\n'), 'skills.items', linesBind(null, function (a) { sk.items = a; }))
    ]));
    inner.appendChild(rowNode([
      fieldNode({ l: '证书', w: 'textarea', rows: 2, ph: 'CET-6（586 分）\n软件设计师', hint: '一行一条' },
        (sk.certificates || []).join('\n'), 'skills.certificates', linesBind(null, function (a) { sk.certificates = a; }))
    ]));
    inner.appendChild(rowNode([
      fieldNode({ l: '语言能力', ph: '英语 CET-6（580），能流畅阅读英文技术文档', opt: true },
        sk.language || '', 'skills.language', function (v) { sk.language = v; window.Store.touch(); })
    ]));
  }

  function buildSelf(inner) {
    inner.appendChild(rowNode([
      fieldNode({ l: '自我评价', w: 'textarea', rows: 3, ph: '一句话证据胜过十句空话：两年前端项目经验，独立负责过从 0 到 1 的产品…', hint: '建议 100 字以内；没有实质内容就不写' },
        doc.resume.selfEvaluation || '', 'selfEvaluation', function (v) { doc.resume.selfEvaluation = v; window.Store.touch(); })
    ]));
  }

  /* ---------------- 分区构建：条目列表 ---------------- */

  function buildEntries(inner, cfg) {
    var list = doc.resume[cfg.key] || [];
    list.forEach(function (entry, idx) {
      inner.appendChild(entryNode(cfg, entry, idx, list));
    });

    var add = el('button', 'btn-add');
    add.type = 'button';
    add.textContent = '＋ 添加' + cfg.title;
    add.addEventListener('click', function () {
      list.push(S.emptyEntry(cfg.kind));
      window.Store.touch();
      rebuildSection(cfg.key);
    });
    inner.appendChild(add);
  }

  /* 有内容的条目数 —— 与右侧预览 entryHasContent 的可见口径一致 */
  function filledCount(cfg, list) {
    return (list || []).filter(function (e) { return S.entryHasContent(cfg.kind, e); }).length;
  }

  /* 维护「末尾空待填槽」：有内容 → 保证末尾恰好一个空槽；全空 → 清空列表。
     让左侧表单与右侧预览的可见条目始终保持同步。 */
  function syncTrailingSlot(cfg) {
    var list = doc.resume[cfg.key];
    if (!Array.isArray(list)) return;
    var filled = filledCount(cfg, list);
    if (filled === 0) {
      /* 全删光了：清空（含可能残留的空壳），左右两栏同步为「无」 */
      list.length = 0;
      return;
    }
    /* 有内容：剔除除末尾外的空槽，再保证末尾恰好一个空槽 */
    for (var i = list.length - 1; i >= 0; i--) {
      var last = i === list.length - 1;
      if (!S.entryHasContent(cfg.kind, list[i]) && !last) list.splice(i, 1);
    }
    if (S.entryHasContent(cfg.kind, list[list.length - 1])) {
      list.push(S.emptyEntry(cfg.kind));
    }
  }

  /* 经历描述的增强：行内空心提示 + 示例句库 + 动词库（反同质化，纯规则） */
  function attachBulletsExtras(wrap, ta, kind) {
    if (!wrap || !ta) return;

    var toggle = el('button', 'btn-link');
    toggle.type = 'button';
    toggle.textContent = '＋ 看示例句 / 动词库';

    var panel = el('div', 'ex-panel');
    panel.hidden = true;
    var ex = (window.ContentLib.EXEMPLARS[kind] || window.ContentLib.EXEMPLARS.internships);
    var exWrap = el('div', 'ex-group');
    exWrap.innerHTML = '<div class="ex-label mono">本类型示例（点击追加一行）</div>';
    ex.forEach(function (line) {
      var b = el('button', 'ex-line');
      b.type = 'button';
      b.textContent = line;
      b.title = '追加到描述';
      b.addEventListener('click', function () { appendLine(ta, line); });
      exWrap.appendChild(b);
    });
    panel.appendChild(exWrap);
    var vlabel = el('div', 'ex-label mono');
    vlabel.textContent = '开头动词（点击插入光标处）';
    panel.appendChild(vlabel);
    Object.keys(window.ContentLib.VERBS).forEach(function (g) {
      var row = el('div', 'verb-group');
      var gl = el('span', 'verb-glabel'); gl.textContent = g;
      row.appendChild(gl);
      window.ContentLib.VERBS[g].forEach(function (v) {
        var c = el('button', 'verb-chip');
        c.type = 'button'; c.textContent = v;
        c.addEventListener('click', function () { insertAtCaret(ta, v); });
        row.appendChild(c);
      });
      panel.appendChild(row);
    });

    var hollow = el('div', 'field-hint hollow-hint');
    hollow.hidden = true;

    toggle.addEventListener('click', function () { panel.hidden = !panel.hidden; });
    ta.addEventListener('input', function () { updateHollow(ta, hollow); });

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    wrap.appendChild(hollow);
    updateHollow(ta, hollow);
  }

  function updateHollow(ta, hint) {
    var idx = window.ContentLib.hollowLines(ta.value.split('\n'));
    if (idx.length) {
      hint.hidden = false;
      hint.textContent = '第 ' + idx.join('、') + ' 行像「空心句」：动词开头后请补「方法 + 量化结果」（提示，非判决）';
    } else {
      hint.hidden = true;
    }
  }

  function appendLine(ta, text) {
    var v = ta.value;
    ta.value = v + (v && !/\n$/.test(v) ? '\n' : '') + text;
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertAtCaret(ta, text) {
    ta.focus();
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function entryNode(cfg, entry, idx, list) {
    var card = el('div', 'entry');
    card.dataset.entryId = entry.id;

    /* 工具条 */
    var bar = el('div', 'entry-bar');
    var handle = el('span', 'entry-handle');
    handle.textContent = '⠿';
    handle.title = '拖拽排序';
    handle.draggable = true;
    bar.appendChild(handle);

    var label = el('span', 'entry-label');
    label.textContent = cfg.label ? cfg.label(entry) : cfg.title;
    bar.appendChild(label);

    var up = el('button', 'entry-move'); up.type = 'button'; up.textContent = '▲'; up.title = '上移';
    var down = el('button', 'entry-move'); down.type = 'button'; down.textContent = '▼'; down.title = '下移';
    var del = el('button', 'entry-del'); del.type = 'button'; del.textContent = '✕'; del.title = '删除该条';
    bar.appendChild(up); bar.appendChild(down); bar.appendChild(del);
    card.appendChild(bar);

    up.addEventListener('click', function () { move(cfg, idx, -1); });
    down.addEventListener('click', function () { move(cfg, idx, 1); });
    del.addEventListener('click', function () {
      list.splice(idx, 1);
      /* 删到最后一条 → 列表清空（左右同步为「无」），不再塞回残留空壳 */
      window.Store.touch();
      rebuildSection(cfg.key);
    });

    /* 字段行 */
    cfg.rows.forEach(function (row) {
      var nodes = row.map(function (spec) {
        var path = cfg.key + '.' + entry.id + '.' + spec.k;
        return fieldNode(spec, entry[spec.k], path, function (v) {
          entry[spec.k] = v;
          if (spec.k === 'school' || spec.k === 'company' || spec.k === 'name' || spec.k === 'org' || spec.k === 'title') {
            label.textContent = cfg.label(entry);
          }
          window.Store.touch();
        });
      });
      card.appendChild(rowNode(nodes));
    });

    /* 经历描述 */
    if (cfg.bullets) {
      var brow = rowNode([
        fieldNode({ l: '经历描述', w: 'textarea', rows: 4,
          ph: '负责社群运营，通过策划 12 场裂变活动，实现用户数从 0 增长至 8000+（+400%）\n主导招新流程线上化，纳新转化率提升 25%',
          hint: '一行一条 · 动词开头 + 量化结果' },
          (entry.bullets || []).join('\n'),
          cfg.key + '.' + entry.id + '.bullets',
          linesBind(null, function (a) { entry.bullets = a; }))
      ]);
      card.appendChild(brow);
      attachBulletsExtras(brow.querySelector('.field'), brow.querySelector('textarea'), cfg.kind);
    }

    /* 拖拽 */
    setupDrag(handle, card, cfg, idx, list);
    return card;
  }

  function move(cfg, idx, delta) {
    var list = doc.resume[cfg.key];
    var to = idx + delta;
    if (to < 0 || to >= list.length) return;
    var tmp = list[idx];
    list[idx] = list[to];
    list[to] = tmp;
    window.Store.touch();
    rebuildSection(cfg.key);
  }

  function setupDrag(handle, card, cfg, idx, list) {
    handle.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(idx));
      card.classList.add('dragging');
    });
    handle.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    card.addEventListener('dragover', function (ev) {
      if (card.classList.contains('dragging')) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function () { card.classList.remove('drag-over'); });
    card.addEventListener('drop', function (ev) {
      ev.preventDefault();
      card.classList.remove('drag-over');
      var from = parseInt(ev.dataTransfer.getData('text/plain'), 10);
      if (isNaN(from) || from === idx) return;
      var item = list.splice(from, 1)[0];
      if (!item) return;                       /* 防御：源下标越界（空列表） */
      list.splice(idx, 0, item);
      window.Store.touch();
      rebuildSection(cfg.key);
    });
  }

  /* 单分区重建（增删排序后） */
  function rebuildSection(key) {
    var cfg = SECTIONS.filter(function (c) { return c.key === key; })[0];
    var old = root.querySelector('.section-card[data-sec="' + key + '"]');
    if (!old) return;
    var wasCollapsed = old.classList.contains('collapsed');
    var fresh = buildSection(cfg, wasCollapsed);
    old.replaceWith(fresh);
  }

  function toggleHidden(key) {
    var arr = doc.settings.hiddenSections || (doc.settings.hiddenSections = []);
    var i = arr.indexOf(key);
    if (i === -1) arr.push(key); else arr.splice(i, 1);
    window.Store.touch();
  }

  /* 清单点击 → 闪烁定位字段 */
  function flashField(path) {
    var node = root.querySelector('[data-path="' + path + '"]') ||
               root.querySelector('[data-path^="' + path + '"]');
    if (!node) return;
    /* 若在折叠分区里，先展开 */
    var card = node.closest('.section-card');
    if (card && card.classList.contains('collapsed')) {
      card.classList.remove('collapsed');
      persistCollapsed();
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.focus({ preventScroll: true });
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
  }

  /* sheet 点选编辑后，把 doc 里某字段的最新值回写到左侧表单对应输入框（不重建、不抢焦点）。
     formPath 形如 basics.name / education.<id>.gpa / skills.items / selfEvaluation */
  function syncField(formPath, value) {
    if (!root) return;
    var node = root.querySelector('[data-path="' + formPath + '"]');
    if (!node) return;
    if (document.activeElement === node) return;   /* 用户正在该框打字就别覆盖 */
    var v = Array.isArray(value) ? value.join('\n') : (value == null ? '' : String(value));
    if (node.value !== v) node.value = v;
  }

  window.Editor = {
    init: init,
    buildForm: buildForm,
    flashField: flashField,
    syncField: syncField
  };
})();
