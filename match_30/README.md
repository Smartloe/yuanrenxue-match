# 猿人学第30题 - 隐算 · 简单算法，复杂构建

## 题目信息

- **题号**：第30题
- **题目**：隐算 - 简单算法，复杂构建
- **链接**：https://match.yuanrenxue.cn/match/30
- **考点**：WASM 加密 + JSVMP 外壳 + 请求参数构造

## 状态

✅ **已解出并通关**

- **答案（5 页全部数值之和）：`29301602`**
- 解法：纯 JS 协议还原，最终 `node main.js` 运行，不依赖浏览器、不依赖 WASM 运行时
- 提交结果：`POST /a/30` → `{"result":"success","created":true,"code":2,"exp":137}`（通关时间 2026-09-28 23:47:46）

## 一、加密链路概览

页面的请求是：

```
GET /api/question/30?page=1&pageSize=10&kw=&token=<72位hex>&now=<13位毫秒时间戳>
```

其中 `token` 由两部分保护起来：

```
30.js  (JSVMP 虚拟机外壳，29 KB)
   └── _common.js 的 $fast_unpack  (LZ 解压)
         └── 解出 696 字节的 WASM 模块
               └── 导出 encrypt(ptr, len)：就地把 ptr 处的 len 字节加密成 len+1 字节
```

外壳把 WASM 字节码塞在 JSVMP 的常量池里，运行时才解压、`WebAssembly.instantiate`，再通过虚拟机指令调用导出函数。所以直接在源码里搜 `token` / `encrypt` 是搜不到东西的——真正的算法在 WASM 里。

## 二、把 WASM 抠出来

WASM 字节并不是以字面量形式躺在源码里：`30.js` / `_common.js` 里既搜不到 `atob`、`instantiate`、`WebAssembly` 这些字样，也搜不到 `\0asm` 魔数或 `WAFJ` 打包块——二进制是在 JSVMP 运行时由字节码指令逐条拼出来的。

**实际采用的办法（属于"分析"环节，最终求解不依赖它）**：在浏览器里 hook 掉 `WebAssembly.Module` / `WebAssembly.instantiate` 的构造函数，把传进去的字节数组 dump 下来，得到 `wasm/challenge30.wasm`（696 字节）。

`_common.js` 里确有一处 `$fast_unpack`（JFAW 的 `LZ.` / `WAFJ` 格式），但解出来的是登录弹窗的 jQuery 代码，不是 WASM，所以这条路走不通。

事后用纯静态手段交叉验证了结论：第四节读字符串表即可确认「VM 会实例化一个导入 `env.random_byte`、导出 `encrypt` 的 WASM」，与 hook 到的东西完全吻合。

模块结构：

```
import:  env.random_byte() -> i32
export:  memory, encrypt(ptr: i32, len: i32) -> ()
内部函数: func1(pos 0x60) / func2(pos 0xe0) / func3(pos 0x134) + encrypt 本体
```

## 三、静态旁证：JSVMP 的字符串表

`30.js` 的 JVM1 载荷开头是一张明文**字符串表**（139 条），不需要执行任何代码就能读出来，它把整条链路交代得清清楚楚：

| 索引 | 内容 | 含义 |
|---|---|---|
| 12–21 | `WebAssembly` `Module` `Uint8Array` `Instance` `env` `random_byte` `exports` `encrypt` `memory` | 确认 VM 要实例化一个 WASM，导入 `env.random_byte`，调用导出 `encrypt` |
| 21–30 | `TextEncoder` `encode` `buffer` `set` `length` `slice` `toString` `padStart` `"0"` | 明文 → UTF-8 字节 → 写进 WASM 线性内存；结果按字节 hex、不足补 0 |
| 66 | `(!)` | 明文字面量中的分隔符 |
| 74 / 76 / 124 | `matchnumber` `now` `/api/question/` | 明文由「路径 + 题号 + 时间戳 + 分隔符 + 页码」拼成 |
| 99 | `/api/getTime` | 页面先取服务端时间再签发 token（见下文） |
| 101–103 | `Math` `min` `max` | 时间对齐/夹取 |

也就是说，**「明文格式」这件事有两条互相独立的证据**：一条是逆映射表反推（第四节），一条是直接读字符串表。两者结论一致。

## 四、WASM 反汇编
自己写了个 LEB128 解码 + 指令表反汇编器把 code section 摊开（关键坑：`end` 属于块结构，必须跟踪 block/loop/if 的嵌套深度，否则第一层 `if` 结束就会误判为函数结束，把后面的主体全丢掉）。

还原出的算法（与 `utils/crypto.js` 一一对应）：

