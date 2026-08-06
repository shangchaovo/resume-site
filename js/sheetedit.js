/**
 * sheetedit.js — 右侧简历预览「点选即改」
 * 暴露全局：SheetEdit
 *
 * 原理：templates.js 给可编辑文本包了 <span class="ped" data-edit="路径">。
 * 点击预览文字 → 选中该节点并弹出跟随的卡通小编辑框 → 读写 doc 对应字段
 * → Store.touch() 轻刷新（重渲染预览+清单，不重建左侧表单），左侧表单同步。
 *
 * 路径语法（段落用「.」分隔，最后一段是字段或数组下标）：
 *   basics.name                     基本信息字段
 *   education.<id>.gpa              条目单字段
 *   internships.<id>.bullets.2      条目第 2 条描述
 *   skills.items.0 / skills.certificates（整串顿号分隔）
 *   <kind>.<id>        （data-k="c"）组合头：公司+岗位+城市 整条一起改
 *   <kind>.<id>.__period（data-k="p"）起止时间整条
 *   basics.photo       （data-k="photo"）更换证件照
 * 编辑只改内存 doc + touch()，不整页重渲染预览 —— 避免闪烁与失焦。
 */
(function () {
  'use strict';

  var sheet = null;
  var pop = null;           // 弹层根节点
  var activeEl = null;      // 当前选中的 .ped 节点
  var activePath = null;
  var closing = false;

  /* $('#id') 取元素；$('#id .sel') 或 ('.sel', root) 走 querySelector */
  function $(s, r) {
    if (!r && s.charAt(0) === '#') {
      var parts = s.slice(1).split(/\\s+/);
      var base = document.getElementById(parts[0]);
      return parts.length > 1 && base ? base.querySelector(parts.slice(1).join(' ')) : base;
    }
    return (r || document).querySelector(s);
  }

  /* ---------------- 路径读写 ---------------- */

  function findEntry(arr, id) {
    return (arr || []).find(function (e) { return e && e.id === id; }) || null;
  }

  /* 把 data-edit 路径解析成 { get(), set(val), multiline, label } */
  function resolve(path, el) {
    var doc = window.Store.getCurrent();
    if (!doc) return null;
    var r = doc.resume;
    var seg = path.split('.');

    /* basics.* */
    if (seg[0] === 'basics') {
      var f = seg[1];
      var labels = {
        name: '姓名', jobIntent: '求职意向', phone: '手机号', email: '邮箱',
        wechat: '微信号', city: '所在城市', birthYear: '出生年份',
        politicalStatus: '政治面貌', photo: '证件照'
      };
      return {
        label: labels[f] || '个人信息',
        get: function () { return r.basics[f] || ''; },
        set: function (v) { r.basics[f] = v; }
      };
    }

    /* selfEvaluation */
    if (seg[0] === 'selfEvaluation') {
      return {
        label: '自我评价', multiline: true,
        get: function () { return r.selfEvaluation || ''; },
        set: function (v) { r.selfEvaluation = v; }
      };
    }

    /* skills.items.N / skills.language / skills.certificates */
    if (seg[0] === 'skills') {
      if (seg[1] === 'items') {
        var ix = +seg[2];
        return {
          label: '技能 · 第 ' + (ix + 1) + ' 条', multiline: true,
          get: function () { return (r.skills.items || [])[ix] || ''; },
          set: function (v) { r.skills.items[ix] = v; }
        };
      }
      if (seg[1] === 'language') {
        return {
          label: '语言 / 水平',
          get: function () { return r.skills.language || ''; },
          set: function (v) { r.skills.language = v; }
        };
      }
      if (seg[1] === 'certificates') {
        return {
          label: '证书（顿号分隔）',
          get: function () { return (r.skills.certificates || []).filter(function (c) { return String(c).trim(); }).join('、'); },
          set: function (v) {
            r.skills.certificates = String(v).split(/[、,，;；]/).map(function (s) { return s.trim(); }).filter(Boolean);
          }
        };
      }
    }

    /* 条目级：kind.id[.field | .bullets.N] */
    var kind = seg[0], id = seg[1];
    var list = r[kind];
    if (!Array.isArray(list)) return null;
    var entry = findEntry(list, id);
    if (!entry) return null;

    /* 起止时间整条（data-k="p"） */
    if (seg[2] === '__period') {
      return {
        label: '起止时间（如 2025.07 – 2025.10）',
        get: function () {
          var a = (entry.start || '').trim(), b = (entry.end || '').trim();
          return a && b ? a + ' – ' + b : (a || b);
        },
        set: function (v) {
          var p = String(v).split(/\s*[–—\-~～至]\s*|\s+-\s+/);
          entry.start = (p[0] || '').trim();
          entry.end = p.length > 1 ? (p[p.length - 1] || '').trim() : '';
        }
      };
    }

    /* 组合头整条（data-k="c"，data-parts 给出子字段顺序） */
    if (el && el.getAttribute('data-k') === 'c') {
      var parts = (el.getAttribute('data-parts') || '').split(',').filter(Boolean);
      return {
        label: '整条（留 / 可重新分行）',
        get: function () {
          return parts.map(function (k) { return (entry[k] || '').trim(); }).filter(Boolean).join('  /  ');
        },
        set: function (v) {
          var vals = String(v).split('/').map(function (s) { return s.trim(); });
          /* 过滤掉「占位空段」：用户没拆够时，保持其余字段原值 */
          parts.forEach(function (k, i) {
            if (i < vals.length) entry[k] = vals[i];
          });
        }
      };
    }

    /* bullets.N */
    if (seg[2] === 'bullets') {
      var bi = +seg[3];
      return {
        label: '经历描述 · 第 ' + (bi + 1) + ' 条', multiline: true,
        get: function () { return (entry.bullets || [])[bi] || ''; },
        set: function (v) { entry.bullets[bi] = v; }
      };
    }

    /* 普通条目单字段 */
    var field = seg[2];
    if (field) {
      return {
        label: '内容',
        get: function () { return entry[field] || ''; },
        set: function (v) { entry[field] = v; }
      };
    }
    return null;
  }

  /* ---------------- 弹层 ---------------- */

  function closePop() {
    if (closing) return;
    closing = true;
    if (activeEl) { activeEl.classList.remove('pe-hl'); activeEl = null; }
    if (pop) { pop.remove(); pop = null; }
    activePath = null;
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('resize', closePop);
    closing = false;
  }

  function onDocDown(e) {
    if (pop && !pop.contains(e.target) && activeEl && !activeEl.contains(e.target)) closePop();
  }

  function positionPop(anchor) {
    /* 挂进 .sheet-wrap（已 position:relative 且随预览一起 transform:scale）。
       getBoundingClientRect 是「缩放后」的屏幕像素，而弹层 left/top 处在
       wrap 的「未缩放」坐标系里，差一个 zoom 系数——这正是弹层会漂移的根因。
       除以 wr.width/794 还原到简历真实坐标，弹层便始终贴住被点文字、随缩放/滚动一起动。 */
    var wrap = $('#sheet-wrap');
    if (!wrap || !pop) return;
    var wr = wrap.getBoundingClientRect();
    var scale = wr.width / 794;                 /* A4 794px → 当前缩放比 */
    if (!(scale > 0)) scale = 1;
    var r = anchor.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    pop.style.left = '0px'; pop.style.top = '0px';
    /* 反向抵消缩放：弹层挂在会缩放的 wrap 里，缩小时字会跟着变小看不清，
       这里再放大回 1/scale，让弹层始终保持可读大小（位置仍贴住锚点）。 */
    pop.style.transformOrigin = 'top left';
    pop.style.transform = 'scale(' + (1 / scale) + ')';
    /* 先量尺寸（未缩放坐标系内） */
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var x = (r.left - wr.left) / scale;
    var y = (r.bottom - wr.top) / scale + 8;
    /* 横向夹取在简历宽度内（A4 宽 794） */
    x = Math.max(8, Math.min(x, 794 - pw - 8));
    /* 下方放不下就翻到上方 */
    if (y + ph > wrap.offsetHeight) {
      y = (r.top - wr.top) / scale - ph - 8;
    }
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    pop.style.visibility = 'visible';
  }

  function openEditor(el) {
    try {
    closePop();
    activeEl = el;
    activePath = el.getAttribute('data-edit');
    el.classList.add('pe-hl');

    var kind = el.getAttribute('data-k');
    var acc = resolve(activePath, el);
    if (!acc) { el.classList.remove('pe-hl'); return; }

    var wrap = $('#sheet-wrap');
    pop = document.createElement('div');
    pop.className = 'pe-pop';
    pop.innerHTML =
      '<div class="pe-head"><span class="pe-title">' + acc.label + '</span>' +
      '<button type="button" class="pe-x" title="关闭 (Esc)">✕</button></div>' +
      '<div class="pe-body"></div>' +
      '<div class="pe-foot">' +
      '<button type="button" class="pe-btn pe-ok">✓ 完成</button>' +
      '<button type="button" class="pe-btn pe-cancel">取消</button>' +
      '</div>';
    wrap.appendChild(pop);

    var body = $('.pe-body', pop);

    /* 证件照：换成上传 */
    if (kind === 'photo') {
      body.innerHTML = '<div class="pe-photo"><button type="button" class="pe-btn pe-up">上传新照片</button>' +
        '<button type="button" class="pe-btn pe-rm">移除照片</button></div>';
      $('.pe-up', body).addEventListener('click', function () { pickPhoto(); });
      $('.pe-rm', body).addEventListener('click', function () {
        resolve(activePath, el).set('');
        window.Store.touch();
        closePop();
      });
      $('.pe-foot', pop).style.display = 'none';
    } else if (acc.multiline) {
      var ta = document.createElement('textarea');
      ta.className = 'pe-input';
      ta.rows = 3;
      ta.value = acc.get();
      body.appendChild(ta);
      bindSave(ta, acc);
    } else {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'pe-input';
      inp.value = acc.get();
      body.appendChild(inp);
      bindSave(inp, acc);
    }

    positionPop(el);

    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('resize', closePop);

    var input = $('.pe-input', pop);
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); input.select(); }
    } catch (err) {
      /* 静默失败不破坏预览；调试时可开 console 看 */
      if (window.console && console.warn) console.warn('[SheetEdit]', err);
    }
  }

  /* sheet 路径 → 左侧表单 data-path（用于编辑后同步输入框值） */
  function formPathFor(path, el) {
    var seg = path.split('.');
    if (seg[0] === 'basics') return 'basics.' + seg[1];
    if (seg[0] === 'selfEvaluation') return 'selfEvaluation';
    if (seg[0] === 'skills') {
      if (seg[1] === 'items') return 'skills.items';
      if (seg[1] === 'certificates') return 'skills.certificates';
      if (seg[1] === 'language') return 'skills.language';
      return null;
    }
    /* 条目级 */
    var kind = seg[0], id = seg[1];
    if (seg[2] === '__period') return null;            /* 起止跨两框，整体刷新由 touch 处理 */
    if (el && el.getAttribute('data-k') === 'c') return null; /* 组合头跨多框，同上 */
    if (seg[2] === 'bullets') return kind + '.' + id + '.bullets';
    if (seg[2]) return kind + '.' + id + '.' + seg[2];
    return null;
  }

  /* 编辑后：重渲染由 touch() 触发；这里把左侧表单对应输入框的值同步过来 */
  function syncLeft(path, el) {
    if (!window.Editor || !Editor.syncField) return;
    var fp = formPathFor(path, el);
    if (!fp) return;
    var acc = resolve(path, el);
    if (!acc) return;
    /* skills.items / bullets 在表单里是「整段多行」，取原始数组 */
    var seg = fp.split('.');
    var doc = window.Store.getCurrent();
    var val;
    if (seg[0] === 'skills' && (seg[1] === 'items' || seg[1] === 'certificates')) {
      val = doc.resume.skills[seg[1]];
    } else if (seg.length === 3 && seg[2] === 'bullets') {
      var ent = findEntry(doc.resume[seg[0]], seg[1]);
      val = ent ? ent.bullets : '';
    } else {
      val = acc.get();
    }
    Editor.syncField(fp, val);
  }

  function bindSave(input, acc) {
    function commit() {
      var v = input.value;
      /* 重新 resolve，确保拿到的是当前 doc 引用 */
      var cur = resolve(activePath, activeEl);
      if (cur) cur.set(v);
      window.Store.touch();
      syncLeft(activePath, activeEl);
      closePop();
    }
    $('.pe-ok', pop).addEventListener('click', commit);
    $('.pe-cancel', pop).addEventListener('click', closePop);
    $('.pe-x', pop).addEventListener('click', closePop);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') { e.preventDefault(); commit(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); closePop(); }
    });
  }

  /* 证件照选择 → 压到 ≤400×533 JPEG（复用 editor.js 的压缩思路） */
  function pickPhoto() {
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxW = 400, maxH = 533;
          var scale = Math.min(1, maxW / img.width, maxH / img.height);
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          var data = c.toDataURL('image/jpeg', 0.85);
          window.Store.getCurrent().resume.basics.photo = data;
          window.Store.touch();
          closePop();
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    file.click();
  }

  /* ---------------- 事件委托 ---------------- */

  function onSheetClick(e) {
    var el = e.target && e.target.closest ? e.target.closest('.ped') : null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor(el);
  }

  function init() {
    sheet = $('#resume-sheet');
    if (!sheet) return;
    /* 捕获阶段绑定在 sheet 上：即便内部有 stopPropagation 也能收到 */
    sheet.addEventListener('click', onSheetClick, true);
  }

  window.SheetEdit = { init: init, close: closePop };
})();
