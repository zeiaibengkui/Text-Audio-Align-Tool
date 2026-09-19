# 部署到一台 Linux 服务器

这份文档记录把本项目部署成一个「打开网页就能用」的服务的完整步骤，面向的是一台干净的
Debian 12 云主机（2 vCPU / 8 GB 起步，40 GB 磁盘）。开发环境请看 README 和 CLAUDE.md，
这里只讲服务器上和本地不一样的部分。

服务器上没有 Intel Arc，所以**和本地最大的区别是 torch 用 CPU 版**，对齐速度靠 CPU 核数。

## 1. 系统依赖

```bash
sudo apt-get update
sudo apt-get install -y nginx ffmpeg fonts-noto-cjk fonts-noto-cjk-extra \
  git curl certbot python3-certbot-nginx fontconfig

# node（视频导出需要，server.py 用 shutil.which("node") 找它）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable && corepack prepare pnpm@latest --activate

# uv
curl -LsSf https://astral.sh/uv/install.sh | sh
```

`fonts-noto-cjk` 是必须的：`scripts/export-scroll.mjs` 用 `fc-match` 找系统里的 Noto Serif
CJK SC，缺字体导出的视频会是方框。`ffmpeg` 同时被 `align_core.audio_duration()` 的 `ffprobe`
和导出流程使用。

## 2. Python 环境（CPU 版 torch）

```bash
sudo mkdir -p /opt/taa && sudo chown -R "$USER":"$USER" /opt/taa
git clone https://github.com/zeiaibengkui/Text-Audio-Align-Tool /opt/taa
cd /opt/taa

uv venv --python 3.14
uv pip install --torch-backend=cpu flask qwen-aligner-toolkit torch torchaudio
```

注意两点：

- **不要在服务器上 `uv sync`。** 锁文件对应的是本地那套 Intel XPU 的 torch，同步会把 CPU 版
  换掉，之后 `Aligner.from_pretrained()` 起不来。加包一律用
  `uv pip install --torch-backend=cpu <包名>`。
- 运行时真正需要的只有 `flask` 和 `qwen-aligner-toolkit`（它会带上 torch / torchaudio /
  transformers）。`pyproject.toml` 里的 funasr、pandas、torchvision、ipykernel 是开发用的，
  服务器上装了只是白占几个 G。

首次对齐会下载 `Qwen3-ForcedAligner-0.6B` 到 HuggingFace 缓存，之后常驻内存。

## 3. 后端进程

`server.py` 必须**单进程**跑（任务状态在内存里，`use_reloader=False` 也是因为 reloader 会
把模型加载两遍），交给 systemd：

```ini
# /etc/systemd/system/taa.service
[Unit]
Description=Text-Audio-Align Flask job server
After=network.target

[Service]
User=<运行用户>
WorkingDirectory=/opt/taa/src
Environment=PORT=5000
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=AUTH_TOKEN=<openssl rand -base64 24 生成的长口令>
Environment=AUTH_COOKIE_SECURE=1
ExecStart=/opt/taa/.venv/bin/python server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now taa
sudo journalctl -u taa -f        # 每个请求都会打一行日志
```

`Environment=PATH=...` 不能省：systemd 默认的 PATH 里没有 node，导出视频时会报
「找不到 node（导出需要它）」。

`AUTH_TOKEN` 一设，整个 `/api` 就要求登录：浏览器打开站点会先看到口令页，输对了换一个
**HttpOnly 签名 cookie**（有效期 30 天），之后由前端自动携带，顶栏多一个「退出」。
留空/不设 = 完全开放，只适合本机。配套两个开关：

- `AUTH_COOKIE_SECURE=1` —— HTTPS 部署时打开（`certbot` 之后就是 HTTPS）。开着但走
  HTTP 会让浏览器直接丢掉 cookie，症状是「口令明明对，进去又被弹回登录页」。
- `SECRET_KEY` —— 可选。不设时由 `AUTH_TOKEN` 派生，重启后 cookie 依然有效；
  改口令 = 所有已登录的浏览器失效，这通常正是想要的。

