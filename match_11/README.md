# 猿人学第11题 - 一叶障目 · 控制台检测

## 题目信息

- **题号**：第11题（站内 number=32，难度 4，`骚操作`，exp 350）
- **链接**：https://match.yuanrenxue.cn/match/11
- **保护**：JSVMP（约 214KB，`yrx_check_devtools_jsvmp.js`）+ WlzShield 控制台检测盾

## 状态

✅ **已解出并通关**

- **提交接口**：`POST /a/11` → `{"result":"success","created":true,"code":2,"exp":350}`
- **通关时间**：2026-09-30 00:09:10（账号 exp 1935，通关数 16）
- **一条命令复现**：`node main.js`（取值 + 提交）

## 零、解法（最终答案的构造）

```js
answer = window.SecretKey(X + S)
```

| 变量 | 含义 | 获取方式 |
|---|---|---|
| **S** | 服务端**每次请求** `/match/11` 下发的一次性后缀（16 位 hex，写在题面文本里） | 只能从**网络响应体**里取 —— 盾会把题面里的它从 DOM 抹掉 |
| **X** | JSVMP 盾初始化时生成并**打印**的随机串（16 位，`RandomString: X`） | 必须在页面脚本之前**劫持 iframe 的 console**，否则盾会立刻 `console.clear()` 把打印清掉 |
| `SecretKey` | 盾挂到 `window.SecretKey` 的**真**签名函数 | 注意是**大写 K**；题面写的 `window.secretkey` 在代码里根本不存在 |

⚠️ **三个关键坑**（每一步都踩过）：

1. **X 必须是盾真正打印出来的那个**，不能用 `window.randomString(16)` 之类自己生成的 —— 服务端能区分（首次尝试用自造 X 提交被拒）；
2. **S 与 X 必须来自同一次页面加载** —— S 每次请求都会变（我最初用题面里的 `3f73bd8671faaa92` 提交，必然失败）；
3. **`SecretKey` 的输出是非确定性的**（它像"随机 IV/密钥 + 分组加密"，长度 = `32 + 16*ceil(len/16)` 字节），
   所以**不能**用"同输入两次结果是否相同"来判断真假函数 —— 我正是被这一点误导了很久，误判它是诱饵。

> 这也解释了服务端为什么能校验：S 由服务端下发并记住，X 由盾从 S 派生（带 shield 内部密钥的派生，
> 所以用普通 md5/sha/base62 猜不出来），答案则是可解密/可验证的随机化签名。

## 一、页面上到底要做什么

页面题面（`static/match11.html` 第 556-563 行）写的是：

```
试炼目标：请尝试打开控制台，并恢复控制台的全部功能
1. 获得控制台打印出的 secretkey 对应的字符串（你需要恢复 console.log 功能，并且看到它打印的内容）
2. 在控制台执行 window.secretkey(第一步获取的字符串 + "3f73bd8671faaa92")
3. 将函数的最后返回值填入输入框，并提交答案
```

页面里的内联脚本只有一个 `$.ajax` 包装器：

```js
let _ajax = $.ajax
$.ajax = function (){
    if (arguments[0].url === "/api/match/11"){ window.match1 = arguments[0].data.m }  // 拦截，不真发请求
    else { _ajax.apply(this, arguments) }
}
```

也就是说：盾在"检测通过"时会算出 `m` 并通过这个假 ajax 存进 `window.match1` —— **`match1` 就是答案**，而题面给的 `window.secretkey(...)` 是拿到同一个值的另一条路。

## 二、盾的结构（已逆向清楚）

### 2.1 暴露的入口

按"源码特征是 `function gL(`"全量扫描 window 及其嵌套对象，VM 暴露的入口只有：

| 入口 | 签名 | 行为 |
|---|---|---|
| `window.SecretKey` | `(x)` | **假函数**：每次调用返回不同的十六进制串（长度随输入变化） |
| `window.randomString` | `(len)` | 生成 `len` 位随机串（字符集 `A-Za-z0-9`） |
| `window.initDevtoolsTrap` | `()` | 初始化盾（返回 undefined） |
| `window.DevtoolsTrap` | class | **盾本体**，可直接实例化 |
| `window.browserUtils.*` | `()` | `isChromium()` 与 `isWebKit()` **同时返回 true**（明显是被篡改的诱饵） |

⚠️ **题面里的 `window.secretkey`（小写）在当前版本不存在** —— 我 hook 了 `String.fromCharCode`，把盾运行期构造过的字符串全抓下来（496 条），里面只有 `SecretKey`，从来没有构造过 `secretkey`。

### 2.2 DevtoolsTrap 可以直接实例化观察

