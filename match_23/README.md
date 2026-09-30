# 猿人学第23题 - js加密 · 感知 · 加强 ob 壳混淆

## 题目信息

- **题号**：第23题
- **题目**：js加密 - 感知 - 加强ob壳混淆
- **链接**：https://match.yuanrenxue.cn/match/23
- **考点**：obfuscator.io 高强度混淆去壳 + 环境感知（instanceof 检测）+ 异化 MD5 + 请求签名

## 状态

✅ **已解出并通关**

- **答案（5 页全部数值之和）：`23189335`**
- 提交接口：`POST /a/23` → `{"result":"success","created":true,"code":2,"exp":107}`
- 解法：纯 Node.js 协议还原，`node main.js` 一条命令跑完采集与提交，不依赖浏览器、不加载混淆代码

## 一、请求链路

```
GET /api/getTime                       → 1790689842829        （服务端毫秒时间戳）
GET /api/question/23
      ?page=1&pageSize=10&kw=
      &token=<32位hex>&now=<13位毫秒>   → {"data":[351624, 572048, ...]}
```

前端逻辑（`static/23.js` 去混淆后）：

```js
function buildQuery(now, apiPath, page, cb, _t, pageSize, $kw) {
    const token = md5(apiPath + now + page);        // ← 唯一签名
    return { page, pageSize, kw: $.trim($kw.val() || ''),
             m: window.matchnumber, token, now };
}
```

- **token 明文 = `/api/question/23` + now + page**，其中 `now` 必须与 URL 里的 `now` 参数完全一致
  （页面每次都先请求 `/api/getTime` 再签发 token，本脚本同样每页对齐一次服务端时间）。
- `m: window.matchnumber` 在本页为 `undefined`，jQuery 序列化时会直接丢弃，因此实际请求里没有 `m`。
- **第 5 页有 UA 校验**：`User-Agent` 必须是 `yuanrenxue`，否则最后一页不返回数据（前 4 页不校验）。

## 二、去混淆

`/match/23/js/23.js` 是 163 KB 的 obfuscator.io 产物：字符串数组 + 轮转、控制流平坦化、
死代码注入、反调试（`debugger` 定时器、console 改写）、数字表达式化。

用纯 JS 的 `deobfuscator`（ben-sb）跑一遍即可得到可读代码：

```bash
npx deobfuscator static/23.js -o docs/23.deob.js --rename
```

去壳后能直接看到 `md5(...)` 调用点和整段「异化 MD5」实现（`docs/23.deob.js` 第 1807–1976 行）。

## 三、异化 MD5（重点）

页面里的 `md5` **不是**标准 MD5，与标准实现有四处差异——全部从源码里还原：

| # | 差异 | 说明 |
|---|---|---|
| 1 | **初始 IV 由环境感知决定** | `_t = window instanceof EventTarget ? 0x188a7ae93 : 0x26beca73`；`_u = window instanceof Window ? 0x127794fb3 : …`；`_v` 看 `WindowProperties` 是否存在；`_w = document instanceof Document ? 0x4a5bc3c6 : …`。Chrome 下取 `(0x188a7ae93, 0x127794fb3, 0x20d90fe7e, 0x4a5bc3c6)`。**Node 里直接跑会走错分支，算出错误 token** |
| 2 | **K 常量表被改动 10 处** | 如 `K[1] 0xe8c7b756 → 0x52e641d9`、`K[10] 0xffff5bb1 → 0x0f0d284e`、`K[23] 0xe7d3fbc8 → 0x44ec933e`、`K[48] 0xf4292244 → 0xf4294954`、`K[63] 0xeb86d391 → 0xeb86c7d9` 等（完整表见 `utils/crypto.js` 的 `MUT_K`） |
| 3 | **add32 被换成位运算混合函数** | 源码里 `funcEverybodyProgram(a,b)` 在 `document.createElement('canvas') instanceof Node` 为真时返回 `((0x7ffff63c ^ c) ^ g) ^ e` 这类表达式（其中 `g/e/t/p/c` 由若干掩码从 a、b 拆出）。它**不等于** `(a+b)>>>0`，且不满足交换律，所以调用顺序也必须照抄 |
| 4 | **移位表按分支二选一** | `typeof successAlert === 'function' && successAlert` 为真时用标准移位表；否则用另一套异化表。页面 `alert.js` 定义了 `successAlert`，所以浏览器走标准表 |

另外明文先过一个非标准 UTF-8 编码（`funcBankTobacco` 用 `charCodeAt` 逐字符编码，不合并代理对），
`utils/crypto.js` 里一并复刻了。

### 反推与验证方法

