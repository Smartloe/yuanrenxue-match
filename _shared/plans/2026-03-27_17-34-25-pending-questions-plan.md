---
mode: plan
cwd: /Volumes/有庭树/PROJECTS/match_X
task: 完成猿人学平台未完成的逆向题目
complexity: complex
planning_method: builtin
created_at: 2026-03-27T17:34:25
---

# Plan: 完成猿人学未完成的逆向题目

🎯 任务概述

针对猿人学平台 `https://match.yuanrenxue.cn/` 上未完成的 JS 逆向题目，批量执行「侦察→静态分析→动态验证→协议还原→数据采集」的完整工作流，最终交付每道题的纯 Node.js 协议采集脚本与正确答案。

📋 执行计划

## Phase 1: 题目清单获取（chrome-devtool）

**目标**：确认需要完成的题目列表

- 使用 chrome-devtool 打开猿人学平台首页 `https://match.yuanrenxue.cn/`
- 确认用户登录状态（如未登录，提示用户登录）
- 获取题目状态清单（已通过/未通过/未开始）
- 识别「未完成」的题目编号
- 创建/更新题目追踪文件 `issues/questions.csv`

**输出**：
- 未完成题目清单（题号、题目名称、难度预估）
- 用户登录状态确认

## Phase 2: 单题执行流程（对每道题迭代）

**对每道未完成的题目执行以下子阶段**：

### 2.1 目录创建
- 创建题目目录 `match_X/`（X 为题号）
- 初始化子目录结构：`config/`、`utils/`

### 2.2 接口侦察（chrome-devtool）
- 打开题目页面，读取题目要求
- 监听网络请求，识别主数据接口、前置接口、动态参数
- 记录 Cookie、Header、请求链路
- 输出侦察报告

### 2.3 静态分析（js-reverse）
- 搜索关键字符串（sign/token/md5/CryptoJS/encrypt）
- 格式化、去混淆、提取加密函数与依赖链
- 保存核心代码到 `config/encrypt.js`

### 2.4 动态验证（chrome-devtool）
- Hook XHR/fetch/document.cookie/关键加密函数
- 断点捕获真实入参、返回值、调用栈
- 验证环境校验项
- 评估纯 Node.js 可还原性

### 2.5 纯 Node.js 协议还原
- 编写 `main.js`、`utils/encrypt.js`、`utils/request.js`
- 使用 Node.js 原生 crypto 模块
- 配置外置（`config/keys.json`、`config/session.json`）
- 最小化环境补丁（如需要）

### 2.6 运行验证与交付
- 运行 `main.js` 采集所有页面数据
- 计算最终答案
- 生成 `README.md`
- 更新 `issues/questions.csv` 状态

## Phase 3: 进度追踪与优化

**目标**：建立跨题目的复用与追踪机制

- 更新 `issues/questions.csv` 追踪每道题的完成状态
- 识别可复用的加密模式（如多题使用相同的签名算法）
- 建立公共工具库 `common/`（如有复用价值）
- 定期同步当前进度到 issues CSV

## Phase 4: 最终交付

**目标**：汇总所有题目的答案与代码

- 汇总每道题的答案到 `issues/answers.md`
- 检查每道题目录结构完整性
- 生成整体执行报告

⚠️ 风险与注意事项

1. **登录态依赖**：部分题目需要登录态才能访问，需要确认用户已登录。如 Cookie 失效需中断并提示。
2. **反调试陷阱**：部分题目包含 debugger、console 重写等，需识别真实触发条件。
3. **环境检测**：如 canvas 指纹、navigator 属性等，需先验证是否参与服务端校验。
4. **频率限制**：采集过快可能触发限流，请求间需添加延时。
5. **动态后缀**：部分题目 JS 文件名或参数含动态后缀，需每次重新获取。
6. **跨会话执行**：题目较多时可能跨多个会话完成，需要良好的进度追踪。

📎 参考

- 题目平台：`https://match.yuanrenxue.cn/`
- 核心工具：js-reverse MCP、chrome-devtool MCP
- 现有计划：`plan/2026-03-27_17-25-47-yuanrenxue-reverse-workflow.md`
- 任务追踪：`issues/2026-03-27_17-29-12-yuanrenxue-reverse.csv`

🔄 下一步行动

**需要用户确认**：
1. 是否已有猿人学账号登录态？（如否，需要先登录）
2. 想从第几题开始做？（从第 1 题开始 / 指定题号 / 只做未通过的题）
3. 是否有特定的题目优先级？

确认后立即开始 Phase 1 执行。