```js
const i = new window.DevtoolsTrap();
i.random_str     // "uV6MLWd41zJLqGhS" —— 控制台打印的那个随机串
i.triggeredMap   // {dimension_mismatch:false, debugger_pause:false, console_element_id_get:false,
                 //  console_error_property_get:false, console_dir_error_name_get:false,
                 //  console_dir_tampered:false, console_log_array_performance:false,
                 //  promise_error_getter:false}   ← 全 false
i.checkEnv()     // true                                ← 环境完整性检查也过
i.console        // 盾自己保留的"干净 iframe console"
i.iframe / i.largeObject / i.messageHandler / i.timer
```

`RISK_KEYS` = 上面 8 个键，对应 8 个检测方法：`checkDimensions`、`checkDebugger`、
`checkConsole`、`checkConsoleErrorProperty`、`checkConsoleDirTrap`、
`checkConsoleLogArrayPerformance`、`checkPromiseErrorGetter`，外加 `checkEnv`。

### 2.3 已尝试并排除的方案（全部无效）

| # | 方案 | 结果 |
|---|---|---|
| 1 | 无头 Chrome + 开 `Runtime` 域观察 | 触发盾 → 跳转首页、全局被清空 |
| 2 | 无头 Chrome + **不开** `Runtime`（避免 console 序列化被检测） | 8 项全不触发，但仍只有假函数 |
| 3 | 用 Proxy 包 `Function.prototype.toString` 等做间谍（保持原生特征） | 看到盾检查 `console.log`/`toString`/`gL` 原生性，**全部通过** |
| 4 | 有头 Chrome（`--no-sandbox`）、加载期间**零 CDP 干预** | 同上，假函数 |
| 5 | 挂真 DevTools 前端（`devtools://inspector.html?ws=...`） | 页面被 `debugger` 卡死；跳过断点后仍只看到探针输出 |
| 6 | 从干净 iframe 恢复 console 全部方法（题面要求的那一步） | 无效（Chrome 里 `window.console.log === iframe.contentWindow.console.log` 本来就为 true） |
| 7 | `window.console = new DevtoolsTrap().console` 等 6 种变体 | 全部无效 |
| 8 | 伪造窗口尺寸（`outer-inner` 各种差值） | 无效 |
| 9 | 派发 `keydown`/`contextmenu`/`click` 等交互事件 | 无效 |
| 10 | 手工 `trigger(...)` / `forceRedirect()` | 触发后盾自毁全局并跳转 |
| 11 | 遍历 `SecretKey` 的各种调用方式（多余参数/`this`/`apply`/`new`） | **没有一种组合是确定性的** → 确认是纯诱饵 |
| 12 | 直接 POST `/api/match/11`（json / form / query 三种） | 全部 404 |

## 三、第二轮补充：字节码级插桩（新证据）

为了确认"真函数是否存在于字节码里、只是分支没走到"，这轮做了 VM 层面的插桩：

### 3.1 载荷结构与运行时改写

- 外层文件就是一条语句：`var yxr = eval(<解码后的载荷>);`
- 载荷每次加载都会**重新随机化标识符**（用 `\uFC5E` 开头的私有区字符），所以不能跨实例注入，
  必须在 **eval 之前对本次解码结果做字符串改写**：
  ```js
  var yxr = eval(window.__PATCH_PAYLOAD(<原解码表达式>));
  ```
  改写规则命中真正的 window 写入点 `G[0][0][K]=S.pop()`（opcode 53）：
  ```js
  (window.__lwv=S.pop(), window.__logDef&&window.__logDef(K,window.__lwv), G[0][0][K]=window.__lwv)
  ```
- 实测：改写生效（`__patchCount=1`、`yxr` 正常、盾正常工作、`checkEnv()` 仍为 true），
  **但该写入点在整轮运行中一次都没有执行**。
- 再用 Proxy 包 `Object.defineProperty` / `Reflect.defineProperty` 记录对 window 的定义 ——
  日志依然为空（而且这套 hook 会让 `checkEnv()` 变 false，说明盾确实在查这些内建函数）。

⇒ `window.SecretKey` 既不是 opcode 53 的 window 赋值，也不是 `defineProperty` 写入的。
（脚本：`tools/cdp_payload_instrumented.js`、`tools/capture_browser_payload.js`，
产物：`docs/browser_payload.js`、`docs/patched_jsvmp.js`）

### 3.2 其它新排除项

