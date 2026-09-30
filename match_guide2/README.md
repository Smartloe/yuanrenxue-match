# 猿人学新手试炼2：引气入体

## 状态
✅ 已通关（本会话重新推导并验证：提交返回 `code:1`，即"答案正确且此账号已通过"）

- 答案：`yrx_network_welcome_v2_d33039f3fcbb267de77fb5df3a997960`
- 提交回执：`{"result":"success","created":false,"code":1,"exp":50}`

## 机制
页面会向 /api/user 发一个 POST 请求，请求体里带 **sign** 参数，答案就是该 sign 的值（页面上有两个 /api/user 请求，要取 POST 的那个）。

## 解法
CDP 监听网络，抓 POST /api/user 的请求体（_shared/guide_capture.js guide2）

## 运行
```bash
node main.js            # 自动取值（部分题会用无头浏览器模拟人工调试）
node main.js --submit   # 取值并提交
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），因此 `code:1` 可以证明答案正确。
