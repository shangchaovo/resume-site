# CLAUDE.md

## 项目概述

校招简历工坊 Resume Forge — 面向在校大学生的纯前端简历制作工具。打开即编辑器，左侧结构化填表、右侧 A4 实时预览，三套模板 × 六主题 × 三密度，浏览器原生打印导出高清 PDF。

核心功能：
- **三套模板**：简约现代单栏 / 经典双栏 / 学术深造（保研·出国）
- **实时 A4 预览**：210×297mm 画布，缩放适配，超页红色折页线警示
- **完成度清单**：11 条自动规则（手机号/邮箱格式、量化、倒序、页数…）+ 3 条投递自查，点击可定位闪烁对应字段
- **写作指南抽屉**：一页纸原则 / STAR+量化公式 / 倒序 / JD 匹配 / 动词词库 / 减分项
- **草稿管理**：多份草稿、复制、重命名、删除；localStorage 防抖自动保存
- **JSON 备份**：导入 / 导出，导入恒为新建草稿
- **照片上传**：canvas 压缩后存 dataURL

数据来源：无后端，纯浏览器端；示例数据见 `data/demo-resume.json`（同源 fetch，首次访问自动种入）。

## 架构

```
index.html               # 单页：topbar + 左表单 + 右预览 + 指南抽屉
server.js                # 零依赖静态服务器（PORT 8769，EADDRINUSE+1 兜底）
css/
  styles.css             # 编辑器 UI「裁纸工坊」：切割垫背景、纸面板、token、动效
  templates.css          # 三套模板排版 + 密度变量 + 主题变量（screen/print 共用）
  print.css              # @media print：隐藏 chrome、@page A4、色彩保真、分页控制
js/                      # 经典 script 按序加载，IIFE 暴露全局，无 ESM 无打包
  schema.js              # ResumeSchema：emptyResume / migrate / entryHasContent / uid
  store.js               # Store：localStorage 读写、自动保存、草稿、JSON 导入导出
  templates.js           # Templates：3 个纯函数渲染器（doc → A4 HTML）+ esc
  editor.js              # Editor：表单引擎、条目增删、拖拽/按钮排序、折叠与隐藏
  preview.js             # Preview：挂载、缩放适配、页数测量、折页线、THEMES 色表
  checklist.js           # Checklist：完成度规则引擎
  app.js                 # App：主控制器、接线、切换、toast、快捷键
data/demo-resume.json    # 示例简历
launchd/                 # 自动启动 plist（可选）
```

script 加载顺序：schema → store → templates → editor → preview → checklist → app。

## 运行

```bash
cd ~/campus-resume-builder
node server.js          # http://localhost:8769
```

可选常驻（克隆自 crypto-options-analyzer 的 plist）：

```bash
mkdir -p ~/Library/Logs/campus-resume-builder
cp launchd/com.campus-resume-builder.server.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.campus-resume-builder.server.plist
# 卸载：launchctl unload -w ~/Library/LaunchAgents/com.campus-resume-builder.server.plist
```

## 模板类名策略

挂载节点 `<div class="sheet tpl-modern density-standard theme-navy">`：
- 模板：`tpl-modern | tpl-classic | tpl-academic`
- 密度：`density-compact | density-standard | density-relaxed`（在 css 里设 `--fs-* / --pad / --sec-gap` 等自定义属性）
- 主题：`app.js` 从 `Preview.THEMES` 向 sheet 注入内联 `--tpl-accent / --tpl-accent-soft / --tpl-accent-ink`（预算柔和色，不用 color-mix，保证打印一致）

渲染器为纯字符串构建，带 `esc()` 转义；空字段/空条目跳过，绝不输出空行。学术模板独有 `科研经历 / 论文发表` 分区，在现代/双栏中即使有数据也不渲染。

## 打印导出要点

- `@page { size:A4; margin:0 }`，页边距由 `.sheet` 内部 `--pad` 控制
- `.sheet { height:auto; min-height:296mm }` 使超页内容自然流到第 2 页（296 而非 297 防浮点空白页）
- `print-color-adjust:exact` 作用于 `.sheet *`，双栏侧栏底色/强调色跟屏
- `break-inside:avoid` 作用于条目/论文/荣誉；`break-after:avoid` 作用于分区标题
- 屏幕页数 = 隐藏测量副本 `.sheet-measure`（`height:auto`）的 `scrollHeight / 1122.5`
- 导出按钮 → toast 教练 → `setTimeout(print,400)`；`beforeprint` 触发 `App.refreshNow` 同步重渲染

## 注意事项

- **简历字体一律本地系统栈**（PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans CJK SC），Google Fonts（Bricolage Grotesque / IBM Plex Mono）只用于编辑器 UI 且可静默降级，绝不渗透进 `.sheet`，保证导出 PDF 处处可复现
- **localStorage key**：`crb:meta`（currentId+草稿列表）、`crb:draft:<id>`（每份独立，单份损坏不波及全部）、`crb:ui`（折叠/缩放/手动自查，非关键）、`crb:seeded`（首访种入标记）
- 改 `Store.touch()` 只触发预览+清单轻刷新；只有 doc 引用变化（切换/新建/导入/替换）才重建表单——避免打字丢焦点
- 印泥红 `#B3402A` 仅用于导出 PDF 按钮与警告，不要挪作普通强调色
- 端口 8769（8768 已被占用）

## 验证

```bash
node server.js
curl -sI http://localhost:8769/        # 200
# 浏览器：编辑→预览→导出 PDF 全流程；三模板×六主题×三密度抽查；空草稿清单红、示例数据清单绿
```

端到端脚本见 `/tmp/crb_test.py`（Playwright，含 `page.pdf` 验证打印管线）。