| # | 实验 | 结果 |
|---|---|---|
| 13 | 打印序列对比：两个实例同时启动 | 各不相同，且每个实例内部**循环复用一批随机串**（~5s 周期）→ 每加载一次生成一个随机池，服务端无法预知 |
| 14 | `SecretKey` 输出结构分析：逐位置稳定性 | 96 位**全部不稳定**（0/96 稳定），输出长度 ≈ `32 + 16*ceil(len/16)` 字节（像"随机 IV/密钥 + 分组加密"的诱饵结构），无任何可提取的确定片段 |
| 15 | `checkEnv` 状态跃迁：true → 破坏 console(false) → 从干净 iframe 恢复(true) | 跃迁后仍不注入真函数 |
| 16 | console 加固（noop / 只放行字符串 / 冻结 console） | `checkEnv()` 全部变 false，且仍无真函数 |
| 17 | 版本探测：`?v=1.0.0/1.0.1/1.0.2/1.0.3/2.0.0` 与无参数 | **内容完全一致**（同一个 md5），且都不含 `secretkey` 字样 |
| 18 | 真 DevTools 前端 + 摘掉 `debugger` 探针 | 一旦开 `Runtime` 域/真 DevTools，盾立刻进入反调试死循环（页面卡死）——这正是"一叶障目"要你"恢复控制台功能"的原因 |

### 3.3 目前的结论

1. 盾的 8 项检测 + `checkEnv` 在我们能构造的**所有**环境下都不触发（`triggeredMap` 全 false、`checkEnv()` 为 true）；
2. 但真函数始终不注入，`window.secretkey` 在整个 VM 运行期从未被读写（用 accessor 监听验证：访问日志为空）；
3. 唯一暴露的 `SecretKey` 是**完全随机**的诱饵；
4. 服务端会校验（提交诱饵输出返回 `wrong answer`），因此答案必须是**确定性**的。

⇒ 结论倾向于：**当前线上的盾版本与题面描述已经不一致**（题面说的 `window.secretkey` 在这一版里不存在），
或者真函数的注入依赖某种我无法在自动化环境里复现的"真人 DevTools"条件。

## 四、第三轮关键发现：后缀是服务端按请求下发的

这是本轮最重要的发现，直接改写了前面的分析：

```bash
# 同一个 session 连续两次请求 /match/11，题面里的"后缀"不同：
第1次: window.secretkey(第一步获取的字符串 + "4ceb0b0967460411")
第2次: window.secretkey(第一步获取的字符串 + "0dc693ae18d078d1")
# 不带 cookie 请求也照样下发一个（"07f4eae09899e8ca"）
```

- 两次响应的**唯一差异**就是这 16 位 hex（`diff` 全文只有这一行不同）
- 响应头只下发 `sessionid`，没有随机串 Cookie；localStorage / sessionStorage 里只有百度统计
- 所以：**服务端每次都生成一个一次性后缀 S 并（按 session）记住它** → 服务端有能力校验"与 S 相关"的答案

### 4.1 由此推出的强约束

因为服务端要能校验，答案必须**只依赖 S**。而控制台打印的随机串 X：

| 实验 | 结果 |
|---|---|
| 同一份 HTML（后缀固定为 `3f73bd8671faaa92`）跑两次 jsdom | 打印序列**完全不同** → X 与 S 无关，是纯客户端随机 |
| X 与 S 的 20 组哈希/编码/反转候选比对 | **零命中** |
| 两个实例同时启动 | 各自的随机池不同，且实例内部 ~5s 循环复用 |

⇒ **答案不可能依赖 X**（服务端无法预知），只能依赖服务端下发的 S。

### 4.2 已尝试的直接猜测

| 提交内容 | 结果 |
|---|---|
| `SecretKey(旧后缀X + "3f73bd8671faaa92")`（128 hex） | `{"result":"fail","msg":"wrong answer","code":0}` |
| **服务端本次下发的 S 原文**（16 hex） | `{"result":"fail","msg":"wrong answer","code":0}` |

⇒ 答案既不是后缀本身，也不是（用旧参数算的）诱饵输出。

### 4.3 真人视角的截图证据

用改写版 VM（摘掉 `debugger` 探针）+ 真 DevTools 前端，并对 **DevTools 面板本身截图**
（`tools/screenshot_devtools.js` → `docs/devtools_console.png`）：
打开控制台后 Elements 面板里 `<body>` 是空的 —— 盾对"检测到控制台"的反应是破坏/清空页面。
这正好印证题面为什么要求"打开控制台并**恢复控制台的全部功能**"。

## 五、第四轮：盾的初始化调用序列（最直接证据）

在页面脚本之前就给 `window.DevtoolsTrap` / `SecretKey` / `secretkey` 装 accessor，
一旦被赋值立刻把原型 14 个方法全部包上日志（脚本：`tools/trace_init.js`）。得到的完整序列：

```
1286ms  window.randomString   = function (gL, len=1)
1286ms  window.initDevtoolsTrap = function (gL, len=0)
1286ms  window.DevtoolsTrap   = undefined   → 再赋 function (gL, len=0)
1286ms  DevtoolsTrap 原型已包 (14 个方法)
2305ms  DevtoolsTrap.checkEnv() -> true                  ← 活实例自己调的
2317ms  DevtoolsTrap.checkEnv() -> true
2317ms  checkDimensions / checkDebugger / checkConsole / checkConsoleErrorProperty /
        checkConsoleDirTrap / checkConsoleLogArrayPerformance / checkPromiseErrorGetter
        / checkAll / startMonitoring / onInit
2319ms  window.SecretKey = function (name=gL, len=1)     ← 整个运行期唯一的函数注入
（之后每 500ms 一轮 5 个检查，triggered 始终 false、fired 始终 []）
```

