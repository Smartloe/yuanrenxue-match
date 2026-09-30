# 猿人学第1题 —— js 混淆 - 源码乱码

## 状态
✅ 已通关（本账号此前已通过；本会话重新实现求解器并提交验证）

- 提交回执：`{"result":"success","created":false,"code":1,"exp":107}`
- 本次计算的答案/合计：`25701613`

## 机制
页面把乱码字符串 `window.a` 逐字符还原成 Base64，再 `eval(atob(window.b).replace("mwqqppz", "'"+mw+"'"))`，
还原出来的是 **一份被改过的 MD5 库** —— 关键改动是 `chrsz` 从 8 改成了 **16**（所以标准 md5 永远对不上，这也是"源码乱码"的考点）。
库末尾 `window.f = hex_md5(mwqqppz)`，而请求参数是：

```
ts = Date.parse(new Date()) + 100000000          // 毫秒（= 16798545 - 72936737 + 156138192）
m  = hex_md5变体(ts.toString()) + "丨" + ts / 1000
```

## 解法
把页面里那份 MD5 库存成 `static/md5_lib.js`，替换占位符后在 vm 沙箱里执行，即可得到"chrsz=16 版"的 hex_md5，纯 Node 复现 m。（第 5 页 UA 需 yuanrenxue）

## 运行
```bash
node main.js [--no-submit]
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交会返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），所以 `code:1` 可证明本次答案正确。


验证：`mutatedMd5("1790831226000") = 5cf3c59ecf55e7a5575f732c23282fd6`，与浏览器里实测的 `window.f` 完全一致。
