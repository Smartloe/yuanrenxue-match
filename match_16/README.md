# 猿人学第16题 —— js逆向 - window蜜罐

## 状态
✅ 已通关（本账号此前已通过；本会话重新实现求解器并提交验证）

- 提交回执：`{"result":"success","created":false,"code":1,"exp":95}`
- 本次计算的答案/合计：`27491154`

## 机制
题目专用脚本 `/static/new_match/question/16/webpack.js`（webpack 打包的混淆代码）会生成请求参数，并对 `window` 上的读写埋"蜜罐"陷阱；数据接口 `/api/question/16`，每页 10 个数字，答案 = 5 页之和。

## 解法
用真实浏览器打开题目页，让页面 JS 自己完成参数生成与请求，再用 CDP 真实输入事件翻页抓取（`_shared/solve_pages.js`）。不用脚本还原参数，避免触发 window 蜜罐。

## 运行
```bash
node main.js [--no-submit]
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交会返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），所以 `code:1` 可证明本次答案正确。
