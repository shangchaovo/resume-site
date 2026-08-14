# HANDOFF-CODEX.md — 项目交接说明（给 Codex / 其他 Agent 用）

> 本文件是把 `CLAUDE.md`（架构不变量）+ 本项目近期改动整理成一份自包含的交接说明，
> 方便 Codex 或任何新 Agent 拿到就能上手。改代码前请通读一遍；每处「不变量」都是踩过坑的。

## 一、路径与启动

```
项目根目录：~/campus-resume-builder/
开发服务器：node server.js        →  http://localhost:8769（8768 已被占，端口冲突自动 +1）
```

- **没有** `package.json`、没有构建、没有 lint、没有单元测试框架。`js/` 全是浏览器经典脚本（IIFE），改完刷新浏览器即可。
- 验证：`python3 scripts/e2e.py`（Playwright，21 项断言，见「四、验证与发布」）。
- 公网线上：Cloudflare Pages → `https://resume-5lv.pages.dev/`；GitHub Pages → `https://resume.is-a.dev/`（走本仓库 `main`）。

## 二、文件地图（谁管什么）

`index.html` 里 `<script>` 的**加载顺序就是依赖链**，永远不要乱动：

```
schema → contentlib → store → templates → editor → preview → sheetedit → jdmatch → checklist → apps → app
```

每个文件是 IIFE，暴露一个具名全局，彼此直接读全局：`ResumeSchema / ContentLib / Store / Templates / Editor / Preview / SheetEdit / JDMatch / Checklist / Apps / App`。**把任何文件改成 ESM 或换顺序都会断链。**

| 文件 | 职责 |
|---|---|
| `js/schema.js` | 数据结构：`emptyResume/emptyEntry/migrate`；**`entryHasContent`** ——「只渲染非空条目」的核心不变量，渲染器和表单共用 |
| `js/store.js` | 持久化（localStorage `crb:` 命名空间）+ `touch()`/引用变更机制（见三-1） |
| `js/templates.js` | **三个纯字符串渲染器**（modern/classic/academic）+ `ed()`/`combo()` 埋点（点选即改的数据标记） |
| `js/editor.js` | 左侧表单生成，每个输入有 `data-path`；`flashField`（清单点击定位）、`syncField`（sheet 编辑后同步回表单） |
| `js/preview.js` | 预览缩放 `transform:scale`、A4 页数测量（隐藏副本 `#sheet-measure`）、打印前 `beforeprint` 同步重渲染 |
| `js/sheetedit.js` | 右侧预览「点选即改」弹层（注意弹层定位，见三-5） |
| `js/jdmatch.js` | JD 关键词透明对照（只给覆盖/缺失，**绝不出 ATS 分数**） |
| `js/checklist.js` | 完成度清单；页数规则模板感知（academic 放宽到 ≤2 页） |
| `js/apps.js` | 投递看板，自管 `crb:apps` |
| `js/contentlib.js` | 空心句检测 + 分类型示例/动词库 |
| `js/app.js` | 主控制器：视图切换、草稿管理、导出、toast |
| `css/styles.css` | 编辑器外壳（手账贴纸卡通风）+ SheetEdit 弹层样式 |
| `css/templates.css` | 三模板排版（`.tpl-xxx` + 密度变量） |
| `css/print.css` | `@page A4 margin 0`、296mm、`print-color-adjust:exact` |
| `data/demo-resume.json` | 「填入示例」数据 |
| `scripts/e2e.py` | Playwright 端到端，21 项断言 |
| `scripts/deploy-pages.sh` | 部署到 Cloudflare Pages（公网） |

## 三、核心不变量 & 注意事项（最容易踩的坑）

### 1. `Store.touch()` vs 文档引用变更 —— 全项目最关键的机制（`store.js`/`app.js`/`editor.js` 三方）
- 打字/改字段 → `Store.touch()`：`doc` 是**同一个对象引用**，`app.js` 的 `change` 监听据此只做**轻刷新**（重渲染预览+清单，**不重建表单**）——否则输入框丢焦点。
- 切/新建/导入/替换草稿 → store 把 `current` 换成**新对象**，app.js 检测到引用变化才 `fullRebuild()`。
- 想新增「整份替换」的入口，必须走 `Store.replaceCurrent/switchDraft/...`（产生新引用），**别原地 mutate 后 `touch()`**，否则表单不刷新。

### 2. 渲染纪律（`templates.js`）
- 纯字符串拼接，统一 `esc()` 转义，**空字段/空条目一律跳过，绝不输出空行**。新加字段要显示，必须走这套跳过逻辑。
- 学术模板独有的 `research/papers` 只在 academic 渲染；modern/classic 即使有数据也不渲染。
- 新增可编辑字段必须用 `ed(path, inner)` 埋点（组合头用 `combo()`/`data-k="c"`，起止时间 `data-k="p"`，证件照 `data-k="photo"`），否则点选即改点不中。

