#!/usr/bin/env bash
# 起本地开发栈：Flask 任务服务（:5000）+ Vite 前端（:5173）。
#
# 这个脚本存在的意义是环境：VS Code（以及其它桌面入口）启动的进程没有 nvm 的
# PATH，而 server.py 是用 shutil.which("node") 找导出视频用的 node 的——找不到就
# 只能报「找不到 node（导出需要它）」。所以先 source nvm 再起服务。
#
# 用法：
#   ./launch.sh                # Flask + Vite（前台跑 Vite，Ctrl-C 两个都停）
#   ./launch.sh --no-vite      # 只起 Flask
#   ./launch.sh --debug        # Flask 用 debugpy 监听 5678 并等 VS Code attach
#
# 环境变量：PORT（Flask 端口，默认 5000）、ALIGN_DEVICE 等照常生效。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$ROOT/.venv/bin/python"
PORT="${PORT:-5000}"
WITH_VITE=1
DEBUG=0

for arg in "$@"; do
    case "$arg" in
        --no-vite) WITH_VITE=0 ;;
        --debug) DEBUG=1 ;;
        -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
        *) echo "未知参数：$arg（可用：--no-vite --debug）" >&2; exit 2 ;;
    esac
done

# nvm 里的 node 进 PATH：导出脚本要 node，Vite 要 pnpm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm use --silent default >/dev/null 2>&1 || true
fi
command -v node >/dev/null || echo "警告：PATH 里没有 node，导出视频会失败" >&2
[ "$WITH_VITE" = 1 ] && { command -v pnpm >/dev/null || echo "警告：PATH 里没有 pnpm，Vite 起不来" >&2; }

[ -x "$PY" ] || { echo "找不到 $PY —— .venv 没建好？" >&2; exit 1; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
port_busy "$PORT" && { echo "端口 $PORT 已被占用（先停掉旧的 server，或换 PORT=…）" >&2; exit 1; }

cd "$ROOT/src"

SERVER_PID=
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if [ "$DEBUG" = 1 ]; then
    echo "Flask 以 debugpy 启动，监听 5678 并等待 attach（编辑器里 attach 到 127.0.0.1:5678）"
    "$PY" -m debugpy --listen 5678 --wait-for-client server.py &
else
    "$PY" server.py &
fi
SERVER_PID=$!

for _ in $(seq 1 60); do
    curl -sf -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null && break
    kill -0 "$SERVER_PID" 2>/dev/null || { echo "Flask 启动失败，看上面的输出" >&2; exit 1; }
    sleep 0.5
done

echo "Flask  → http://127.0.0.1:$PORT/api/health"
for ip in $(ip -4 -o addr show scope global 2>/dev/null \
        | awk '$2 !~ /^(docker|veth|virbr|br-|tun|wg)/ {split($4, a, "/"); print a[1]}'); do
    echo "         局域网：http://$ip:$PORT"
done

if [ "$WITH_VITE" = 0 ]; then
    wait "$SERVER_PID"   # 前台等 Flask，Ctrl-C 结束
else
    echo "Vite   → http://127.0.0.1:5173（Ctrl-C 两个一起停）"
    cd "$ROOT/src/frontend"
    pnpm dev -- --host 0.0.0.0
fi
