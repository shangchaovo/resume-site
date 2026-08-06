# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

校招简历工坊 Resume Forge — 面向在校大学生的**纯前端**简历制作工具。打开即编辑器（左表单 / 右 A4 实时预览），三套模板 × 六主题 × 三密度，浏览器原生打印导出矢量 PDF。无后端、无打包、零运行时依赖，数据全在浏览器 `localStorage`。

## Commands

```bash
node server.js                 # 开发服务器 http://localhost:8769（端口被占自动 +1）
python3 scripts/e2e.py         # 端到端验证（编辑→预览→PDF→移动端，21 项断言）
```

- **没有构建 / lint / 单测框架，也没有 `package.json`** —— 不要去 `npm run` 或找测试运行器。`js/` 是浏览器经典脚本，改完刷新即可。
- `scripts/e2e.py` 自包含：在**临时空闲端口**拉起自己的 `server.js`（不与常驻 8769 冲突），跑完即杀。首次需 `pip install playwright && playwright install chromium`。它还会 `page.pdf()` 导出三模板 PDF 以验证打印管线，并在末尾断言无 `pageerror` / `console.error`。
- 手动核验 PDF：浏览器 `⌘P` → 另存 PDF / A4 / 边距无 / 勾「背景图形」；保存后用阅读器确认 210×297mm、文字可选中（非截图）。

常驻（可选，克隆自 `~/crypto-options-analyzer` 的 plist）：
`cp launchd/com.campus-resume-builder.server.plist ~/Library/LaunchAgents/ && launchctl load -w ~/Library/LaunchAgents/com.campus-resume-builder.server.plist`（卸载把 `load` 换 `unload`）。

## Architecture — 跨文件才看得懂的点

**运行时模型**：无打包器、无 ESM。`index.html` 按固定顺序用 `<script>` 加载 `schema → contentlib → store → templates → editor → preview → jdmatch → checklist → apps → app`；每个文件是 IIFE，向外暴露一个具名全局（`ResumeSchema / ContentLib / Store / Templates / Editor / Preview / JDMatch / Checklist / Apps / App`），彼此直接读全局。**改加载顺序或把某文件改成 ESM 会破坏这条链。** v2 三模块：`contentlib`（空心句检测 + 分类型示例/动词库）、`jdmatch`（JD 关键词**透明对照**，只给覆盖/缺失，绝不出 ATS 分数）、`apps`（投递看板，自管 `crb:apps`）；`app.js` 另管「编辑器/看板」视图切换、建议文件名复制、信任条接线。

**核心不变量 —— `touch()` vs 文档引用变更**（横跨 `store.js`/`app.js`/`editor.js`）：
- 打字/改字段调用 `Store.touch()`：`doc` 是**同一对象引用**，`app.js` 的 `change` 监听器据此只做**轻刷新**（重渲染预览 + 清单），**不重建表单** —— 否则输入框会丢焦点。
- 切换/新建/导入/替换草稿时 `store` 把 `current` 换成**新对象**，`app.js` 检测到引用变化才 `fullRebuild()`（重建表单 + 同步控件）。
- 想新增「整份替换内容」的入口，必须走 `Store.replaceCurrent/switchDraft/...`（产生新引用），别原地 mutate 后 `touch()`，否则表单不刷新。

**渲染 / 主题模型**（`templates.js` + `templates.css` + `preview.js` + `app.js`）：
- 挂载节点 `<div class="sheet tpl-{modern|classic|academic} density-{compact|standard|relaxed}">`。密度由 class 在 css 里设 `--fs-* / --pad / --sec-gap` 等变量；主题由 `app.js` 读 `Preview.THEMES` 把 `--tpl-accent / -soft / -ink` **内联**到 sheet —— 故意不用 `color-mix()`，使打印输出与屏幕逐字一致。
- 三个渲染器是**纯字符串拼接**，统一经 `esc()` 转义，且**跳过空字段/空条目**（绝不输出空行）。新增会被渲染的字段，空值时也要走这套跳过逻辑。
- 学术模板独有 `research / papers` 分区：它们在 `renderAcademic` 里渲染，在 modern/classic 里**即使有数据也不渲染**。