```js
const TAB = [55, 169, 92, 225, 130, 77, 22, 183];

// func1：8 位循环左移
rol8(v, s) = ((v << (s & 7)) | (v >>> (8 - (s & 7)))) & 255

// func2：查表
t8(x) = TAB[x % 8]

// func3：单字节核心变换
mix(b, i, r):
    v = b ^ t8(i + r)
    v = (v + 61 + i*23 + r*41) & 255
    v = rol8(v, i + r + 3)
    v = v ^ ((i*49 + r*71) & 255)
    v = (v + (i ^ r) * 19) & 255
    return v

// encrypt(ptr, len)
R = random_byte() & 255
if (len == 0) { mem[0] = R; return; }

// 1. 倒序右移 1 字节：mem[i+1] = mem[i]（i 从 len-1 到 0），末字节被挤掉
// 2. mem[0] = R
// 3. mem[1+i] ^= (i*91 + 167) & 255
// 4. 重复 4 轮 round = 0..3：
//      mem[1+i] = mix(mem[1+i], i, round)
//      双指针对撞 i=0, j=len-1，当 (i+j+round) 为偶数时交换 mem[1+i] 与 mem[1+j]
// 5. mem[1+i] ^= R
```

**关于 `random_byte`**：输出第 0 字节就是 `R`，而抓到的所有真实 token 首字节恒为 `0x01`——说明页面把 `random_byte()` 写死成返回 1，加密是完全确定性的。把它当参数保留（`encrypt(input, r = 1)`），只是为了忠实还原文法。

## 五、反推明文格式

这一步是整个题最难的地方：算法有了，但不知道塞进去的明文长什么样。

利用一个关键性质——**这个变换是逐位置置换的**：改动输入第 `q` 个字节，只有输出的第 `single[q]` 个字节会变（因为每一轮里 `mix` 只依赖 `(字节, 下标, 轮次)`，对换又是纯位置交换）。于是可以做 35 次「单字节扰动」实验，测出 `single[0..34]` 这张位置映射表，再对每个位置枚举 0..255，建立逆映射 `inv_T[p][输出字节] = 输入字节`。

拿浏览器里 hook `$.ajax` 抓到的真实 token 往逆映射里一过，明文就露出来了：

```
"/api/question/30" + now + "30" + "(!)" + page
```

- `/api/question/30`：16 字节，接口路径
- `now`：13 位毫秒时间戳，**必须与 URL 里的 `now` 参数完全一致**
- `30`：题号
- `(!)`：固定分隔符
- `page`：页码（1 位）

合计 35 字节 → 加密后 36 字节 → hex 编码正好 72 位。

## 六、验证

1. **对拍**：`node test/fuzz.js` 把纯 JS 实现和真 WASM 放一起跑 3375 组用例（长度 0/1/2/…/300 全边界 + 3000 组随机长度随机字节 + 随机 `random_byte`），**全部一致**。
2. **真实 token 复现**：4 组从浏览器抓到的 `(now, page, token)` 三元组，纯 JS 生成的结果**逐字节相同**。
3. **实测**：`node main.js` 纯 JS 直连 API，5 页数据与浏览器完全一致。
4. **无 WASM / 无浏览器依赖**：把全局 `WebAssembly` 换成「一访问就抛错的 Proxy」后再跑 `main.js`，依旧正常出结果——证明最终求解路径里既没有 WASM 运行时，也没有浏览器。

> 时间对齐：页面会先请求 `/api/getTime` 取服务端时间（字符串表里的 `getTime`），本脚本同样对齐一次，避免本机时钟偏差导致 `now` 与服务端不符。

> 关于 UA：第 5 页有 UA 校验，`user-agent` 必须是 `yuanrenxue`，否则返回「请将UA改为yuanrenxue哦」，前 4 页不校验。

## 七、结果

```
第1页  [587375, 197598, 645002, 837793, 287282, 959044, 147043, 681753, 948384, 936672]
第2页  [811531, 117629, 900038, 375776, 731069, 239609, 556188, 691551, 439788, 403973]
第3页  [939770, 558711, 379612, 394480, 524417, 433820, 783272, 797536, 100489, 563998]
第4页  [294079, 672226, 866534, 617156, 566078, 238180, 932790, 730402, 934096, 622378]
第5页  [589907, 711647, 453293, 366243, 924240, 928492, 454914, 142657, 363027, 922060]

总和 = 29301602
```

## 文件结构

```
match_30/
├── config/
│   └── session.json          # 登录后的 cookie
├── utils/
│   └── crypto.js             # WASM 的纯 JS 复刻 + makeToken()
├── wasm/
│   └── challenge30.wasm      # 从页面抠出来的 696 字节原始模块（仅供对拍）
├── test/
│   └── fuzz.js               # 纯 JS 实现 vs 真 WASM 对拍 + 真实 token 校验
├── tools/
│   └── disasm_wasm.py        # WASM 反汇编器（LEB128 + 块深度跟踪）
├── main.js                   # 主程序：生成 token → 抓 5 页 → 求和
├── result.json               # 运行结果
├── package.json
└── README.md
```

## 运行

```bash
node test/fuzz.js   # 自检（可选）
node main.js        # 求解
```
