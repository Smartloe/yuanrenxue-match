# 猿人学第28题 —— 奇钥 - 非对称，进入另一套规则

## 状态
✅ 已通关（本账号此前已通过；本会话重新实现求解器并提交验证）

- 提交回执：`{"result":"success","created":false,"code":1,"exp":176}`
- 本次计算的答案/合计：`27382050`

## 机制
题面说明是 **RSA + VMP** 的组合；页面脚本 `/match/28/js/28.js` 负责生成请求参数并请求 `/api/question/28`，每页 10 个数字，答案 = 5 页之和。

## 解法
真实浏览器驱动页面翻页抓取（`_shared/solve_pages.js`）。

## 运行
```bash
node main.js [--no-submit]
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交会返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），所以 `code:1` 可证明本次答案正确。