### 3. 三条设计纪律
- 简历正文**只用系统字体栈**（PingFang SC/Hiragino/MS YaHei/Noto）。Google Fonts（Baloo 2 / ZCOOL KuaiLe / IBM Plex Mono）**只给编辑器 UI，绝不能渗透进 `.sheet`**——否则导出 PDF 在没装字体的机器上变样。
- 印泥红 `#E8483F` **只**用于「导出 PDF」按钮和警告，别挪作普通强调色（强调用蜜橙 `#FF8A3D`）。
- 编辑器 UI 是「手账贴纸」卡通风：明黄底 `#FFE7A8`、`--line:#3B2B20` 3px 粗描边、实体偏移阴影（`--pop` 系列）、胖圆角、hover 回弹 `--spring:cubic-bezier(.34,1.56,.64,1)`。改 UI 延续这套语言，别退回细边灰调商务风。

### 4. 几个具体坑
- **`[hidden]` 陷阱**：给已设 `display` 的容器（`.workbench`/`.apps-view`）加 `hidden` 不生效，必须配 `…[hidden]{display:none!important}`，否则盖在别的视图上抢点击。
- **桌面是「不滚动外壳 + 两栏内部滚动」**：`.app{overflow:hidden}`、`.workbench{grid-template-rows:minmax(0,1fr)}`、`.form-pane/.preview-pane/.preview-stage{min-height:0}`，缺了子项不收缩、滚动失效、内容溢出。
- **顶栏 `flex-wrap:wrap`**：稍窄桌面会把「导出 PDF」挤出右边界（`body:overflow:hidden` 无横滚，按钮够不到）。加/减顶栏按钮后，务必在 1024/1280/1440 宽各看一次导出按钮完整可见。
- **移动端**：顶栏+编辑/预览切换包在 `.sticky-head`（桌面 `display:contents`，移动端 sticky 吸顶）；底部信任条必须**静态**（sticky bottom 会浮起盖住内容）。
- **打印**：`.sheet{min-height:296mm}`（296 不是 297，防浮点多出空白页）；`print-color-adjust:exact` 作用在 `.sheet *`；条目 `break-inside:avoid`、分区标题 `break-after:avoid`。

### 5. SheetEdit 点选即改的定位（踩过坑，已修）
- 弹层挂在 **`.sheet-wrap`**（`position:relative` 且随预览一起 `transform:scale`）里。
- `positionPop` 坐标要**除以缩放系数**（`wr.width/794`）还原到 A4 真实像素，再对弹层反向 `scale(1/scale)`——否则弹层在非 100% 缩放下漂移（历史 bug，commit `928ebea`）。
- 打印时 `.pe-pop{display:none}`、高亮 `.pe-hl` 去 outline/背景，保证导出 PDF 干净。

### 6. 持久化
- `crb:meta`（currentId+草稿列表）、`crb:draft:<id>`（每份独立 key）、`crb:ui`、`crb:seeded`、投递看板 `crb:apps`。照片上传已先 canvas 压到 ≤400×533 JPEG q0.85，防 `QuotaExceededError`。

## 四、验证与发布

```bash
python3 scripts/e2e.py        # 21 项断言，跑完即杀；首次需 pip install playwright && playwright install chromium
bash scripts/deploy-pages.sh  # 部署到 Cloudflare Pages
```

- 公网：**https://resume-5lv.pages.dev/**（Cloudflare Pages，项目名 `resume`，`-5lv` 是 CF 自动加的）。每次部署还会生成 `xxxx.resume-5lv.pages.dev` 临时预览地址。
- GitHub Pages：本仓库 `main` → **https://resume.is-a.dev/**（仓库内 `CNAME` = `resume.is-a.dev`，别删）。
- deploy 脚本用**干净临时目录**上传（wrangler 直传不读 `.cloudflareignore`），必须这样，否则 `server.js`/`.git`/`launchd` 会被传上公网。
- **注意**：Pages 对不存在路径回退返回 index.html（200），所以别用「curl 某路径是否 200」判断泄露，要看响应体。
- 网络：机器在国内，外网请求需代理 `http://127.0.0.1:1082`（deploy 脚本已处理）。
- 本机另有 launchd 常驻 8769 端口的服务（`com.campus-resume-builder.server`）。

## 五、改东西时的多文件触点

- **加模板**：`templates.js` 渲染器登记进 `RENDERERS` → `templates.css` 写 `.tpl-xxx` → `index.html` `#tpl-switch` 加按钮 → `schema.js` `settings.template` 白名单 → `checklist.js` 页数规则。
- **加表单字段**：`schema.js` 默认值/归一 → `editor.js` SECTIONS 加 `fieldNode` → 对应渲染器取值+空值跳过+`ed()` 埋点。
- **加清单规则**：`checklist.js` `RULES` 加 `{id,text,tip,target,pass}`，`target` 是点击定位的 `data-path` 前缀。
