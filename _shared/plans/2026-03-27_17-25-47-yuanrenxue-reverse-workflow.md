---
mode: plan
cwd: /Volumes/有庭树/PROJECTS/match_X
task: 猿人学 JS 逆向赛题解题流程
complexity: complex
planning_method: builtin
created_at: 2026-03-27T17:25:47
---

# Plan: 猿人学 JS 逆向赛题完整解题流程

🎯 任务概述

针对猿人学 `https://match.yuanrenxue.cn/` 的 JS 逆向题目，执行「侦察→静态分析→动态验证→协议还原→数据采集」的完整工作流，最终交付纯 Node.js 协议采集脚本与正确答案。当前等待用户提供具体题目 URL。

📋 执行计划

## Phase 0: 题目接收与目录创建（等待用户输入）

- 询问用户：**"请问要做哪道题？请发送题目 URL"**
- 收到 URL 后提取题号，创建对应目录（如 `match_1/` 或 `match_guide1/`）

## Phase 1: 题目侦察（chrome-devtool）

**目标**：识别真实接口链与校验项

- 用 chrome-devtool 打开题目页面，读取题目要求
- 监听所有网络请求，识别：
  - 主数据接口（返回题目所需数据的 API）
  - 前置接口（如获取 token/session 的请求）
  - 动态参数（sign/m/token 等）
- 记录请求链路、参数示例、Cookie、Header
- 输出侦察报告（题目信息、接口分析、响应样本）

## Phase 2: 静态分析（js-reverse）

**目标**：定位加密逻辑入口与依赖链

- 搜索关键字符串：参数名、sign、token、md5、CryptoJS、encrypt 等
- 使用 js-reverse 进行：
  - 代码格式化、去混淆、字符串还原
  - 提取加密函数与依赖链
  - 判断参数生成方式（是否绑定页码/时间戳/随机数）
- 保存核心加密代码到 `config/encrypt.js`
- 输出静态分析结论（加密入口、依赖链、请求/响应处理方式）

## Phase 3: 动态验证（chrome-devtool）

**目标**：验证加密逻辑与环境校验项

- Hook 关键对象：
  - XMLHttpRequest / fetch（捕获请求参数）
  - document.cookie（捕获 Cookie 生成）
  - 关键加密函数（捕获入参、返回值）
- 设置断点，捕获：
  - 真实加密入参与返回值
  - 调用栈与执行顺序
  - Cookie 生成链
- 多次请求对比，识别动态参数变化规律
- 验证环境校验项（navigator/screen/canvas 等）是否真正参与服务端校验
- 输出动态验证结论（纯 Node.js 可还原性评估）

## Phase 4: 纯 Node.js 协议还原

**目标**：编写不依赖浏览器的采集脚本

- 创建项目结构：
  ```
  match_X/
  ├── config/
  │   ├── encrypt.js    # 加密核心逻辑
  │   ├── keys.json     # 密钥/常量
  │   └── session.json  # Cookie/Token
  ├── utils/
  │   ├── encrypt.js    # 加密工具函数
  │   └── request.js    # 请求封装
  ├── main.js           # 主采集脚本
  └── README.md
  ```
- 编码原则：
  - 先跑通第 1 页，再扩展全部页
  - 优先使用 Node.js 原生 crypto 模块
  - 配置外置（>3 行的配置不硬编码）
  - 如需补环境：只补最小必需对象，并说明原因
- 输出可执行的 `main.js`

## Phase 5: 运行、验证、交付

**目标**：采集数据、计算答案、生成文档

- 运行 `main.js`，采集所有目标页面数据
- 计算最终答案（按题目要求求和/求平均值等）
- 生成 README.md，包含：
  - 题目信息与接口链路
  - 动态参数分析
  - 静态分析结论
  - 动态验证结论
  - 还原思路与中间值对比
  - 最终答案
- 输出最终交付报告

⚠️ 风险与注意事项

1. **登录态依赖**：部分题目需要猿人学账号登录态，可能导致采集失败。需要在用户 Cookie 失效时中断并提示。
2. **反调试陷阱**：部分题目包含 debugger、console 重写等反调试代码，需要识别真实触发条件，只还原校验相关部分。
3. **环境检测**：如 canvas 指纹、navigator 属性等，需先验证是否真正参与服务端校验，不盲目补全环境。
4. **频率限制**：采集过快可能触发限流，需在请求间添加适当延时。
5. **动态后缀**：部分题目的 JS 文件名或参数包含动态后缀，需在每次请求时重新获取。

📎 参考

- 题目平台：`https://match.yuanrenxue.cn/`
- 核心工具：js-reverse MCP、chrome-devtool MCP
- 用户规则：见 `<user_rules>` 中的详细规范