**预览测量 / 打印**（`preview.js` + `print.css`）：
- 屏幕页数靠一个**隐藏的测量副本** `#sheet-measure`（`height:auto`，与 sheet 同类名）：`pages = ceil(scrollHeight / 1122.5)`（297mm@96dpi）。缩放用 `ResizeObserver` 算 `scale=(stageW-64)/794`，手动缩放覆盖。
- 打印：`@page{size:A4;margin:0}`，页边距由 `.sheet` 内 `--pad` 控制；`.sheet{height:auto;min-height:296mm}`（**296 不是 297**，防浮点多出空白页）；`print-color-adjust:exact` 作用在 `.sheet *`（双栏底色/强调色才能跟屏）；条目 `break-inside:avoid`、分区标题 `break-after:avoid`。
- 用户直接 `⌘P` 时，`beforeprint` → `App.refreshNow()` 同步重渲染，避免打到陈旧 DOM。

**持久化**（`store.js`，命名空间 `crb:`）：`crb:meta`（currentId + 草稿摘要列表）、`crb:draft:<id>`（**每份独立 key**，一份损坏不波及全部）、`crb:ui`（折叠/缩放/手动自查，非关键可丢）、`crb:seeded`（首访种入示例的标记，避免清缓存后又种）。投递看板用**独立** `crb:apps`（全局数组，不经 `Store.touch`，由 `apps.js` 自管）；卡片引用草稿时快照 `draftName`，避免改名/删草稿后断裂。`pagehide`/`visibilitychange` 兜底 flush；`setItem` 抛 `QuotaExceededError` 时提示导出备份（照片上传已先 canvas 压到 ≤400×533 JPEG q0.85）。

**两条设计纪律**：
- 简历正文**只用本地系统字体栈**（PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans CJK SC）。Google Fonts（Baloo 2 / ZCOOL KuaiLe / IBM Plex Mono）**只给编辑器 UI**，且必须可静默降级，**绝不能渗透进 `.sheet`** —— 否则导出 PDF 在没装该字体的机器上会变样。
- 印泥红 `#E8483F` **只**用于「导出 PDF」按钮和警告，别挪作普通强调色（强调用蜜橙 `#FF8A3D` / 各模板 accent）。
- 编辑器 UI 走**「手账贴纸」卡通风**：明黄底 `#FFE7A8` + 糖果碎点；所有卡片/按钮/输入框用 `3px` 深巧克力勾边 `--line:#3B2B20` + 实体偏移阴影（`box-shadow: 0 Npx 0 var(--line)`，即 `--pop` 系列）制造贴纸「厚度」；胖圆角（`--radius:18px` 起）；标题用 Baloo 2 / ZCOOL KuaiLe；hover 统一回弹 `--spring:cubic-bezier(.34,1.56,.64,1)`。改 UI 时延续这套语言（粗描边 + 实体投影 + 糖果色块），别退回细边灰调的商务工具风。
- **`[hidden]` 陷阱**：给已设作者 `display` 的容器（`.workbench` / `.apps-view`）加 `hidden` 属性**不会**隐藏（作者规则盖掉 UA 的 `[hidden]`），必须配 `…[hidden]{display:none!important}`；否则它会盖在别的视图上抢点击（v2 看板上线时就因此踩坑）。
- **移动端吸顶**：顶栏 + 编辑/预览切换包在 `.sticky-head` 里——桌面 `display:contents`（不破坏 `.app` 的 flex/100vh 布局），移动端 `position:sticky` 整块吸顶；否则长表单一滚，导出 PDF / 视图切换就滚出视野（用户报过「被挡住 / 无法导出」）。底部信任条**必须静态**：移动端表单不是独立滚动容器，`sticky bottom` 会浮起盖住页面底部内容。
- **桌面是「不滚动外壳 + 两栏内部滚动」**，这套缺一不可：`.app{overflow:hidden}`、`.workbench{grid-template-rows:minmax(0,1fr)}`、`.form-pane`/`.preview-pane`/`.preview-stage{min-height:0}`。少了 `minmax(0,1fr)`/`min-height:0`，grid/flex 子项不会收缩、`overflow:auto` 不生效，内容就溢出整页、顶栏被推走且滚不回（用户报过「往下拉就回不去」）。顶栏控件多，必须 `flex-wrap:wrap`（高度 `flex:0 0 auto`）：否则稍窄的桌面会把「导出 PDF」挤出右边界，而 `body:overflow:hidden` 没有横向滚动条 → 按钮彻底够不到。改顶栏加/减按钮后，务必在 1024/1280/1440 宽各看一眼导出按钮是否完整可见。

