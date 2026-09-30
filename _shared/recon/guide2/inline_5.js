(function () {
    // 你可以按站点主色（橙白）调整这些
    const styleTitle =
      "color:#fff;" +
      "background:linear-gradient(90deg,#ff7a00,#ffb100);" +
      "padding:10px 14px;" +
      "border-radius:12px;" +
      "font-weight:900;" +
      "font-size:14px;";

    const styleOk =
      "color:#2ea043;" +
      "font-weight:900;" +
      "font-size:12px;";

    const styleHint =
      "color:#333;" +
      "font-weight:800;";

    const styleCode =
      "color:#111;" +
      "background:#f6f7f9;" +
      "padding:2px 8px;" +
      "border-radius:8px;" +
      "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;" +
      "font-weight:800;";

    const styleBox =
      "color:#6b3b00;" +
      "background:rgba(255,247,230,1);" +
      "border:1px solid rgba(255,122,0,.25);" +
      "padding:10px 12px;" +
      "border-radius:12px;" +
      "line-height:1.7;";

    const styleLink =
      "color:#ff7a00;font-weight:900;";

    const styleWarn =
      "color:#b42318;" +
      "font-weight:900;" +
      "font-size:12px;";

    // 主 banner
    console.log("%c猿人学 · 引气入体（Network 试炼）", styleTitle);
    console.log("%c✅ 你已开识：看得见“气机流转”了。", styleOk);

    // 小进度条（纯装饰）
    console.log("%c当前试炼进度：▰▰▱▱▱  (2/5)", "color:#ff7a00;font-weight:900;");

    // 核心指引：Network -> /api/user
    console.log("%c下一步：去 Network(网络)选项卡 里抓住这道“流转”", styleHint);
    console.log("%c/api/user", styleCode);

    // 如何找（不啰嗦、不剧透）
    console.log(
      "%c在该请求的参数里，取回入体印记：sign",
      styleBox,
    );

    // 规则提醒（不剧透）
    console.log(
      "%c提醒：sign 区分大小写；建议复制粘贴。叩关勿急，频繁提交会触发禁制。",
      styleBox
    );

    // 折叠“高手小抄”
    console.groupCollapsed("%c（可选）小知识：快速定位请求", styleLink);
    console.log("打开 DevTools：F12 / Ctrl + Shift + I");
    console.log("切到 Network：Ctrl + Shift + E（部分浏览器支持）");
    console.log("刷新触发请求：Ctrl + R / Ctrl + Shift + R（强刷）/ F5 / Ctrl + F5（强刷）");
    console.log("筛选 Fetch/XHR：Network 顶部过滤器（Fetch/XHR）");
    console.log("查看参数位置：Headers → Query String / Form Data / Payload（视实现而定）");
    console.groupEnd();

    // 轻微“防误解”提示：别去猜答案
    console.log("%c⚠️ 不要猜：答案就在POST请求 /api/user 的 sign 里。(有两个/api/user请求哦，要找准那个 POST 请求)", styleWarn);
  })();

  $.ajax({
            url: '/api/user',
            method: 'POST',
            data: {sign: "yrx_network_welcome_v2_d33039f3fcbb267de77fb5df3a997960"},
            success: function (data){},
            error:function (){}
        })