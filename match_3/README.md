# 猿人学第3题 —— 访问逻辑 - 推心置腹

## 状态
✅ 已通关（本账号此前已通过；本会话重新实现求解器并提交验证）

- 提交回执：`{"result":"success","created":false,"code":1,"exp":85}`
- 本次计算的答案/合计：`25721009`

## 机制
两个考点，全在 HTTP 层：

1. **每次取数前要先 GET `/api2/3`**（返回 `202` + 一张 1×1 GIF，相当于一次"访问登记"），顺序不能反；
2. **服务端校验请求头的真实顺序**。浏览器 F12 / CDP 里看到的头是**按字母排序**过的，
   必须按 Chrome 实际发送的顺序（`sec-ch-ua → accept → x-requested-with → sec-ch-ua-mobile → user-agent → ...`）发出，
   否则数据接口一律返回 `{"error":"token failed"}`。

## 解法
用**裸 TLS socket 手写请求行**，严格固定请求头顺序；每页先访问 `/api2/3` 再取 `/api/question/3`（第 5 页 UA 需 yuanrenxue）。

## 运行
```bash
node main.js [--no-submit]
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交会返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），所以 `code:1` 可证明本次答案正确。


> 参考：[JS逆向:猿人学爬虫比赛第三题详细题解](https://bbs.huaweicloud.com/blogs/230712)、[猿人学第三题：访问逻辑 - 推心置腹](https://www.cnblogs.com/NolaLi/p/19937199)。
