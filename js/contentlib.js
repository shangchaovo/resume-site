/**
 * contentlib.js — 反同质化的内容质量工具：空心句检测 + 分类型示例句库 + 动词库
 * 暴露全局：ContentLib
 * 设计纪律（源自研究报告）：所有判断都是「提示，非判决」，不上 AI、不出分数。
 */
(function () {
  'use strict';

  /* 量化信号：出现这些通常说明句子有结果 */
  var QUANT = /\d|%|％|万|倍|人次|名|天|小时|元|ms|[kK]\+?|\+/;
  /* 结果动词/结构 */
  var RESULT = /提升|降低|减少|增长|节省|覆盖|实现|达到|完成|上线|落地|转化|缩短|提速|降至|增至|提高|扩大|从[\s\S]{1,14}到/;
  /* 典型的「空心」弱开头 */
  var HOLLOW_START = /^(负责|参与|协助|配合|从事|担任|跟进|对接|处理|进行)/;

  function isHollow(line) {
    var t = String(line || '').trim();
    if (t.length < 6) return false;
    return HOLLOW_START.test(t) && !QUANT.test(t) && !RESULT.test(t);
  }

  /* 返回 1-based 行号数组 */
  function hollowLines(arr) {
    var out = [];
    (arr || []).forEach(function (l, i) { if (isHollow(l)) out.push(i + 1); });
    return out;
  }

  /* 扫描整份简历，返回 {count, firstPath}，firstPath 形如 'internships.<id>.bullets' */
  function scanDoc(doc) {
    var count = 0, firstPath = null;
    var r = doc.resume || {};
    ['internships', 'projects', 'campus', 'research'].forEach(function (k) {
      (r[k] || []).forEach(function (e) {
        if (hollowLines(e.bullets).length) {
          count += hollowLines(e.bullets).length;
          if (!firstPath) firstPath = k + '.' + e.id + '.bullets';
        }
      });
    });
    return { count: count, firstPath: firstPath };
  }

  /* 分经历类型的范例行（动词 + 方法 + 量化结果） */
  var EXEMPLARS = {
    internships: [
      '负责创作者后台数据看板迭代，基于 Vue 3 + ECharts 重构 6 个核心图表组件，首屏渲染从 2.4s 降至 0.9s（-62%）',
      '搭建埋点可视化校验工具，覆盖 40+ 埋点位，联调期缺陷发现率提升 3 倍，节省 QA 回归约 8 人日/版本',
      '推动落地组件级单测规范，新增 120+ 用例，核心模块行覆盖率从 34% 提升至 81%'
    ],
    projects: [
      '主导产品从 0 到 1 落地：完成技术选型与 CI 搭建，带 4 人团队 3 个月上线',
      '实现 IM 私聊模块（WebSocket + 本地消息队列），支撑日均 3000+ 条消息，离线到达率 99.2%',
      '上线 2 个月积累校内注册用户 6800+、周活 2100+，获校「互联网+」创业赛二等奖'
    ],
    campus: [
      '策划 12 场技术分享与 Workshop（覆盖 1500+ 人次），牵头搭建官网，学期访问量 2.3 万+',
      '主导招新流程线上化，用表单系统替代纸质流程，纳新转化率提升 25%'
    ],
    research: [
      '复现并改进 XX 模型，在 XX 基准上将准确率从 78.3% 提升至 82.1%，消融实验验证各模块贡献',
      '清洗并标注 1.2 万条语料，设计数据增强流程，使小样本场景 F1 提升 6.4 个点'
    ]
  };

  /* 分类动词库：点一下追加到描述开头，避免千篇一律的「负责/参与」 */
  var VERBS = {
    '从 0 到 1': ['主导', '搭建', '孵化', '创立', '牵头'],
    '改进优化': ['优化', '重构', '精简', '提速', '降级'],
    '推动落地': ['推动', '落地', '上线', '交付', '推进'],
    '量化复盘': ['复盘', '归因', '测算', '量化', '沉淀']
  };

  window.ContentLib = {
    isHollow: isHollow,
    hollowLines: hollowLines,
    scanDoc: scanDoc,
    EXEMPLARS: EXEMPLARS,
    VERBS: VERBS
  };
})();