**完成度清单**（`checklist.js`）的「页数」规则是**模板感知**的：modern/classic 要求 1 页，academic 放宽到 ≤2 页（保研/出国 CV 本就常 1–2 页）。改这条阈值要同时顾及两套语义。规则若需动态 tip/target，用 `detail(doc)` 返回 `{ok,tip,target}`（hollow、jd 规则用它，比 pass/tip/target 灵活）；`target:'__jd'` 由清单的点击处理器特判——聚焦 `#jd-card textarea`（该面板在 `#form-sections` 之外，`Editor.flashField` 找不到它）。

**server.js**：零依赖 `http` 静态服务，`PORT` 默认 8769（8768 已被占用），`EADDRINUSE` 且未显式设 `PORT` 时 +1 重试。

## 改东西时的多文件触点

- **加一套模板**：`templates.js` 写渲染器并登记进 `RENDERERS`；`templates.css` 写 `.tpl-xxx` 排版；`index.html` 的 `#tpl-switch` 加一个 `seg-btn`；`schema.js` 的 `settings.template` 白名单（`migrate` 里）加该 key；若该模板有独有分区，在 `checklist.js` 的页数规则/渲染跳过逻辑里考虑。
- **加一个表单字段**：`schema.js` 的 `emptyResume`/`emptyEntry`/`migrate` 给默认值与归一；`editor.js` 的对应 `SECTIONS` rows（或 `buildBasics/buildSkills`）加 `fieldNode`；若该字段要显示，在对应渲染器里取值并保证空值跳过。
- **加一条完成度规则**：`checklist.js` 的 `RULES` 加 `{id,text,tip,target,pass}`；`target` 是点击要闪烁定位的 `data-path` 前缀（`editor.js` 给每个输入写了 `data-path`）。

## 验证矩阵

`scripts/e2e.py` 已覆盖主路径。手工补查：三模板 × 六主题 × 三密度 抽查截图；空草稿清单应多项红、示例数据应全绿；改坏手机号 → 「手机号格式」规则变红且点击能定位闪烁；导出 PDF 三模板各看一份。

## 发布到公网（Cloudflare Pages）

已部署为 Cloudflare Pages 项目 `resume`，公网 **https://resume-5lv.pages.dev/**（免费、全球 CDN、Mac 关机也在）。`resume.pages.dev` 主机名被全局占用，故 CF 自动加 `-5lv`；项目名仍是 `resume`。要主机名恰好 `resume`：用其 Cloudflare 自有域名做 Pages 自定义域 `resume.<域名>`（同账号会自动建 DNS，免费即时）。

重新部署：`bash scripts/deploy-pages.sh`。它把 `index.html + css/ js/ data/` 拷到临时目录再上传——**wrangler 直接上传不读 `.cloudflareignore`**，所以必须用干净目录法，否则 `server.js`/`.git`/`launchd`/文档会被传上公网（泄露本机路径）。`.cloudflareignore` 仅对 git-build 模式有意义。首次需 `npx wrangler login` 一次性授权。另：Pages 对不存在路径回退返回 `index.html`（200），故**别用「curl 某路径是否 200」判断文件是否泄露**，要看响应体或上传清单。
