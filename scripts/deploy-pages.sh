#!/usr/bin/env bash
# 把纯静态站点部署到 Cloudflare Pages 项目 "resume"（公网 https://resume-5lv.pages.dev/）。
# 只上传网页资源（index.html + css/ js/ data/），绝不上传 server.js / .git / launchd / 文档，
# 因为 wrangler 直接上传模式不读 .cloudflareignore，故用「干净临时目录」法。
# 前置：已执行过一次 `npx wrangler login`（浏览器一次性授权）。
set -euo pipefail
cd "$(dirname "$0")/.."

PROXY="${HTTPS_PROXY:-http://127.0.0.1:1082}"
export HTTPS_PROXY="$PROXY" HTTP_PROXY="$PROXY" NO_PROXY="${NO_PROXY:-localhost,127.0.0.1}" CI=1

D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
cp index.html "$D"/
cp -r css js data "$D"/

echo ">> deploying clean dir -> Cloudflare Pages [resume] ..."
npx -y wrangler pages deploy "$D" --project-name=resume --branch=main --commit-dirty=true
echo ">> done. public URL: https://resume-5lv.pages.dev/"