## 4. 前端与 nginx

```bash
cd /opt/taa/src/frontend && pnpm install && pnpm run build   # 产物在 dist/
```

```nginx
# /etc/nginx/sites-available/taa
server {
    listen 80;
    server_name <你的域名>;

    client_max_body_size 1g;

    root /opt/taa/src/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;      # SPA 路由：/jobs/<id> 直接刷新也要能开
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;     # 大音频边传边转发
        proxy_buffering off;             # 音频 Range 请求 / 进度轮询不被缓冲住
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

    location = /api/login {              # 兜底限速：口令本身已经拖了 0.5s，这里再挡一层爆破
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
}
```

`limit_req` 要在 `http {}` 里先定义 zone（`/etc/nginx/nginx.conf`）：

```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;
```

```bash
sudo ln -sf /etc/nginx/sites-available/taa /etc/nginx/sites-enabled/taa
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <你的域名> --non-interactive --agree-tos -m <邮箱> --redirect
```

超时给到 900 秒是有原因的：长音频的对齐和视频导出都远超 nginx 默认的 60 秒。
`client_max_body_size` 同理，默认 1 MB 连一段朗读都传不上去。

### 别用 nginx 的 HTTP Basic Auth 收口

那是另一层、且对这套前端无效：不写 `credentials` 的 `fetch('/api/...')` 不会带凭据，结果是
页面打得开、右上角一直显示「后端未连接」，而服务器上 `curl` 一切正常，非常难查。要收口就用
上面的 `AUTH_TOKEN`（前端认识它，401 会自动弹回口令页）。

## 5. 验证

```bash
curl -s https://<域名>/api/health                    # {"device":"auto","ok":true}，免登录
curl -s -o /dev/null -w '%{http_code}\n' https://<域名>/api/jobs    # 设了口令就是 401
curl -s -c /tmp/cj -X POST -H 'Content-Type: application/json' \
     -d '{"token":"<口令>"}' https://<域名>/api/login                 # {"authed":true,"ok":true}
curl -s -b /tmp/cj https://<域名>/api/jobs | head -c 100             # 带 cookie 才有列表
```

健康检查只能证明进程活着。真正要确认的是整条链路，用浏览器走一遍：输口令进站 →
`/create` 传一段 mp3 + 粘贴对应文本 → 等任务变 `done` 看到字幕行 → 进渲染页 → 等导出完成
出现「下载视频」。

造测试音频（macOS）：

```bash
printf '白日依山尽，黄河入海流。' > t.txt
say -v Tingting -f t.txt -o t.aiff && ffmpeg -i t.aiff t.mp3
```

一次实测参考（2 vCPU / 8 GB，纯 CPU）：5.6 秒音频，对齐 61 秒（含首次下载模型），卷轴
MP4 导出 5 到 7 秒。对齐和导出都是 CPU 密集且导出按核数并行，音频越长、核数越少越慢，
加核是唯一有效的提速手段。

## 6. 日常维护

```bash
cd /opt/taa && git pull
cd src/frontend && pnpm install && pnpm run build   # 只动前端：不用重启，不用 reload nginx
sudo systemctl restart taa                          # 只动后端
sudo systemctl show taa -p Environment              # 确认 AUTH_TOKEN 还在（systemd 改完要 daemon-reload）
df -h /                                             # 每个任务都会留下音频和 mp4
sudo rm -rf /opt/taa/src/jobs/<id>                  # 清理旧任务
```

几个已知行为，不是 bug：

- 重启后处于 `queued` / `running` 的任务会被标成 failed（工作线程没了）。用
  `POST /api/jobs/<id>/retry` 重新排队，不需要重新上传。
- 导出状态只存在内存里，重启后重新 POST 一次导出即可。
- `@napi-rs/canvas` 必须留在前端的 `package.json` 里，pnpm 会把没声明的包剪掉，导出会报
  `ERR_MODULE_NOT_FOUND`。
