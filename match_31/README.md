# 猿人学第31题 —— 混元 · 对称迷局，另辟蹊径（WASM + AES-CBC）

## 状态
✅ 已通关

- 本会话提交回执：`{"result":"success","created":true,"code":2,"exp":156}`
- 答案/合计：`29364247`（5 页 × 每页 10 个六位数字，共 50 个数求和）
- 解法：**纯后端**（Python + requests，无浏览器 / 无 CDP / 无 Node），token 本地现算

## 一、算法结论（已完全还原并逐字节验证）

```text
token = base64( AES-128-CBC( PKCS#7( 明文 ), key, iv ) )

key = "1234567890654321"          # 16 字节 ASCII
iv  = "123456789O654321"          # 注意：第 10 个字符是大写字母 O(0x4f)，不是数字 0

明文 = "/api/question/31" + str(now) + "31" + "(kjskj)" + str(page) + "1"
       └── 被加密的 URL 路径 ──┘  └时间戳┘   └题号┘  └固定标记┘   └页码┘  └固定 1┘
```

请求：
```
GET /api/question/31?page=P&pageSize=10&kw=&m=&token=<token>&now=<now>
```
- `token` 与 `(page, now)` **强绑定**：换页码或改 `now` 一律 `403 {"error":"token failed."}`
  → 这正是题面说的"五重封印"，每页必须现算 token
- 数据按 `sessionid` 生成：匿名与登录后同一页数字完全不同 → **取数与提交必须同一会话**
- 末页 UA 闸门：`page=5` 时请求头 `User-Agent` 必须是 `yuanrenxue`，
  否则返回 `{"data":["请","将","UA","改","为","yuan","ren","xue","哦"]}`

验证强度（`python3 tools/recover_algo.py`）：用捕获的真实 `(page, now)` 反解明文 → 再反向生成 token，
5 个样本 **逐字符完全一致**；`solve.py` 用纯 requests 取 5 页全部 HTTP 200，合计与通关答案一致。

## 二、混淆手法揭秘：把 AES 的常量"挖空"交给 JS

`/match/31/js/31.js` 的 `get_encrypt()` 内嵌 70KB base64 的 WASM。导出：

| 导出 | 签名 | 说明 |
|---|---|---|
| `aes_init` | `() -> ()` | 初始化（内含取常量、建表、密钥扩展） |
| `max_len` | `() -> i32` | 返回 65520 |
| `encrypt` | `(in_ptr, in_len, out_ptr) -> i32` | **返回值 = 输出 base64 文本长度** |
| `decrypt` | `(i32,i32,i32) -> ()` | 同上 |
| `memory` | memory | 3 页 192KB |

**关键坑**：`encrypt` 的前两个参数是 `(输入指针, 输入长度)`，输出写在第三个参数。
一开始按 `(in, out, len)` 调用，把 S-box/轮密钥当成明文加密，读到的"密文"其实是 base64 文本，
导致后续 key/IV 推导全部跑偏。用 16 字节明文调用返回 44（= 32 字节密文的 base64 长度）才确认了正确签名。

WASM 反向导入 36 个函数 `js.K0..js.K19`、`js.E0..js.E15`（各被调用 1 次）。用**扰动定位**法
（逐个让某个导入返回 `0xAA`，看内存哪一处跟着变）得到：

| 导入 | 填充位置 | 值 |
|---|---|---|
| `K0..K15` | S-box 里 16 个空洞（0x28,0x37,0x49,…,0x118，步进 16） | 标准 S-box 值（0x30,0xf0,0xa5,…） |
| `K16..K19` | Rcon 的 4 个空洞（0x121,0x123,0x125,0x127） | 0x02,0x08,0x20,0x80 |
| `E0..E15` | 返回值掺进表/运行状态 | 干扰项（真实取值下结果恰好等价于标准 AES） |

也就是说：**WASM 里的 AES 常量被挖走了 20 个字节，改由 JS 在运行时喂进来**——
不还原这一步，直接调用 WASM 只能得到错误密文。这才是本题"wasm 层内做了算法混淆"的真正含义。

## 三、还原步骤（`tools/recover_algo.py` 全自动完成）

1. **扰动定位**：36 次实验 → 找出 20 个空洞（16 个 S-box + 4 个 Rcon）
2. **填标准常量**：填入后 `S-box == 标准 S-box`、`Rcon == 标准 Rcon`，WASM 退化为标准 AES
3. **取 key**：内存 `0x12a` 起是 176 字节轮密钥，首 16 字节 = `1234567890654321`，
   与标准 AES-128 密钥扩展**完全一致**（自校验）
