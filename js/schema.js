/**
 * schema.js — 简历数据模型、默认值、迁移钩子
 * 暴露全局：ResumeSchema
 */
(function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  function uid(prefix) {
    return (prefix || 'x') + '_' + Math.random().toString(36).slice(2, 8);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function emptyEntry(kind) {
    var base = { id: uid(kind[0]) };
    switch (kind) {
      case 'education':
        return Object.assign(base, { school: '', degree: '本科', major: '', start: '', end: '', gpa: '', rank: '', courses: '' });
      case 'internships':
        return Object.assign(base, { company: '', role: '', city: '', start: '', end: '', bullets: [''] });
      case 'projects':
        return Object.assign(base, { name: '', role: '', link: '', start: '', end: '', bullets: [''] });
      case 'campus':
        return Object.assign(base, { org: '', role: '', start: '', end: '', bullets: [''] });
      case 'honors':
        return Object.assign(base, { title: '', level: '校级', date: '' });
      case 'research':
        return Object.assign(base, { name: '', role: '', start: '', end: '', bullets: [''] });
      case 'papers':
        return Object.assign(base, { title: '', venue: '', date: '', note: '' });
      default:
        return base;
    }
  }

  function emptyResume() {
    return {
      schemaVersion: SCHEMA_VERSION,
      meta: { id: uid('d'), name: '未命名简历', createdAt: nowISO(), updatedAt: nowISO() },
      settings: {
        template: 'modern',
        theme: 'navy',
        density: 'standard',
        hiddenSections: [],
        jd: '',
        jdKeywords: []
      },
      resume: {
        basics: {
          name: '', phone: '', email: '', wechat: '', city: '',
          jobIntent: '', birthYear: '', politicalStatus: '', photo: ''
        },
        education: [emptyEntry('education')],
        internships: [emptyEntry('internships')],
        projects: [emptyEntry('projects')],
        campus: [emptyEntry('campus')],
        skills: { items: [''], certificates: [''], language: '' },
        honors: [emptyEntry('honors')],
        research: [emptyEntry('research')],
        papers: [emptyEntry('papers')],
        selfEvaluation: ''
      }
    };
  }

  /* 深拷贝 + 结构归一：缺什么补什么，防止老数据/坏数据炸渲染 */
  function migrate(doc) {
    if (!doc || typeof doc !== 'object') return emptyResume();
    var base = emptyResume();
    var out = {
      schemaVersion: SCHEMA_VERSION,
      meta: Object.assign({}, base.meta, doc.meta || {}),
      settings: Object.assign({}, base.settings, doc.settings || {}),
      resume: Object.assign({}, base.resume, doc.resume || {})
    };
    if (!out.meta.id) out.meta.id = uid('d');
    if (!Array.isArray(out.settings.hiddenSections)) out.settings.hiddenSections = [];
    if (typeof out.settings.jd !== 'string') out.settings.jd = '';
    if (!Array.isArray(out.settings.jdKeywords)) out.settings.jdKeywords = [];
    ['modern', 'classic', 'academic'].indexOf(out.settings.template) === -1 && (out.settings.template = 'modern');
    ['compact', 'standard', 'relaxed'].indexOf(out.settings.density) === -1 && (out.settings.density = 'standard');
    var r = out.resume;
    r.basics = Object.assign({}, base.resume.basics, r.basics || {});
    r.skills = Object.assign({}, base.resume.skills, r.skills || {});
    ['education', 'internships', 'projects', 'campus', 'honors', 'research', 'papers'].forEach(function (k) {
      if (!Array.isArray(r[k])) r[k] = [];
      r[k] = r[k].filter(function (e) { return e && typeof e === 'object'; })
        .map(function (e) {
          var merged = Object.assign({}, emptyEntry(k), e);
          if (!merged.id) merged.id = uid(k[0]);
          if (Array.isArray(e.bullets)) merged.bullets = e.bullets.map(String);
          return merged;
        });
    });
    ['items', 'certificates'].forEach(function (k) {
      if (!Array.isArray(r.skills[k])) r.skills[k] = [];
      r.skills[k] = r.skills[k].map(String);
    });
    r.selfEvaluation = typeof r.selfEvaluation === 'string' ? r.selfEvaluation : '';
    return out;
  }

  /* 判断条目是否「有内容」（用于渲染时跳过空条目） */
  function entryHasContent(kind, e) {
    if (!e) return false;
    switch (kind) {
      case 'education':
        return !!(e.school || e.major || e.gpa || e.courses);
      case 'internships':
        return !!(e.company || e.role || hasBullets(e));
      case 'projects':
        return !!(e.name || e.role || hasBullets(e));
      case 'campus':
        return !!(e.org || e.role || hasBullets(e));
      case 'honors':
        return !!e.title;
      case 'research':
        return !!(e.name || hasBullets(e));
      case 'papers':
        return !!e.title;
      default:
        return true;
    }
  }

  function hasBullets(e) {
    return Array.isArray(e.bullets) && e.bullets.some(function (b) { return String(b).trim(); });
  }

  window.ResumeSchema = {
    VERSION: SCHEMA_VERSION,
    uid: uid,
    nowISO: nowISO,
    emptyResume: emptyResume,
    emptyEntry: emptyEntry,
    migrate: migrate,
    entryHasContent: entryHasContent,
    hasBullets: hasBullets
  };
})();
