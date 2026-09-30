# 猿人学练习平台 · 全题解（36/36 通关）

> 猿人学（yuanrenxue.cn）爬虫逆向练习平台的完整解题项目。
> 平台共 36 道题（含 6 道新手试炼），本仓库全部通关并附可复现的求解器。
> 账号：陈希瑞 · 经验 6002 · 通关数 36/36
> GitHub：https://github.com/Smartloe/yuanrenxue-match

## 项目简介

猿人学是一个爬虫/JS 逆向练习题平台，每道题的页面上都有一段**被混淆或加密的参数生成逻辑**，
数据接口（`/api/question/<N>`）只认它生成的参数（`m` / `token` / `sign` 等），
答案通常是 5 页数据的加和（新手试炼与个别题为固定字符串）。

本项目的目标：**把每一道题的机制逆向清楚，并写成可运行的求解器**。
技术路线以 **纯 Node.js（只用内置模块）** 为主；
遇到必须依赖浏览器环境的反爬（TLS 指纹、`event.isTrusted`、JSVMP 字节码虚拟机）时，
用 **CDP（Chrome DevTools Protocol）驱动无头 Chrome** 作为运行时，而不是引入重量级依赖。

## 目录结构

```
match_X/
├── README.md           机制分析 + 解法要点 + 运行方式
├── main.js             可运行求解器（node main.js [--submit]）
├── result.json         本次答案 + 服务端提交回执
├── config/
│   └── session.json    登录会话（sessionid）
├── utils/              协议还原代码（加密/解码/取值）
├── tools/              侦察与验证脚本（历史分析过程）
├── docs/               抓包/采样/截图等证据
└── static/             题目下发的字体、MD5 库等素材

_shared/                跨题复用的通用工具
├── solve_pages.js      浏览器驱动翻页取数（模块，被各题 main.js 引用）
├── browser_pages.js    同上，独立 CLI 入口
├── debug_scope.js      CDP 自动断点调试（单步 + 调用栈作用域扫描）
├── guide_capture.js    网络请求 / XHR 断点的作用域抓取
├── audit/              站点题目清单快照（审计用）
├── recon/              新手试炼侦察留档
└── plans/              早期计划文档

tools/                  记录生成与审计脚本
├── tools_audit_records.js    站点 vs 本地记录比对（找出缺记录的题）
├── tools_gen_readmes.js      批量生成 README
├── tools_gen_readmes2.js     Q1/Q2/Q3/Q16/Q20/Q26/Q28 专用
└── tools_gen_guides.js       新手试炼交付物生成

RECORDS.md              36 题总索引（题号/难度/状态/答案/回执）
```

## 题型与技术要点

### 新手试炼（guide1~guide6）—— 调试器基本功

| 题 | 考点 | 答案 |
|---|---|---|
| guide1 观气寻诀 | 控制台里调用页面挂出的函数 | `yrx_console_welcome_v1` |
| guide2 引气入体 | Network 里找 POST `/api/user` 的 `sign` 参数 | `yrx_network_welcome_v2_d33039…` |
| guide3 点亮灵根 | `debugger` 断点 + F10 单步，等变量变成函数再调用 | `yrx_linggen_awakened_v1` |
| guide4 练气锻体 | Call Stack 向上翻栈帧，在作用域里找 `tempered_mark` | `yrx_question4_my_love_yicheng` |
| guide5 强化修为 | XHR 断点拦截 `/api/guide5`，作用域里找 `yrx_xhr_*` 变量 | `yrx_xhr_breakpoint_littleQ` |
| guide6 练气初成 | 找到 AES 的 key/iv，`md5(key + iv)` | `d16e512351da968528327d0c98bd1e31` |

### 简单（难度 1）

- **Q12 入门级js**：`m = base64("yuanrenxue" + 页码)`
- **Q13 入门级cookie**：`/api2/13` 下发 JS，eval 后写 `yuanrenxue_cookie=<时间戳>|<随机>`；**cookie 带时间戳会过期，每页都要重新取**
- **Q17 天杀的Http2.0**：接口要求 HTTP/2，Node 的 fetch（undici）默认协商 h2 直接可用
- **Q19 乌拉乌拉乌拉**：**TLS/JA3 指纹校验**，Node/curl 一律 `token failed`，必须借真实浏览器的网络栈

### 中等（难度 2~3）