4. **反推 IV**：`encrypt(16 个 0x00)` → `C1 = E(IV)`，故 `IV = D(C1)`；
   再用 `D(C2) XOR C1 == 0x10*16` 验证 PKCS#7 → 确认 **CBC + PKCS#7**，得 `IV = 123456789O654321`
5. **验明文**：用 key/IV 解密抓到的真实 token，明文即
   `/api/question/31{now}31(kjskj){page}1`
6. **反证**：用纯 Python 标准 AES 重新生成 token，与真实抓取值逐字符一致

## 四、运行（纯后端，推荐）

```bash
# 依赖：requests、cryptography
python3 solve.py --verify      # 取 5 页数据 + 与 result.json 记录答案比对
python3 solve.py               # 只取数（写 docs/last_run_pure.json）
python3 solve.py --submit      # 取数并提交（写 result.json）
python3 solve.py --page 5      # 只取某一页（调试）
python3 solve.py --session <sessionid>   # 指定会话，默认读 config/session.json

python3 tools/recover_algo.py     # 自动还原 key/IV/明文格式并做确定性校验
python3 tools/inspect_wasm.py     # WASM 结构（段/类型/导入/导出/数据段）
python3 tools/inspect_wasm.py --dump   # 转储初始内存，看 S-box / Rcon
```

实测输出：
```
[✓] page 1: HTTP 200 [462273, 889329, 100908, 556536, 798880, 987936, 530875, 288371, 995440, 196401]
...
[✓] page 5: HTTP 200 [969867, 529349, 860180, 149248, 835247, 958260, 441602, 723600, 879543, 167501]
[*] 共 50 个数，合计 = 29364247
[*] 与 result.json 记录答案比对: ✓ 一致
```

## 五、备用方案：浏览器驱动（`main.js`）

算法还原之前用的兜底方案，让页面自己的 JS 现算 token（实测同样可完整复现 50 个数）：

```bash
node main.js            # 取数（写 docs/last_run.json）
node main.js --submit   # 取数并提交
node main.js --headed   # 无头被风控时改用有头浏览器
```

踩坑记录（用浏览器方案时必看）：
1. **无头浏览器 UA 会被风控**：headless Chrome 的 UA 含 `HeadlessChrome`，
   即使 token 正常也一律 403、页面停在"加载中..."；须在导航前 `Network.setUserAgentOverride` 换成正常 Chrome UA。
2. **不要把 UA 全局覆盖成 `yuanrenxue`**：1–4 页要求浏览器 UA，全局改会让 1–4 页也 403；
   末页只需改 **HTTP 请求头**（`Network.setExtraHTTPHeaders`），页面 JS 侧 UA 保持浏览器值。
3. **token 不能跨页复用**：与 `page`+`now` 绑定，必须逐页现算。

## 六、本目录文件

| 路径 | 说明 |
|---|---|
| `solve.py` | **纯后端求解器**（requests + cryptography，无浏览器） |
| `main.js` | 备用：浏览器驱动求解器（CDP） |
| `tools/recover_algo.py` | **自动还原算法**（扰动定位 → 定 key/IV → 校验真实 token） |
| `tools/inspect_wasm.py` | WASM 结构分析（段/类型/导入/导出/内存转储） |
| `docs/31.js` | 题目混淆 JS（内含 `WASM_B64`） |
| `docs/_general_common.js`、`docs/page31.html` | 站点通用混淆脚本与页面 HTML（含 `submit()` → `POST /a/31`） |
| `wasm/31.wasm` | 从 `31.js` 提取的 WASM |
| `docs/tokens.json` | 真实抓到的 token 样本（含 `page`/`now`，用于确定性校验） |
| `docs/pages.json`、`docs/final_data.json` | 匿名 / 登录会话的 5 页数据 |
| `docs/submit_result.json` | 首次（page5 缺数据）失败提交的过程记录 |
| `docs/last_run_pure.json` | 纯后端最近一次取数结果 |
| `config/session.json` | 会话（已登录账号 陈希瑞） |

> 注意：题目一旦通过，再次提交返回 `code:1`；错误答案返回 `code:0 wrong answer`（可用来证明答案正确性）。