1. **抽取 + 去混淆**：定位 `function md5(P){…}`，整段抠出来单独去混淆。
2. **动态探针**：用最小 DOM 垫片（`tools/md5env.js`）在 Node 里加载**原始混淆文件**，
   把 `__probe__({R:R,S:S,T:T,U:U,V:V,W:W,X:X,…})` 注入到 `md5` 函数体首行，
   从而拿到内部函数真身，直接比对 `add32`、`rol`、`F/G/H/I`、64 轮常量与顺序。
3. **差分对拍**：`node tools/verify_crypto.js` 把 `utils/crypto.js` 的纯 JS 实现
   与「浏览器等价分支」下的真实混淆 `md5` 对跑 269 组输入（长度 0–400 全覆盖、
   含中文、emoji、`\r\n`、以及本题 token 明文格式），**269/269 逐字符一致**。
4. **线上验证**：同一套 token 直接请求接口，5 页数据全部返回；提交后 `code=2` 通关。

> 踩坑记录：一开始只替换了 IV，用标准 K 表对拍——全错。真正被改的是 **K 表本身**；
> 而 `add32` 也不是加法，因此「异化 MD5」必须逐位照抄，不能拿标准 MD5 改 IV 了事。

## 四、结果

```
第1页  [351624, 572048, 855525, 846032, 291237, 360060, 366907, 452999, 751562, 893570]
第2页  [415979, 368045, 363505, 335693, 734172, 963133, 142631, 238216, 341063, 729629]
第3页  [106163, 787058, 682611, 474181, 433165, 691710, 690202, 226004, 104524, 876978]
第4页  [613095, 840525, 224855, 173341, 669279, 289538, 141919, 128808, 127109, 170342]
第5页  [208781, 134421, 716318, 254314, 984099, 657690, 386140, 436741, 286836, 298958]

总和 = 23189335
```

提交结果：`{"result":"success","created":true,"code":2,"exp":107}`

## 文件结构

```
match_23/
├── config/
│   └── session.json        # 登录后的 sessionid / cookie
├── utils/
│   └── crypto.js           # 异化 MD5 纯 JS 复刻 + makeToken()
├── static/                 # 原始前端资源（23.js 为混淆源）
│   ├── 23.js               # 163KB 混淆产物
│   ├── common.js
│   └── general.js
├── docs/
│   ├── md5.raw.js          # 从 23.js 抠出来的 md5 原始混淆片段
│   └── 23.deob.js          # 去混淆后的完整可读代码
├── tools/                  # 逆向分析工具（求解不依赖）
│   ├── md5env.js           # 最小 DOM 垫片，浏览器等价地加载 23.js
│   ├── probe_md5.js        # 注入探针，暴露 md5 内部函数
│   ├── ref_md5.js          # 带参数的异化 MD5 参考实现（用于差分）
│   ├── test_md5mut.js      # 差分对拍（分支枚举）
│   ├── analyze_md5.js      # 早期 IV/K 表差异分析
│   ├── load23.js           # 最初的沙箱加载脚本
│   ├── verify_crypto.js    # 最终交付实现 vs 真实混淆 md5 对拍（269/269）
│   └── probe_api.js        # 单页接口连通性探针
│   └── login_qr.js         # 扫码登录：取二维码 → 轮询 checkWxStatus → 落盘 sessionid
├── main.js                 # 主程序：逐页取时间 → 生成 token → 抓 5 页 → 求和 → 提交
├── result.json             # 采集结果 + 提交回执
├── package.json
└── README.md
```

## 运行

```bash
npm i                    # 只装 deobfuscator（分析用，可跳过）

node tools/login_qr.js        # 登录态失效时：取微信二维码并轮询，扫码后自动写入 config/session.json
node tools/verify_crypto.js   # 可选：自检异化 MD5 复刻是否 100% 一致
node main.js                  # 采集 5 页 + 求和 + 提交答案
node main.js --no-submit      # 只采集求和，不提交
```

## 登录态

页面登录是纯 HTTP 流程，无需浏览器（`tools/login_qr.js` 即为复刻）：

```
GET /api/getQRCode?scene=match                     → {success, ticket, uuid}
GET https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=<urlencode>   → 二维码图片
GET /api/checkWxStatus?uuid=<uuid>                 → 每秒轮询，success=true 时下发 sessionid
```

当前登录态：`陈希瑞`（`real_exp=1585`，炼气七层），已同步到 `match_1/12/13/15/17/19/23/30` 的 `config/session.json`。
注意 `/api/question/23` 的数据与 sessionid 无关，换个登录态求和仍是 **23189335**。
