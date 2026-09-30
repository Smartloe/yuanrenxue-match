# 猿人学新手试炼5：强化修为

## 状态
✅ 已通关（本会话重新推导并验证：提交返回 `code:1`，即"答案正确且此账号已通过"）

- 答案：`yrx_xhr_breakpoint_littleQ`
- 提交回执：`{"result":"success","created":false,"code":1,"exp":50}`

## 机制
页面用 XHR 请求 /api/guide5；对该请求下 XHR 断点，暂停后在调用栈作用域里能看到值为 `yrx_xhr_*` 的变量。

## 解法
CDP DOMDebugger.setXHRBreakpoint + 扫描作用域（_shared/guide_capture.js guide5）

## 运行
```bash
node main.js            # 自动取值（部分题会用无头浏览器模拟人工调试）
node main.js --submit   # 取值并提交
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），因此 `code:1` 可以证明答案正确。
