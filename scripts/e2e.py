#!/usr/bin/env python3
"""
端到端验证：编辑 → 预览 → 导出 PDF 全管线 + 移动端。
自包含：在临时端口拉起 server.js，跑完即杀，不与常驻的 8769 冲突。

依赖：pip install playwright && playwright install chromium
运行：python3 scripts/e2e.py        （从仓库根或任意位置均可）
"""
import os, sys, json, time, socket, subprocess, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

def wait_ready(url, tries=40):
    for _ in range(tries):
        try:
            urllib.request.urlopen(url, timeout=1).read(); return True
        except Exception:
            time.sleep(0.25)
    return False

PORT = free_port()
BASE = f"http://127.0.0.1:{PORT}"
env = {**os.environ, "PORT": str(PORT)}
srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fail = []
def check(cond, msg):
    if not cond: fail.append(msg); print("  FAIL:", msg)
    else: print("  ok  :", msg)

try:
    assert wait_ready(BASE + "/"), "server did not start on %d" % PORT
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append("[console.error] " + m.text) if m.type == "error" else None)

        page.goto(BASE)
        page.evaluate("()=>Object.keys(localStorage).filter(k=>k.startsWith('crb:')).forEach(k=>localStorage.removeItem(k))")
        page.reload(); page.wait_for_load_state("networkidle"); page.wait_for_timeout(700)

        # 首屏 + 保存徽章（监听器顺序修复）
        check("陈晓雨" in page.locator("#resume-sheet .r-name").inner_text(), "首屏示例渲染")
        check("1 页" in page.locator("#page-badge").inner_text(), "首屏 1 页")
        check("已保存" in page.locator("#save-text").inner_text(), "初始保存徽章=已保存")
        check(page.locator(".check-row.fail").count() == 0, "示例数据清单全绿")

        # 输入同步
        page.fill('[data-path="basics.name"]', "王大锤"); page.wait_for_timeout(600)
        check("王大锤" in page.locator("#resume-sheet .r-name").inner_text(), "输入同步到预览")

        # 模板切换 + 学术 1 页（间距收紧修复）
        page.click('#tpl-switch [data-tpl="classic"]'); page.wait_for_timeout(400)
        check("tpl-classic" in page.locator("#resume-sheet").get_attribute("class"), "切换 classic")
        page.click('#tpl-switch [data-tpl="academic"]'); page.wait_for_timeout(400)
        check("tpl-academic" in page.locator("#resume-sheet").get_attribute("class"), "切换 academic")
        check("1 页" in page.locator("#page-badge").inner_text(), "academic 示例 1 页")
        check(page.locator(".check-row.fail").count() == 0, "academic 清单无失败")

        # 主题 + 密度
        page.click('#tpl-switch [data-tpl="modern"]')
        page.click('.swatch[data-theme="brick"]'); page.wait_for_timeout(300)
        acc = page.evaluate("()=>getComputedStyle(document.getElementById('resume-sheet')).getPropertyValue('--tpl-accent')")
        check("#9E3B2F" in acc.replace(" ", "").upper(), "主题色注入")
        page.click('#density-switch [data-density="compact"]'); page.wait_for_timeout(300)
        fs = page.evaluate("()=>getComputedStyle(document.getElementById('resume-sheet')).getPropertyValue('--fs-body')")
        check("12" in fs, "紧凑密度生效")
        page.click('#density-switch [data-density="standard"]')
        page.click('.swatch[data-theme="navy"]'); page.wait_for_timeout(300)

        # 打印管线：三模板各导一份 PDF（headless 应用 @media print）
        for tpl in ("modern", "classic", "academic"):
            page.click(f'#tpl-switch [data-tpl="{tpl}"]'); page.wait_for_timeout(300)
            path = f"/tmp/crb_e2e_{tpl}.pdf"
            page.pdf(path=path, format="A4", print_background=True,
                     margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
            check(os.path.getsize(path) > 5000, f"PDF 导出 {tpl}")

        # 溢出折页
        page.evaluate("""()=>{const d=Store.getCurrent();for(let n=0;n<6;n++)d.resume.internships.push(
          {id:'x_'+n,company:'测试公司'+n,role:'工程师',city:'上海',start:'2020.0'+(n+1),end:'2020.12',
           bullets:['负责大规模系统优化，通过重构核心链路将接口响应时间从 800ms 降至 120ms，QPS 提升 5 倍，覆盖日活 200 万用户']});Store.touch();}""")
        page.wait_for_timeout(500)
        b = page.locator("#page-badge").inner_text()
        check("建议" in b and page.locator("#fold-flag").get_attribute("hidden") is None, "超页徽章+折页线")

        # JSON 校验
        r = page.evaluate("""()=>({a:Store.importJSON('not json'),b:Store.importJSON('{}'),
             c:Store.importJSON(JSON.stringify(Store.getCurrent()))})""")
        check(not r["a"]["ok"] and not r["b"]["ok"] and r["c"]["ok"], "JSON 导入校验")

        # 草稿管理
        d = page.evaluate("""()=>{const b=Store.listDrafts().length;Store.createDraft(false);
             const a=Store.listDrafts().length;Store.renameCurrent('e2e');
             const del=Store.deleteDraft(Store.currentId());
             return{b,a,del:del.ok,n:Store.listDrafts().length}}""")
        check(d["a"] == d["b"] + 1 and d["del"] and d["n"] == d["b"], "草稿 增/改名/删")

        # 隐藏分区
        page.evaluate("()=>{const d=Store.getCurrent();d.settings.hiddenSections=['campus','selfEvaluation'];Store.touch();}")
        page.wait_for_timeout(300)
        secs = page.evaluate("()=>[...document.querySelectorAll('#resume-sheet [data-sec]')].map(e=>e.dataset.sec)")
        check("campus" not in secs and "selfEvaluation" not in secs and "education" in secs, "隐藏分区不渲染")

        # ---- 集群：内容质量（空心句）单元 ----
        h = page.evaluate("()=>({a:ContentLib.isHollow('负责日常维护与对接'),b:ContentLib.isHollow('重构图表组件，首屏从 2.4s 降至 0.9s（-62%）'),c:ContentLib.isHollow('优化')})")
        check(h["a"] is True and h["b"] is False and h["c"] is False, "空心句检测 isHollow")

        # ---- 集群：JD 关键词对照（置确定性状态） ----
        page.evaluate("""()=>{const d=Store.getCurrent();
          d.resume.internships=[{id:'j1',company:'C',role:'R',start:'2025.01',end:'2025.03',bullets:['用 Vue 3 重构看板，首屏从 2s 降至 0.8s（-60%）']}];
          d.settings.jd='需要 Vue 与 Python，要求沟通能力'; d.settings.hiddenSections=[]; Store.touch();}""")
        page.wait_for_timeout(400)
        jd = page.evaluate("()=>{const m=JDMatch.compute(Store.getCurrent());return{covered:m.covered.map(x=>x.key),missing:m.missing.map(x=>x.key),active:m.active}}")
        check(jd["active"] and "vue" in jd["covered"] and "python" in jd["missing"] and "沟通" in jd["missing"], "JD 覆盖/缺失计算")
        check(page.evaluate("()=>!![...document.querySelectorAll('.check-row.fail')].find(r=>r.dataset.target==='__jd')"), "JD 缺失时清单规则失败")
        page.fill('.jd-add', '微服务'); page.click('.jd-addbtn'); page.wait_for_timeout(300)
        check("微服务" in page.evaluate("()=>JDMatch.compute(Store.getCurrent()).missing.map(x=>x.key)"), "JD 手动加词生效")

        # ---- 集群：建议文件名（确定性） ----
        page.evaluate("()=>{const d=Store.getCurrent();d.resume.basics.name='测名';d.resume.education[0].school='测校';d.resume.basics.jobIntent='测岗实习';Store.touch();}")
        page.wait_for_timeout(300)
        fn = page.evaluate("()=>App.suggestedFilename()")
        check(fn == "测名-测校-测岗实习.pdf", "建议文件名 sanitize 正确: " + fn)

        # ---- 集群：自查三问 ----
        mtxt = page.evaluate("()=>[...document.querySelectorAll('.manual-row')].map(r=>r.textContent).join('|')")
        check(("真实" in mtxt) and ("相关" in mtxt) and ("面试" in mtxt), "自查清单含报告三问")

        # ---- 集群：投递看板 模块 CRUD ----
        ar = page.evaluate("""()=>{const it=Apps.add({company:'模块测试',role:'前端',status:'已投'});
          const has=Apps.list().some(x=>x.id===it.id); Apps.update(it.id,{status:'面试'});
          const st=Apps.list().find(x=>x.id===it.id).status; Apps.remove(it.id);
          return{has,st,gone:!Apps.list().some(x=>x.id===it.id)}}""")
        check(ar["has"] and ar["st"] == "面试" and ar["gone"], "apps 模块 增/改/删")

        # ---- 集群：看板 UI 闭环 ----
        page.click('#view-switch [data-view="apps"]'); page.wait_for_timeout(300)
        check(page.locator("#apps-view").is_visible() and page.locator(".workbench").is_hidden(), "切换到看板视图")
        page.click('#btn-app-add'); page.wait_for_timeout(300)
        page.fill('#m-company', 'UI闭环公司'); page.fill('#m-role', '前端'); page.click('#m-save'); page.wait_for_timeout(300)
        check(page.locator(".app-card").count() >= 1 and "UI闭环公司" in page.locator(".app-co").first.inner_text(), "看板新增卡片渲染")
        page.click('#view-switch [data-view="editor"]'); page.wait_for_timeout(300)
        check(page.locator(".workbench").is_visible() and page.locator("#apps-view").is_hidden(), "切回编辑器视图")

        # 移动端
        m = browser.new_context(viewport={"width": 390, "height": 800})
        mp = m.new_page(); mp.goto(BASE); mp.wait_for_load_state("networkidle"); mp.wait_for_timeout(600)
        check(mp.locator("#mobile-switch").is_visible(), "移动端切换条显示")
        mp.click('#mobile-switch [data-view="preview"]'); mp.wait_for_timeout(300)
        check(mp.locator(".preview-pane").is_visible() and not mp.locator("#form-pane").is_visible(), "移动端预览视图")
        m.close()

        check(not errs, "无 JS 运行时/console 错误" + ("" if not errs else " :: " + " | ".join(errs)))
        browser.close()
finally:
    srv.terminate()
    try: srv.wait(timeout=5)
    except Exception: srv.kill()

print("\nALL E2E CHECKS PASSED" if not fail else ("\n%d CHECK(S) FAILED" % len(fail)))
sys.exit(0 if not fail else 1)