**结论**：

1. 真/假函数的判定只发生在 `onInit()` 那一刻（约 2.3s），之后不再有任何注入；
2. 注入的唯一函数名是 **`SecretKey`**；`window.secretkey`（小写）**从未被赋值过**；
3. 该函数逐次随机（96 位全不稳定）⇒ 是诱饵；
4. 而此刻 `checkEnv()` 已经是 `true`、`triggeredMap` 全 `false` —— 也就是说**即使"检测全通过"，注入的依然是诱饵**。

⇒ 题面描述的"检测通过后注入真 secretkey"这条路径，在当前线上 build 里**并不存在**。

## 六、复盘：为什么卡了这么久

服务端会校验答案（返回 `wrong answer`），意味着**答案必然是服务端可推算的**：

```
answer = 真secretkey(控制台打印的随机串 + "3f73bd8671faaa92")
```

- 打印的随机串是客户端生成的（每个 `DevtoolsTrap` 实例的 `random_str` 都不同），且**没有任何请求把它发给服务端**（我抓了全部网络请求，只有静态资源 + `rank-config.js`/`topic_info`/`user` + 百度统计）
- 而暴露的 `SecretKey` 又是非确定性的

⇒ 要么"打印的随机串"其实是**时间/会话派生**的（服务端可重算），要么真函数在当前版本被移除了（盾的注入分支已失效）。

## 七、目录结构与工具

```
match_11/
├── config/session.json          # 登录态（陈希瑞）
├── static/
│   ├── match11.html             # 题目页面
│   ├── devtools_jsvmp.js        # 原始混淆 JSVMP（214KB）
│   └── devtools_decoded.js      # 去掉 \uXXXX 转义后的可读版本
├── docs/
│   ├── console_snippet.js       # ⭐ 给人工 F12 用的轮询脚本（v2）
│   ├── runtime_strings.txt      # 盾运行期构造的全部字符串（496 条）
│   ├── chrome_strings.json      # 真实 Chrome 里抓的字符串
│   ├── fromcharcode_pairs.json  # fromCharCode 入参→产物（用于字符串表分析）
│   ├── answer_candidates.json   # 已尝试的候选答案
│   └── eval_payload_2.js        # 截获的 VM 内层载荷（275KB）
├── tools/                       # 45 个逆向分析脚本，按用途分组：
│   ├── cdp_*.js                 # CDP 驱动分析（侦察/字符串/全局 diff/交互/恢复 console…）
│   ├── run_jsvmp_jsdom.js       # jsdom 里跑 JSVMP 并 hook $.ajax
│   ├── dump_eval.js             # 截获 VM 内层 eval 载荷
│   ├── hook_strings.js          # 抓盾运行期构造的字符串
│   ├── probe_trap_class.js      # ⭐ 实例化 DevtoolsTrap 读内部状态
│   ├── which_risk.js            # ⭐ 逐项跑检测，确认无一项触发
│   ├── probe_secretkey_modes.js # ⭐ 遍历调用方式证明 SecretKey 是诱饵
│   └── pure_launch.js           # 零 CDP 干预启动 + 事后读取
├── utils/
│   └── extract.js               # 浏览器侧取值模块（轮询 match1 / secretkey，可复用）
└── main.js                      # 取答案 + 提交流水线
```

## 八、运行

```bash
# 1) 浏览器侧自动取值（当前版本会返回 ok:false，附带诊断状态）
node utils/extract.js 20000

# 2) 拿到答案后提交
node main.js --answer <答案>
node main.js --file docs/answer.txt
node main.js --no-submit --answer <答案>   # 只落盘不提交
```

## 九、附：人工 F12 方案（已不需要，留作备用）

自动化的浏览器环境始终拿不到真函数，而题目的设计显然是给"真人开控制台"用的。
`docs/console_snippet.js` 就是给这个场景准备的：

1. 先按 **F12** 打开控制台，再访问 `https://match.yuanrenxue.cn/match/11`
2. 页面加载完（约 5 秒）后，把 `docs/console_snippet.js` 整段粘进 Console 回车
3. 脚本会：
   - 从干净 iframe 恢复 `console` 全部功能
   - 每 500ms 轮询 `window.secretkey` / `window.SecretKey` / `window.match1`，最多 30 秒
   - 一旦拿到 `match1` 或 `secretkey`，立刻用固定后缀 `3f73bd8671faaa92` 算出答案并打印 `YRX11 === ANSWER === ...`

