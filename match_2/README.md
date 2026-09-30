# 猿人学第2题 —— js 混淆 - 动态cookie 1

## 状态
✅ 已通关（本账号此前已通过；本会话重新实现求解器并提交验证）

- 提交回执：`{"result":"success","created":false,"code":1,"exp":121}`
- 本次计算的答案/合计：`29712597`

## 机制
页面自带的混淆 JS 会生成请求参数（`window.match1`）后再请求 `/api/question/2`；每页 10 个数字，答案 = 5 页之和（第 5 页 UA 需 yuanrenxue）。

## 解法
用真实浏览器打开题目页，让页面自己的 JS 完成参数生成与请求，再用 CDP 真实输入事件点击分页并抓取渲染结果（`_shared/solve_pages.js`）。

## 运行
```bash
node main.js [--no-submit]
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交会返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），所以 `code:1` 可证明本次答案正确。
