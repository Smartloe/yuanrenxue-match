# 猿人学新手试炼3：点亮灵根

## 状态
✅ 已通关（本会话重新推导并验证：提交返回 `code:1`，即"答案正确且此账号已通过"）

- 答案：`yrx_linggen_awakened_v1`
- 提交回执：`{"result":"success","created":false,"code":1,"exp":50}`

## 机制
页面在 `debugger` 处暂停；单步（F10）时 `get_question_3_result` 会在第 11 次 tick 后变成函数，`get_question_3_result("yrx_No.1")` 的返回值就是答案。

## 解法
CDP Debugger 域自动单步，变量变函数后求值（_shared/debug_scope.js guide3）

## 运行
```bash
node main.js            # 自动取值（部分题会用无头浏览器模拟人工调试）
node main.js --submit   # 取值并提交
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），因此 `code:1` 可以证明答案正确。
