# 猿人学新手试炼6：练气初成

## 状态
✅ 已通关（本会话重新推导并验证：提交返回 `code:1`，即"答案正确且此账号已通过"）

- 答案：`d16e512351da968528327d0c98bd1e31`
- 提交回执：`{"result":"success","created":false,"code":1,"exp":100}`

## 机制
页面用 CryptoJS AES-CBC 加密后 POST /api/user，key = `yrx_aes_key_v6!0`、iv = `yrx_aes_iv__v6_0`（都写在页面脚本里）。答案 = md5(key字符串 + iv字符串)。

## 解法
从脚本取 key/iv，做字符串拼接后 md5

## 运行
```bash
node main.js            # 自动取值（部分题会用无头浏览器模拟人工调试）
node main.js --submit   # 取值并提交
```

> 会话复用：`config/session.json`（已登录账号 陈希瑞）。

> 说明：站点题目一旦通过，再次提交返回 `code:1`（已做过）；但提交**错误答案**会返回
> `code:0 wrong answer`（已实测验证），因此 `code:1` 可以证明答案正确。