- **JS 混淆系列**：Q2 动态cookie 1、Q5 乱码增强、Q6 回溯、Q9 动态cookie 2、Q21 守心、Q22 魔改标准算法、Q24 零宽字符、Q25 变量名"活"过来、Q27 异钥、Q29 混乱构建
  - 共同套路：页面自带混淆 JS 生成参数 → **用真实浏览器跑页面，CDP 真实输入事件翻页，抓渲染结果**（`_shared/solve_pages.js`）
- **Q1 源码乱码**：还原出的 MD5 库把 `chrsz` 从 8 改成 **16**（标准 md5 永远对不上）→ 纯 Node 复现
- **Q4 雪碧图、样式干扰**：字形是 base64 PNG，`class=md5(base64(key+value))` 的被隐藏；**显示顺序 = 行内槽位×8.5px + left**（按 left 排序会全错）
- **Q7 动态字体**：每页独立 TTF，`&#xXXXX;` 实体靠字体映射 → 浏览器渲染 + **匈牙利算法匹配**（10 个码点必是 0-9 的排列）
- **Q8 验证码-图文点选**：3×3 字符图 + targets，POST 点选坐标解锁；**每页都要重新过验证码**
- **Q15 备周则意怠**：`main.wasm` 的 `encode(t1,t2)` 生成 m，Node 原生 WebAssembly 直接跑
- **Q16 window蜜罐**：webpack 混淆 + 对 window 读写埋陷阱，别用脚本改 window
- **Q20 2022新年挑战 / Q26 密探（魔改 SM3）/ Q28 奇钥（RSA+VMP）**：参数生成在页面 JS 里，浏览器驱动取数

### 困难（难度 4）

- **Q10 重放攻击对抗**：带重放防护的参数生成，浏览器驱动取数
- **Q11 一叶障目-控制台检测**：JSVMP + 控制台检测盾。盾会 `console.clear()` 抹掉打印、把后缀从 DOM 抹掉；
  签名 `v = myenc("<页码>|<token窗口>", hex(t)×2)`，**VM 故意不给 page=5 签名** → 钩 `myenc` 拿当前 token 窗口，换页码现场加密
- **Q18 jsvmp-洞察先机**：`/api/v/question/18data` 需要一次性签名 `t`（服务端秒级时间）+ `v`（AES 密文）；
  **VM 校验 `event.isTrusted`**（必须真实输入事件点击），且签名**绑定页码、一次性、绑定 UA** → 裸 TLS socket 手写请求行控制头部顺序

### 另有一题纯协议坑

- **Q3 访问逻辑-推心置腹**：服务端校验 **HTTP 请求头的真实顺序**（F12/CDP 显示的是字母序），且每页取数前要先 GET `/api2/3` 做"访问登记"（202 + 1×1 GIF）

## 复现方式

```bash
# 进入任一题目目录
cd match_5
node main.js            # 取数（结果写 docs/last_run.json）
node main.js --submit   # 取数并提交

# 通用"5 页求和"题也可以直接用 CLI
node _shared/browser_pages.js --q 5 [--submit]

# 审计：站点 vs 本地记录是否齐全
node tools/tools_audit_records.js
```

> 多数题的 `main.js` 只需要 Node 内置模块；需要浏览器的题会自动拉起无头 Chrome（CDP）。
> 首次使用需把 `config/session.json` 换成你自己的登录会话（`sessionid`）。

## 注意事项

1. **凭证**：`config/session.json` 含有效 `sessionid`（登录凭证）。本仓库为公开仓库，
   任何拿到它的人都能以你的账号身份操作 —— 介意的话请把仓库转私有，或重新登录使旧 sessionid 失效。
2. **答案会变**：多数题的数据是每次请求随机生成的，`result.json` 里记录的是**当次**的答案；
   题目通过后重复提交返回 `code:1`。
3. **`code:1` 的含义**：实测提交**错误答案**会返回 `{"code":0,"msg":"wrong answer"}`，
   所以 `code:1`（"已做过"）可以证明本次答案正确。
4. **提交频率**：平台对频繁提交有封禁机制，复现时建议只取数不提交（去掉 `--submit`）。
5. **环境**：需要本机有 Chrome/Chromium（CDP 驱动用），Node ≥ 18。

## 相关索引

- [RECORDS.md](RECORDS.md) —— 36 题总索引（题号 / 名称 / 难度 / 站点状态 / 交付物 / 答案 / 回执）
- 各题 `README.md` —— 该题的机制分析、解法要点与运行方式
