# 猿人学第18题 —— jsvmp - 洞察先机

## 状态
✅ **已通关**（`{"result":"success","created":true,"code":2,"exp":500}`，答案 26997569）

## 机制（完整逆向结果）

数据接口 `/api/v/question/18data?page=N` 需要一次性签名：

```
/api/v/question/18data?page=2&t=1790702468&v=<base64>
```

| 字段 | 含义 |
|---|---|
| `t` | 服务端**秒级**时间（页面用重写后的 `Date.now()` 同步请求 `/api/getTime` 取得） |
| `v` | `myenc("<页码>|<token窗口>", key)` 的输出，base64；`key = hex(t)` 重复两次（如 t=0x6ABBF384 → `6abbf3846abbf384`） |

`window.myenc` 是 **JSVMP 自己挂到 window 上的 AES-CBC+PKCS7 函数**（长度规律：输入 n 字节 → 16×ceil((n+1)/16) 字节）。

token 窗口是一个 9 元循环序列的滑动窗口，每次取末尾 5 个（不足 5 个时取全部）：

```
524m734, 524d734, 524u734, 572m734, 572d734, 572u734, 620m734, 620d734, 620u734
```

实测样本（钩 `myenc` 得到，与请求里的 v 完全一致）：

```
myenc("2|524m734,524d734,524u734", "6abbf3846abbf384") = d1Wsu5vQVHldSiNrOCy4bImtHdf3ErbrqbK36qeSxUU=   ← 即请求里的 v
myenc("3|524d734,524u734,572m734,572d734,572u734", "6abbf3886abbf388") = vZ9rweRZipmjXuM3uOHgUNy/AXGEb1gTPVhk2M1YaObUlliSgZH4tnwBSGzILkeZ
```

## 三个关键坑

1. **必须用真实输入事件点击分页**（`Input.dispatchMouseEvent`）：JSVMP 校验 `event.isTrusted`，用 JS 的 `element.click()` 会让签名流程内部报错、请求根本不发出。
2. **VM 只给 page=2/3/4 签名**：page=5 走的是"不签名"分支（作者故意留的），page=1 也不需要；其它页码会签但 `t=NaN`。
3. **签名绑定页码**（明文里含页码）、**一次性**、并**与 UA 绑定**（Node 用别的 TLS 指纹重放会被拒；必须在浏览器里请求）。

## 解法

```
1. 加载前把 UA 覆盖为 yuanrenxue（第 5 页的 UA 要求）
2. 钩住 window.myenc（只记录不改行为）
3. 真实点击第 4 页 → 拿到"当前 token 窗口"（明文 "4|<tokens>" 里 | 之后的部分）
4. 取服务端时间 → t，key = hex(t)×2
5. v5 = window.myenc("5|<tokens>", key)      ← 页码换成 5，token 窗口与页码无关
6. 在浏览器里请求 /api/v/question/18data?page=5&t=..&v=..
7. 1~4 页照常由页面自己签名取数，5 页相加提交
```

## 运行
```bash
node main.js            # 取值 + 提交
node main.js --no-submit
```

辅助工具（tools/）：
- `q18_hook_charcodes.js`、`q18_dump_strings.js` —— 字符串表 dump（单字节异或即可还原，VM 内嵌 CryptoJS）
- `q18_collect_myenc.js`、`q18_dense_sample.js` —— 采样 (t, 明文, 密钥, v)
- `q18_page5_alias.js`、`q18_page_alias.js` —— 页码别名等失败尝试
- `legacy_click_solver.js` —— 早期只能取 1~4 页的版本（保留作过程记录）
