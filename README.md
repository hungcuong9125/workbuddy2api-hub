# WorkBuddy2API-Hub — 国际版、国内版多账号网关中枢

<p align="center">
  <a href="https://github.com/ardeyouxipianyi/workbuddy2api-hub/releases"><img src="https://img.shields.io/badge/Release-v1.6.19-2496ED?style=flat-square" alt="Version 1.6.19"></a>
  <img src="https://img.shields.io/badge/Python-3.9+-blue.svg?style=flat-square" alt="Python">
  <img src="https://img.shields.io/badge/API-OpenAI_Compatible-412991?style=flat-square" alt="OpenAI API">
  <img src="https://img.shields.io/badge/Dual_Realm-Intl_&_CN-0DBD8B?style=flat-square" alt="Dual Realm">
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Vibe_Coding-100%25-ff69b4?style=flat-square" alt="Vibe Coding">
</p>

把腾讯 **[www.workbuddy.ai](https://www.workbuddy.ai)**（国际版）与 **[codebuddy.cn](https://www.codebuddy.cn)**（国内版）的原生服务封装成标准 OpenAI 兼容接口（Chat Completions 与 Responses API），并补齐多账号调度与运维能力：

- **开箱即用**：绿色包自带精简 Python，双击脚本即启；
- **双区域独立路由**：国际版 / 国内版独立配置与调度，看板一键切换，状态落盘；
- **模型目录对齐官方桌面端**：剔除代码补全通道与底层专线变体，能力与规格按桌面端宣告；
- **设备指纹隔离 (`derive_id`)**：以账号 UID 稳定派生机器码与会话标识，防多号关联风控；
- **OAuth 免客户端登录**：看板点链接完成授权即自动入库；
- **桌面客户端凭据导入**：直接读本机已登录的 WorkBuddy 桌面端账号，客户端加密存储的 token 也能就地解密；
- **国内版自动化**：每日签到、成长任务与积分任务自动接取点亮领奖、猫猫日常旅行与连续打卡；
- **国际版每日活跃打卡**：自动建网页端会话并接上沙箱把这一轮真正跑完（ACP over HTTP+SSE），全自动领满官方每日活跃 30/50 积分奖励；
- **后台定时调度器**：09:00/21:00 国内签到旅行与国际版活跃打卡 · 22:00 保活 · 01:00 夜猫；
- **限额（保留积分 · 每日 Token · 每日积分 · 按模型 Token）**：四条账号级护栏集中在看板同一张表里，默认按**全局默认**生效、同时管住国际版与国内版；需要时可单独给某一版本设值，留空即继承全局。积分花超只服务免费模型、单模型 token 用满只禁该模型，次日 0 点解封（默认全部关闭）；
- **OpenRouter 价估算**：把请求 token 按 OpenRouter 公布的模型价折算成等价花费（按条件定价的模型按每条请求的输入长度与时间取档），定价按版本留档、刷新间隔可配，每条请求都标出用的是哪一版，人民币/美元可切，看板多处并列展示；**上游新增模型无需改代码即可自动进入取价**（取价输入 = 内置目录 ∪ 网关实时目录；两次取价之间就被调用就按需补价；带渠道后缀的名字向基准模型继承，命不中就不定价），仍未定价的模型在面板列出原因，可手填 OpenRouter id 收口；
- **三协议支持**：Chat Completions、Responses API（Codex）与原生 Anthropic Messages API（Claude Code / Anthropic SDK）；
- **积分与权益包明细查看**：完整解析账号各套餐包/加量包额度、已用、剩余、生效状态及有效期周期，看板一键弹窗并支持实时刷新；
- **Web 看板**：指标卡片、模型性能与用量大表、按 API Key 的用量归属、实时请求流水一屏可查。

> ⚡ **Vibe Coding 产物**：本项目为 100% Vibe Coding 协同产物，由人类开发者提出架构与业务意图，AI 助手端到端完成逆向分析、链路调度、WAF 指纹脱敏与界面编写。

---

## 一、快速启动

### 1. 本机单机使用

**Windows**：双击 **`start-wb-proxy.bat`**，保持窗口运行。**macOS**：双击 **`start-wb-proxy.command`**（首次被 Gatekeeper 拦截时，右键 →「打开」确认一次），或在终端执行：

```bash
./start-wb-proxy.sh          # 默认 8788 端口
./start-wb-proxy.sh 9000     # 自定义端口
```

启动后：

- **API 接口地址**：`http://127.0.0.1:8788/v1`
- **Web 监控看板**：`http://127.0.0.1:8788/`

首次启动若无账号，打开看板点 **「+ 添加账号 (OAuth)」** 完成授权即自动入库。macOS 启动脚本会自动挑选可用的 Python 3.9+（`/usr/bin/python3`、Homebrew 或包内 `python/bin/python3`），未安装可用 `xcode-select --install` / `brew install python`。

> zip 解压后若提示权限不足，先执行一次：
> `chmod +x start-wb-proxy.sh start-wb-proxy.command start-wb-proxy-lan.sh start-wb-proxy-lan.command allow-firewall.command`

### 2. 面板访问密码

打开看板需要先输入**面板访问密码**（默认 `admin`），它与 API Key 相互独立：密码只用于打开看板，可在「设置」页修改（或启动时用 `--panel-password` 指定），以 PBKDF2-SHA256 摘要存于 `accounts/settings.json`（不存明文）；登录状态保存在浏览器会话中，关闭浏览器或重启网关后需重新输入。

**本机/局域网自用免手输**：打开看板时可在 URL 后带上 `?pwd=面板密码`，看板会自动填入并直接登录，无需再手动输入，例如 `http://127.0.0.1:8788/?pwd=admin`。适合本机或受信任的局域网内自用；**公网暴露时不要使用**——密码会留在浏览器历史记录、地址栏以及可能的反向代理访问日志中。注意这与局域网共享里的 `?key=` 不同：`?key=` 只把 API Key 存下来供 `/v1` 接口调用，并不会自动登录面板。

> 首次登录后请立即修改默认密码。

### 3. 局域网共享模式
允许局域网内其他设备（手机、平板、协同电脑）访问：

- **Windows**：双击 `start-wb-proxy-lan.bat`；**macOS**：双击 `start-wb-proxy-lan.command`，或：

```bash
./start-wb-proxy-lan.sh              # 端口 8788，自动生成/复用 API Key
./start-wb-proxy-lan.sh 8788 我的Key  # 自定义端口与 Key
```

- **Base URL**：`http://<本机局域网IP>:8788/v1`；带密钥直达面板：`http://<IP>:8788/?key=生成的Key`；
- **API Key**：不使用写死的默认密钥，首次启动生成高强度随机 Key 保存到 `accounts/settings.json` 并在终端打印，重启复用；也可用第二个参数传入自己的 Key（以传入的为准）；
- **macOS 防火墙**：首次监听端口时系统会询问是否允许 Python 接受连接，选「允许」；macOS 15+ 还需在「系统设置 → 隐私与安全性 → 本地网络」中允许终端访问。可用 `./allow-firewall.command` 查看状态并把 Python 加入允许列表。

---

### 4. 多 API Key 管理与出口绑定

在「设置」页可管理多个 API Key，并为每个 Key 指定独立出口——不同客户端各用各的 Key，国内 / 国外流量互不干扰，无需频繁切换全局出口：

- **添加与生成**：输入名称后点「生成随机 Key」，可随时复制；
- **出口绑定**：可固定走 🌐 国际版（`www.workbuddy.ai`）或 🇨🇳 国内版（`copilot.tencent.com`）；不绑定则跟随看板顶部的全局出口开关；
- **模型限制**：可为每个 Key 填写允许调用的模型（如 `deepseek*`、`gpt-6-astra`，支持 `*` 通配，多个用逗号分隔）；留空表示不限制。不在列表内的模型请求在本机直接返回可读的 400，既不会送达上游、也不会消耗任何额度——用来挡掉客户端背景请求偷偷调用的付费模型；
- **启停与删除**：可单独启用 / 停用；删除会立刻抹掉密钥（该 Key 再也无法调用），但条目本身以只读形式留在「设置」页底部的「已删除」折叠区，好让看板里的历史用量仍然显示它的名字；所有 Key 保存在 `accounts/settings.json`，重启保持；
- **用量归因**：看板「数据指标」页在账号表下方多一张按 API Key 归属的表——每个 Key 的请求数、Token、缓存命中、积分与模型分布（窗口内最多列 5 个模型，其余并入「其他」），口径与账号表一致，两表的请求数应当相等。该维度从升级后开始记录，更早的请求会一直留在「(切换前)」一行里；没绑定出口却两个出口都用过的 Key 会标成「跟随 · 混合」，它的积分是两套价格相加的结果；
- **防冲突**：面板保存过 Key 后，启动命令或脚本里的旧参数（如 `--api-key`）自动失效；
- **区域自检**：Key 绑定的出口与其请求的模型不匹配时（如用国际版 Key 调国内独占的 `deepseek-v4-pro`），直接返回可读的 400 校验错误，而不是上游晦涩的 WAF 拒流报错。

### 5. Docker 容器化部署

本项目提供预编译双架构镜像（`linux/amd64` 与 `linux/arm64`），公开发布在 GHCR 及 Docker Hub，**无需克隆代码、无需本地编译**，提供多种开箱即用的部署与更新方式：

#### 方式一：一键快速部署与更新（推荐，小白与云服务器首选）

在终端中执行以下命令，脚本将全自动检测环境、创建配置并完成拉取启动：

```bash
# 官方源（可直连 GitHub 环境）：
curl -fsSL https://raw.githubusercontent.com/ardeyouxipianyi/workbuddy2api-hub/main/quick-deploy.sh | bash

# 国内网络 / NAS 加速（遇到 Connection reset 等连接报错时使用）：
curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/ardeyouxipianyi/workbuddy2api-hub/main/quick-deploy.sh | sudo bash
```

- **权限提示**：NAS（如飞牛 fnOS）普通用户若无直接操作 Docker 的权限，请在管道后追加 `sudo bash`；
- **后续升级**：再次运行相同的命令即可无感平滑升级，账号配置与用量数据绝不丢失。

#### 方式二：NAS / Web 面板单文件 Compose 部署（飞牛 fnOS / 群晖 / 1Panel 等）

在 NAS 或面板的 Compose 界面直接新建项目并粘贴以下内容保存启动，无需拉取项目源码：

```yaml
services:
  wb-proxy:
    image: ghcr.io/ardeyouxipianyi/workbuddy2api-hub:latest   # 或 ardeyouxipianyi/workbuddy2api-hub:latest
    container_name: wb-proxy
    restart: unless-stopped
    ports:
      - "8788:8788"          # 左侧宿主端口可自选；右侧必须与下面的 PORT 一致
    environment:
      - HOST=0.0.0.0
      - PORT=8788
      # - API_KEY=your_secret_key   # 留空则自动生成并打印在启动日志
      - TZ=Asia/Shanghai
    volumes:
      - ./accounts:/app/accounts    # 账号凭证与配置（更新/重建容器不丢）
      - ./usage:/app/usage          # 用量流水日志（更新/重建容器不丢）
```

- **更新方法**：在面板中点击「拉取最新镜像并重启」，或在对应目录执行：
  ```bash
  docker compose pull && docker compose up -d
  ```

#### 方式三：Watchtower 全自动静默更新（彻底躺平）

希望系统在每次 GitHub 发布新版本时自动静默升级，可启动 Watchtower 仅监控 `wb-proxy`（每 24 小时检查一次更新）：

```bash
docker run -d --name wb-proxy-watchtower --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower:latest --interval 86400 --cleanup wb-proxy
```

#### 补充说明与排错

- **持久化数据安全**：`./accounts` 与 `./usage` 两个目录由宿主机持久化挂载，容器更新或销毁重建均不会影响已保存的账号和请求用量。
- **命令行快捷启动（docker run）**：
  ```bash
  docker run -d --name wb-proxy --restart unless-stopped -p 8788:8788 \
    -v $(pwd)/accounts:/app/accounts -v $(pwd)/usage:/app/usage \
    ghcr.io/ardeyouxipianyi/workbuddy2api-hub:latest
  ```
- **开发者本地源码构建**：需调试或修改代码时，运行 `docker compose -f docker-compose.build.yml up -d --build`。
- **鉴权说明**：容器以 `--lan` 启动，无显式 `API_KEY` 时会自动生成高强度 Key 写入 `./accounts/settings.json` 并打印在日志中：
  `docker compose logs wb-proxy | grep -i "api key"`。
- **报错 `pull access denied ... repository does not exist`**：镜像名若省略了 Registry 地址（如写成了 `ardeyouxipianyi/workbuddy2api-hub`），Docker 默认访问 Docker Hub。若遇网络受阻，请确保镜像名补全为 `ghcr.io/ardeyouxipianyi/workbuddy2api-hub:latest`；GHCR 包是公开的，拉取无需登录。

- **目录权限（PUID/PGID）**：容器默认以 root（`0:0`）运行，与历史行为一致。想以宿主用户身份跑，就在 compose 里设 `PUID=$(id -u)` / `PGID=$(id -g)`（或写进 `.env`），并确保 `./accounts`、`./usage` 对该 uid 可写；`docker run` 也可直接加 `--user $(id -u):$(id -g)`。
- **健康检查**：镜像自带 `HEALTHCHECK`（每 30s 请求一次 `/health`），`docker ps` 的 STATUS 列会显示 healthy/unhealthy，编排器也可直接探活。

### 6. 测试

全部测试集中在 `tests/`，一条命令跑完：

```bash
python tests/run_all.py            # 全部套件
python tests/run_all.py realm      # 只跑名字里含 realm 的
```

- `tests/_mobile_check.py` 是独立的 Playwright 手机/桌面布局检查器（需自行安装 Playwright），按需手动运行，不在上面的套件集里。
- 102 个套件：76 个 Python + 26 个 JS；JS 需要 PATH 上有 `node`，缺失时会跳过并提示。
- CI（`.github/workflows/tests.yml`）跑同一条命令：Ubuntu 上 python 3.9 与 3.12（3.9 是本项目声称的最低版本），Windows 上 python 3.12。推送 `v*` tag 时额外断言 **tag == 源码版本**（`wb_proxy.py` 里的两处版本串必须先一致，`-ci` 演练 tag 豁免）。

---

## 二、核心特性详解

### 1. 模型列表严格按照桌面应用 1:1 对齐

针对官方本地配置清单（50+ 底层模型）进行了深度清洗，剔除行内代码补全专用模型（如 `codewise-*`、`completion-gf`、`hunyuan-3b/7b`）与底层多云专线变体（如 `*-volc`、`*-lkeap`），严格对齐官方Windows桌面端，每个模型均宣告完整桌面软件中显示的上下文窗口（K/M 规范）、单次最大输出、视觉支持、工具调用以及推理档位。

* **🌐 国际版 (17 个)**：`hy4-preview-f`、`hy3`、`deepseek-v4.1-flash`、`gpt-6-astra`、`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`、`gpt-5.5`、`gpt-5.4`、`grok-4.7`、`gemini-3.5-flash`、`glm-5.3-flash`、`glm-5.3`、`glm-5.2`、`kimi-k3`、`kimi-k2.6`、`kimi-k2.8-preview`。
* **🇨🇳 国内版 (14 个)**：`hy4-preview-f`、`hy3`、`deepseek-v4.1-flash`、`deepseek-v4-pro`、`glm-5.3`、`glm-5.3-flash`、`glm-5.2`、`glm-5.1`、`glm-5v-turbo`、`minimax-m3`、`kimi-k3-1`、`kimi-k2.8-preview`、`kimi-k2.7`、`kimi-k2.6`。

> 清单与上游 `GET /v3/config` 的 `agents[cli].models` 保持同步，没装桌面端的机器也能取到同一份（接口不可用时依次回落到桌面端缓存文件、内置快照）。过滤规则：去掉 5 个档位别名与 `auto`，去掉 `-sg` / `-x` 变体，同名的只留 0.00 倍率那一档。上游新上的模型无需发版即可出现在 `/v1/models`。

> 💡 **关于同模型跨区域混合轮询的说明**：
> 目前对于同时存在于国内版和国际版的同名模型（如 `deepseek-v4.1-flash` 等），**暂未实现跨国内/国际账号的自动混合轮询**，而是作为两个独立区域分别配置与调度，请求只能走当前所选网关的独立出口。这主要是出于各区域网络环境隔离、出站指纹对齐与账号防风控安全考量；待作者后续实测验证确认长期使用稳定且无封号风险后，会尽快跟进并补齐同名模型的跨区域混合轮询能力。

### 2. 稳定物理设备指纹隔离 (`derive_id`)
国际版与国内版共用同一套算法内核：以账号 UID 结合固定业务盐值单向哈希派生机器码与会话标识——同一账号每次出站都来自同一台虚拟设备，不随机漂移；不同账号之间彼此独立，阻断跨账号关联风控。

### 3. 国内版每日签到、成长任务与积分任务全自动完成
- **每日签到**：一键完成国内版打卡领积分；
- **成长任务与积分任务**：自动批量接取未接任务，构造规范行为事件上报点亮（画布创建、灵感案例、模板使用、模型体验、多轮对话等 14 项），并自动领奖入账；
- **猫猫日常**：自动检查旅行状态，在家自动派出、归来自动领奖。

### 4. 后台常驻定时调度器 (Scheduler) 与每日自动化
常驻后台，每日按固定整点执行自动化运维排程：

- **每日 09:00 & 21:00**：国内版账号自动签到与猫猫旅行闭环；国际版账号自动执行每日活跃打卡对话（领官方每日 30/50 积分福利）；
- **每日 22:00**：集中扫描全库账号，Token 剩余寿命不足 2 小时自动调用 Refresh Token 保活；
- **每日 01:00**：深夜时段自动执行夜猫子任务；
- **国际版动态自适应**：切换至国际版视图时，看板顶部提供「每日活跃打卡 (国际版)」一键触发按钮。

### 5. 限额（保留积分 · 每日 Token · 每日积分 · 按模型 Token）

看板「设置 → 账号限额」把四条账号级护栏放在**同一张表**里，每行一条护栏、每列一个作用域：

| 护栏 | 作用 |
| --- | --- |
| 保留积分 | 账号余额低于该值时不再接单，避免余额被用尽后触发上游的提醒短信 |
| 每日 Token 限额 | 账号当日消耗的 token 达到该值时暂停接单，请求自动切到其他账号 |
| 每日积分限额 | 账号当日消费的积分达到该值后只服务免费模型，需要花积分的模型自动切号 |
| 按模型每日 Token 限额 | 账号在单个模型上当日消耗的 token 达到该值时只禁该模型，同账号其他模型照常 |

**全局默认 + 可选分版本**：每条护栏的「全局默认」同时作用于**国际版**与**国内版**；勾上「分别设置国际版 / 国内版」后，可以为某一版本单独设值，该版本**留空即继承全局默认**（输入框占位符会写出它继承到的数字）。取消勾选再保存，等于把两个版本的覆盖值一起清回继承。每条护栏填 `0` 表示关闭该项，这是默认值。

判定与恢复：四条护栏都按**本地时间 0 点**自动解封，且都只在请求路径生效（定时任务不受影响）；每条护栏都是**单账号独立计数**，A 号用满不影响 B 号。免费/付费以**各出口自己的模型目录**为准——同一个模型 id 在不同出口的免费状态可以不同，未知模型按付费处理（保守）。账号行会显示「保留积分」「积分限额」徽章与 `模型 · N tok 达限` 标记（悬停看今日用量）；某个出口的全部账号都达额时，该出口的请求返回 `429`（文案说明本地 0 点恢复，`Retry-After` 指向 0 点）。四条护栏共用同一份增量扫描（`daily_usage_stats`），请求热路径开销不变。

存储：四条护栏存成 `accounts/settings.json` 里的一组 `limits` 映射（`{"global": …, "intl": …, "cn": …}`，`null` 表示继承全局）。升级时旧版写在外层的四个扁平键会在第一次读取时自动折进来并从外层删除，所以即使回滚也不会读到旁边那份过期数字。


### 6. OpenRouter 价估算（等价 token 花费）

把每条请求的 token 消耗按 **OpenRouter 公布的模型价**折算成等价金额，回答「这些 token 放在 OpenRouter 上值多少钱」——与账号实际扣除的积分（`credit`）是两个口径，看板里并列显示：

- **总开关（默认开启）**：「设置 → 模型价格估算 → 启用价估算」，也可直接写 `accounts/settings.json` 的 `pricing_enabled`。开关缺省即开启，只有显式 `false` 才算关闭，所以升级上来的老配置行为不变；关掉它图的是省掉算价与渲染开销（日志上万行时 `/usage` 的响应差别明显）。关闭后除开关本身外整块功能从界面上撤掉——价格列、「API 等价花费」卡片、取价子控件与未定价清单一并隐藏；后端也不向 OpenRouter 取价、不登记按需补价、不为任何请求折算金额，`/pricing/refresh` 与 `/pricing/mapping` 返回「价估算已关闭，请先启用」。**重新打开会补算关闭期间的请求**——关闭期间没有取价，打开时立刻抓一次（不等下一个间隔），那一份价按 `policy_ref_at` 的补算分支落到关闭期间那些行上并标 `*`；`usage.jsonl` 里的历史行与策略表**一个字都不改写**，金额始终是读时算的，所以补算不需要回写日志。关闭期间第一次被调用、内嵌快照里也没有的模型，靠打开后的这次取价进策略表，同样能补上。
- **定价来源**：OpenRouter 模型目录（`/api/v1/models`，美元 / 每 token，按版本里的汇率折算成人民币）。取的是**模型级公布价**——OpenRouter 模型页上展示的那个数字，对应它默认路由的那家 provider；同一个模型在 OpenRouter 上往往由多家 provider 承接、价格各异（实测 `deepseek-v4.1-flash` 有 33 家、`gpt-6-astra` 有 7 家），换一家可能更便宜，所以这个数是「OpenRouter 公布的该模型价格」，不是「最省的买法」。`wb_pricing.py` 里另内嵌一份快照作为出厂价（镜像自包含，无需额外文件），供还没有历史的机器兜底；`_fetch_pricing.py` 用来重新生成它（`--embed` 回写内嵌副本、`--dry-run` 只打印）。
- **计价口径**：输入按缓存命中/未命中两档单价拆分（`cached_tokens`），输出单独单价，乘上 token 数再按汇率折算。输出的 token 数取上游的 `completion_tokens`，它**已经包含推理 token**（上游把 `reasoning_tokens` 记在 completion 内，实测与 1.5 万条历史行都如此，`total_tokens = prompt + completion`），所以推理 token 不另计——单独再加会重复计费；这条前提有测试钉住。OpenRouter 上有不少模型是**按条件定价**的，条件写在条目的 `overrides` 里，共两类，都会被原样搬进快照的 `bands`：
  - **按输入长度**：超过阈值后改用更贵的价——`gpt-6-astra`、`gpt-5.5`、`gpt-5.4`、`gpt-5.6-*` 在 272000 token 以上翻倍，`grok-4.7` 在 200000 以上翻倍（OpenRouter 的 `overrides` 是按阈值升序排列的）；
  - **按时段（UTC）**：`hy3`、`hy3-x`、`hy4-preview` 系列——北京时间 08:00–24:00 比 00:00–08:00 贵，`hy3` 约贵 60%。

  计价时按每条请求的输入长度与时间在 `bands` 里取**最紧的那一条**，取不到就退回该模型的基准价，所以最坏退化成单一价而不会算成 0。`overrides` 里的缓存写入价与音频价计不了：本地 usage 日志只记 prompt / completion / reasoning / cached，没有对应的 token 数。既没有厂商一手页，也没有本地维护的峰谷表，各处展示的都是同一个口径。
- **定价策略与引用**：网关每隔一段时间（「设置 → 定价刷新」，默认 **5 分钟**，单位即分钟，填 0 关闭自动刷新）去 OpenRouter 取一次价。周期短并没有额外代价：只有价格真的变了才写策略与时间轴，价格不动时每个周期只是一次 HTTP GET。每份价格按**内容**存成一条独立的「定价策略」（模型 + 各档价 + 汇率一起做哈希当 id），内容相同的只存一条：同一个模型若走出 A → B → A，表里始终只有 A、B 两条，第三次直接指回 A。另有一条**时间轴**声明每个模型在各时刻生效的是哪一条策略，只在生效分配真的变化时才追加一行——价格长期不动时，取再多次也不会长大。
  - **每条请求记的是「引用了哪条策略」**，不内嵌价格：`usage.jsonl` 每行带 `cost_policy`（策略 id）。计价按这个 id 直接查，所以之后调价不会改写之前的数字；悬停里会写出策略 id 与它首次取到的时刻。
  - 请求发生在某模型**还没有价**的时候，用之后第一次取到的价补算，并在金额后标 `*`。
  - **无用策略会被清掉**：抓取后若产生了新策略，就顺带清理一次——没有任何请求引用、且已不是当前生效的那条会被删；每个模型至少留一条，刚取到的那批不动。
  - 所有汇总——按模型、按账号、按区间的——都是把每条请求各自的估算**加起来**，而不是拿汇总 token 乘一个单价重算。
  - 面板上能看当前生效的是哪一份（可展开逐模型查看）、策略表条数、上次/下次取价时间与最后一次失败原因，也能点「立即取价」手动取一次。
- **新增模型自动取价（无需改代码）**：取价的候选清单 = 内置目录 `wb_catalog.py` ∪ 网关**实时目录**里新增的模型（intl / cn 两个区域各自的实时目录一起并进来，与 `/v1/models` 走同一套过滤，别名与 `-sg`/`-x` 之类付费档位不进清单），所以上游新上架一个名字，5 分钟内就会进入取价并出现在策略表/时间线里；若它在这两次取价之间就被调用，**第一笔请求**也会带上价——按需补价用最近一次抓取留在内存里的目录登记策略，请求路径不发任何网络请求，命不中还是老老实实未定价。匹配顺序是「面板手填覆盖 → 人工覆盖表 `OVERRIDES` → 名字归一化后全等且唯一 → **变体后缀继承**（剥掉 `-lkeap`、`-taiji`、`-volc`、`-sg` 这类渠道/发行后缀，拿基名重走前三步，仍要求唯一命中）」，继承来的策略记 `via=variant` 与 `inherited_from`，面板能看出这条价不是同名匹配来的；`-f`/`-dev`/`-x` 故意不剥（它们是 hub 自己的档位，单价可能不同）。这条规则可在「设置 → 定价刷新 → 变体后缀继承」整体关掉，关掉即恢复「只有覆盖表与同名匹配才定价」。整套匹配仍然遵循「宁可漏也不错」：多轮都没命中的就不写价，费用列显示 `—`。
- **未定价可见化与手填收口**：`/pricing` 返回未定价清单，每条带分类——`alias`（`default-model` 一类虚拟别名，不是模型，不计入缺口统计）、`or_missing`（OpenRouter 无对应）、`variant_unmatched`（剥后缀后仍无唯一基准），并给出相似度 top 3 候选（**仅建议，绝不自动采用**）。面板「设置 → 定价刷新」下可直接展开逐条查看，为某条模型手填一个 OpenRouter id 并「登记」：映射写进数据目录的 `pricing-overrides.json`（运行期覆盖，不改源码里的 `OVERRIDES`，升级镜像不丢），登记后立即触发一次取价；留空提交即删除该映射。
- **`_fetch_pricing.py` 支持 `--extra-ids-file <path>`**（离线内置快照工具）：默认仍只读内置静态目录、不引入网络依赖，需要额外 id 时给一份「每行一个模型名」的文件即可，与运行时的并集输入同一条 `build_snapshot()` 路径。
- **展示位置**：数据看板 KPI 卡片「API 等价花费」（跟随今日/本周/本月/全部区间切换）、各账号用量透视**最后一列**、模型性能与用量一览**最后一列**（含合计行）、网关与账号页「估算价格」卡片、最近请求**最后一列**（逐条金额，悬停可看完整定价策略，见下条；补算的金额后带 `*`）。
- **悬停即可看清单条请求的价是怎么来的**：最近请求最后一列的金额带一个自绘气泡，鼠标停上去给出——**三档原始单价**（缓存命中输入 / 缓存未命中输入 / 输出，USD / 每百万 token，按策略原样显示、不做折算）、版本里的汇率与折算说明、**匹配来源的完整证据链**（`direct` 给出命中的 OpenRouter id；`override` 给出「原名 → 映射到的 id」；`variant` 给出「原名 → 基准名 → OpenRouter id」并标明剥掉的后缀）、命中的**条件档位与该档三档价**、策略 id 与它首次取到的时刻、以及补算标记 `*`；没有定价的行仍只说「该模型暂无定价数据」，不编数字。这些字段由 `/usage/recent` 每行直接带出（`cost_rates`、`cost_unit`、`cost_currency`、`cost_usd_cny`、`cost_or_id`、`cost_via`、`cost_inherited_from`、`cost_override_from`、`cost_band_note`、`cost_via_derived`），面板不为展示再开接口，未定价整组为 `null`、与 `cost_cny` 同口径。气泡挂在 `body` 上且 `pointer-events: none`，不会抢走鼠标；表格每 5 秒整体重画，重画后按行键复位回同一行。**加这些字段没有动计价口径**：`policy_id` 的算法一字未改，全量 15176 行逐行的 `source` 与改动前 0 条失配，历史策略 id 逐条不变；早于 `via` 字段写下的策略行没有记录可查，气泡按当前映射表推断并明确标注是推断（`via_derived=true`），映射表改过或指不到就不认。
- **人民币 / 美元一键切换**：金额按快照汇率换算，选择记在浏览器本地，刷新后保留；快照覆盖不到的模型显示 `—` 并计入「未覆盖」提示，不做猜测。当前未覆盖的只有 4 个真实名字：OpenRouter 尚未收录的 `kimi-k2.8-preview`、目录里对应 Claude-3.7/4.0-Sonnet 的 `default-1.1` / `default-1.2`（OpenRouter 无同名条目），以及 `kimi-k2-instruct-taiji`（剥掉 `-taiji` 后基名仍无唯一对应）；它们都在面板未定价区列出原因与候选，可按需手填映射。另有 5 个档位别名（`default-model` 等）本就不是真实模型，只在清单里标注、不计入缺口统计。

### 7. 本地网络工具（可选，默认关闭）

部分客户端（如 Codex App）会在 Responses 请求里宣告 `web_search` / `web_fetch` 这类服务端工具，而上游没有对应的执行器——声明送上去，模型看得到工具却没有执行器，客户端最后只拿到一句 unsupported call。

看板「设置 → 本地网络工具」打开后，网关把那份声明换成自己的同名 function、拦下模型的调用、在本地执行（搜索走 DuckDuckGo HTML 版，抓页面抓模型给出的 URL），再把结果喂回模型，最多代跑 3 轮（`WB_MAX_WEB_ROUNDS` 可调，上限 8）；搜索过程会作为 `web_search_call` 卡片事件与 `url_citation` 引用回到客户端。

- **默认关闭**：工具声明原样透传，客户端自己声明的搜索工具照常拿到调用（v1.5.3 之后的既有行为，升级不受影响）；
- 打开后网关会主动出网抓取模型给出的 URL（只挡字面私网地址），且每轮代跑都会多跑一次上游、多消耗该账号额度；国内网络下 DuckDuckGo 可能连不上，那时模型拿到的是错误文本；
- 只影响声明了这两个工具的客户端，普通 `/v1/chat/completions` 客户端不经过这条路径。

### 8. 智能体一键配置 (Agent Config)

参照 EasyCLIProxyAPI 的 agents 机制，为本机常用 AI 客户端提供一键检测、配置写入与安全备份还原能力。无需手动翻找各工具繁琐的配置文件或环境变量文档，即可将常用终端 Agent 快速对接到本网关：

- **支持的客户端**：
  - **Claude Code**：Anthropic 官方 CLI 工具，写入 `~/.claude/settings.json`（原生 Anthropic Messages 协议，自动剥除 `/v1` 后缀）；
  - **Codex CLI**：OpenAI 官方 Codex 终端，写入 `~/.codex/config.toml` 与 `~/.codex/auth.json`（Responses API 协议）；
  - **OpenCode**：开源 AI 编码客户端，写入 `~/.config/opencode/opencode.json`（OpenAI 兼容协议 `@ai-sdk/openai-compatible`）；
  - **DSH (DeepSeek Harness)**：多智能体编排系统，更新 `~/.dsh/settings.yaml` 与 `~/.dsh/.credentials.yaml`（OpenAI 兼容协议）；
  - **Crush (Charm Crush)**：终端 AI 助手，更新 `~/.config/crush/crush.json`（OpenAI 兼容协议）。
- **工作原理**：
  1. **智能探测**：同时探测本机配置目录、配置文件及 PATH 可执行文件（`shutil.which`），在看板呈现安装与配置状态；
  2. **非侵入式配置写入**：内置纯标准库实现的轻量文本级 YAML / TOML / JSON / .env 编辑器，仅增量插入或更新 `wb-proxy` 提供商配置，绝不重新格式化已有文件，完整保留用户的注释、原有缩进与其他模型配置；
  3. **两阶段事务与安全备份**：写入前自动备份目标文件。首次介入时永久保留初始原件，多文件修改（如 DSH、Codex）具备事务回滚保护，任意文件写入失败立即自动回退已写文件；
  4. **一键还原**：在看板一键点击「还原」即可 byte-exact 还原回最初的配置，由网关新建的配置文件会自动安全清理。
- **使用方法**：
  - 启动网关并打开 Web 看板 `http://127.0.0.1:8788/`；
  - 切换至 **「智能体配置」** 页面；
  - 选择需要配置的 API Key（支持全局默认或已绑定特定出口的多 Key）、默认模型与网关地址；
  - 在检测到的客户端卡片上点击 **「一键配置」** 即可完成注入；随时点击 **「一键还原」** 撤销配置。
- **注意事项**：
  - **备份存储位置**：所有配置文件备份存放在数据目录 `accounts/agent-backups/<客户端ID>/` 下，每个文件保留最新的 10 份快照；
  - **还原会覆盖外部改动**：网关记录每次写入文件的 SHA-256。若用户之后手动修改过客户端配置文件，看板会提示「检测到外部修改」，此时执行还原仍会安全恢复至首次接入前的原件并覆盖外部修改；
  - **密钥安全**：API Key 仅写入客户端自身合法的本地配置目录（权限仅限当前系统用户），网关不向公网暴露密钥；单文件超过 8MB 时拒绝编辑以防误篡改。

---

## 三、账号添加与管理

打开看板 `http://127.0.0.1:8788/`，在「账号」区域操作：

若上游对某账号的单个模型返回 429，账号行会显示受限模型和预计恢复时间（浏览器本地时间）；该账号仍可用于其他模型。模型冷却状态仅在当前服务进程中保留，重启后清空。

### 方式一：浏览器 OAuth 授权（推荐，免客户端）
1. 点击 **「+ 添加账号 (OAuth)」**；
2. 选择要登录的区域（国际版 / 国内版），点击弹出的官方授权链接并在浏览器完成登录；
3. 程序自动检测回调，完成后账号自动加入账号池，无需手动复制凭证。

### 方式二：从本地桌面应用导入（Windows）
1. 让 **WorkBuddy 桌面客户端保持运行并已登录**（网关要从它的进程内存里取解码密钥，这一步不能省）；
2. 看板点 **「扫描桌面客户端账号」**，弹窗里会列出本机 `.info` 里已登录的国际版 / 国内版账号；
3. 若提示凭据已加密，先点弹窗里的 **「回收密钥」**（只读，实测 1 秒内完成），再点账号行的 **「导入」**。

关于加密凭据：

- 桌面客户端从 2026-09-24 起把 `accessToken` / `refreshToken`（国内版还有 `nickname` / `phoneNumber`）存成 `$wbEncrypted` 信封，网关按客户端 `packages/at-rest-crypto` 的同一套方案（AES-256-GCM + `WB-AAD` 帧头）就地解密，导入的仍是可直接使用的 token；
- 解码密钥（`atRestSecretKey`）编译在客户端的原生模块里、磁盘上没有明文，只能从**正在运行的**桌面端进程内存里找回来。密钥只保存在网关进程内存中，不落盘、不写日志，网关重启后重新回收一次即可；
- 这一步只读目标进程的私有内存（`OpenProcess(PROCESS_VM_READ)` + `ReadProcessMemory`），不会向客户端写任何东西；提示权限不足时，以管理员身份启动网关再试一次；
- 仅 Windows 可用；Docker / Linux / macOS 下请用方式一。

~~相关代码保留未删（前端 `scanDesktop()` 与后端 `/accounts/import/desktop` 都在），等解密打通或改走其他凭据来源之后再放出来。~~

---

## 四、客户端配置与接入

- **API 接口地址 (Base URL)**：`http://127.0.0.1:8788/v1`（局域网为 `http://<局域网IP>:8788/v1`）
- **API Key**：
  - 本机单机模式（未配置 Key 且未开 LAN）：可留空或填任意字符；
  - 已在看板配置 Key 或 LAN 模式：在看板「设置」页面添加或复制已绑好出口的 API Key（如固定走国际版的 Key 或国内版的 Key）。
- **模型名称**：填入 `/v1/models` 中列出的任意官方对齐模型 ID（如 `deepseek-v4.1-flash`、`gpt-6-astra`、`glm-5.3` 等）

### Codex CLI / Claude Code (Responses API)
网关原生内置 Responses 协议双向转换与 WAF 指纹脱敏：
```bash
export OPENAI_BASE_URL="http://127.0.0.1:8788/v1"
export OPENAI_API_KEY="你在看板设置中添加并绑定的API_Key"
```

### Claude Code (原生 Anthropic Messages API)

网关同样原生实现 Anthropic Messages 协议（`/v1/messages`，流式与非流式），Claude Code / Anthropic SDK 可以直连，不再经过 Responses 转换层：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8788"
export ANTHROPIC_API_KEY="你在看板设置中添加并绑定的API_Key"
```

模型名沿用网关的官方对齐 ID（如 `deepseek-v4.1-flash`、`gpt-6-astra`、`glm-5.3`）。

协议映射与边界（都按 Anthropic 官方 Messages 规格实现）：

- `system`（字符串或文本块数组）→ 上游 system 消息；`text` / `image` / `document` / `tool_use` / `tool_result` 内容块双向转换；`tools` + `tool_choice` + `disable_parallel_tool_use`、`stop_sequences`、`metadata.user_id`、`thinking` / `output_config.effort` 全部映射到上游对应字段；
- 流式输出是原生事件序列：`message_start` → `content_block_start` / `content_block_delta`（`text_delta` / `input_json_delta`）→ `content_block_stop` → `message_delta`（含 `stop_reason` 与用量）→ `message_stop`；
- 鉴权接受 `x-api-key` 或 `Authorization: Bearer`，错误一律用 Anthropic 的 `{"type":"error","error":{"type":...}}` 信封；
- 服务端工具（`web_search` 等，Anthropic 侧执行的）上游不支持，会被丢弃并在 system 里注明，不会伪造调用；
- `thinking` / `redacted_thinking` 块不会回放（上游不提供可验证签名）；`top_k`、`cache_control`、`context_management` 与 `betas` 会被忽略；
- `/v1/messages/count_tokens` 返回的是网关的 CJK 感知估算值（与用量统计同一套估算器），**不是**官方分词器的精确值。

---

## 五、看板与接口一览

访问 `http://127.0.0.1:8788/` 即可使用集成看板，核心接口包括：

「数据看板」页顶部可切换统计口径：**今日 / 本周 / 本月 / 全部历史 / 自定义**。本周自周一零点起算、本月自 1 号零点起算，自定义可指定起止时间（任一侧留空表示不限）。切换后 KPI 卡片、账号用量透视表与模型性能表会一起切到同一窗口。

每个主页面（「网关与账号」「数据看板」「设置」）左侧都有一条区块导航：导航项由页面上实际存在的区块现场生成（不写死页面、也不写死清单，增删区块甚至新增页面都无需改导航代码），点击即可直达对应区块，滚动时自动高亮当前区块；点击后地址栏会带上 `#锚点`，便于分享链接或刷新后回到同一位置。侧栏顶部有「回到顶部」按钮，长页面一键回顶（窄屏下它固定在标签条左端，不随标签滚动）。侧栏标题旁还能把整条侧栏收成一条窄轨，把宽度让给内容区，收起状态会记住（窄屏下导航本身就是一条横向标签条，没有可收的余地，按钮不显示）。被隐藏的区块不进导航，也不能作为锚点落点；区块不足两项的页面（例如只有一个视图的运行日志页）不显示侧栏。窄屏下侧栏自动收成可横向滑动的吸顶标签条。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | Web 用量与任务监控看板 |
| POST | /v1/chat/completions | 标准 Chat Completions 接口 |
| POST | /v1/responses | Responses API 协议接口 |
| POST | /v1/messages | 原生 Anthropic Messages 协议接口（流式 / 非流式，`x-api-key` 或 `Authorization` 鉴权） |
| POST | /v1/messages/count_tokens | Anthropic 计数接口（CJK 感知估算值，非官方分词器） |
| GET | /v1/models | 官方对齐模型列表（含能力与规格宣告） |
| GET | /pricing | 定价状态：当前生效策略、上次/下次取价时间、未定价清单（分类 + 候选） |
| POST | /pricing/refresh | 立即取一次价（需面板会话） |
| POST | /pricing/mapping | 手填 / 清除「模型 → OpenRouter id」运行期映射，随后自动取价（需面板会话） |
| GET | /agents | 客户端探测概览、支持的模型清单及网关连接地址 |
| POST | /agents/apply | 一键写入客户端配置并备份原件（需面板会话） |
| POST | /agents/restore | 一键还原客户端至首次配置前的状态（需面板会话） |
| GET | /tasks | 国内版成长任务、连续打卡与猫猫日常状态 |
| POST | /tasks/run | 触发国内成长任务全自动点亮与领奖 |
| POST | /tasks/travel | 触发猫猫日常旅行（派出 / 领奖） |
| GET | /scheduler | 定时调度器运行状态与排程日志 |
| POST | /scheduler/trigger | 手动立即执行后台巡检保活 |
| GET | /activity/history | 账号每日活动历史：签到与每日活跃的每一次真实尝试（`range` / `uid` / `task` / `result` / `limit`，最新在前） |

---

## 六、版本更新记录 (Changelog)

<!-- 发版时：把下面的 Unreleased 段落整理成新版本号（## vX.Y.Z），整体移入 docs/CHANGELOG.md 顶部 -->

### Unreleased

已发布版本的完整记录（v1.4.5 ~ v1.6.19，含每版的 PR 归属）见 **[docs/CHANGELOG.md](docs/CHANGELOG.md)**。

---

## 七、致谢与引用声明 (Credits & References)

协议兼容、风控规避与任务链路设计过程中，参考并吸纳了以下开源项目的经验与逆向成果：

- **[Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api)**：成长任务全链路逆向、设备指纹稳定派生（`derive_id`）、整点排程调度（`Scheduler`）、指纹脱敏与 `reasoning_content` 回填；
- **[CangShui/workbuddy-cliproxy-fix](https://github.com/CangShui/workbuddy-cliproxy-fix)**：早期客户端代理修复与接口差异参考；
- **[lovingfish/workbuddy-cliproxy](https://github.com/lovingfish/workbuddy-cliproxy)** 与 **[mmqz/cpa-multi-plugins](https://github.com/mmqz/cpa-multi-plugins)**：网关通信与多插件管理原型参考；
- **[ardeyouxipianyi/workbuddy2api](https://github.com/ardeyouxipianyi/workbuddy2api)**：国内版分发包逆向分析与出站 User-Agent 规范参考。

PR 贡献者（v1.4.5 之前的改动未进上方更新记录，这里一并列出）：

- **[@ddddd-ren](https://github.com/ddddd-ren)**：用量日志倒序检索与看板防堆叠（PR #14）、原子写入与并发竞争修复（PR #13）、账号池 JSON 导出导入（PR #5）；
- **[@wylftw0314-glitch](https://github.com/wylftw0314-glitch)**：Responses API custom 工具协议双向转译（PR #12）；
- **[@shuishuipingan](https://github.com/shuishuipingan)**：成长任务领取竞态与专家/团队事件 id 去重、猫猫旅行派出修复、夜猫子任务接入调度器、启动端口误判（PR #21）、按模型冷却限流（PR #22）、任务接取强化与轮询加速（PR #27）、网络抖动重试与 403 直通（PR #28）、HTTP 连接同步（PR #30）；
- **[@ayeaaaa](https://github.com/ayeaaaa)**：按账号绑定出口代理槽（PR #26）、DeepSeek `reasoning_content` 回填（PR #36）、看板移动端布局（PR #37）；
- **[@t-789](https://github.com/t-789)**：macOS 启动脚本与防火墙助手（PR #31）；
- **[@Cekxri](https://github.com/Cekxri)**：Codex App namespace 工具支持（PR #33）；
- **[@wiggins-kong](https://github.com/wiggins-kong)**：API Key 行 id 唯一化（PR #40）、Docker 镜像缺少运行时模块（PR #41）；
- **[@Pro-XK](https://github.com/Pro-XK)**：看板积分消耗与账号昵称（PR #45）；
- **[@teddyli18000](https://github.com/teddyli18000)**：单模型限流可视化（PR #50）、`/health` 鉴权状态修正（PR #52）；
- **[@LuFering](https://github.com/LuFering)**：Docker 部署下的 Linux 桌面凭据挂载说明（PR #55）；
- **[@zhangzm0](https://github.com/zhangzm0)**：`tool_choice="none"` 保留工具声明（PR #57）。

---

## 八、免责声明 (Disclaimer)

1. 本项目为非官方自托管网关，仅供技术研究、逆向协议学习与个人合法授权账号在私有环境测试使用。
2. 本项目不提供任何账号及额度。请严格遵守官方服务条款，禁止用于任何商业转售、恶意并发或违规滥用。
