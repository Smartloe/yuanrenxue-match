(function () {
        const KEY = "yrx_console_welcome_v1";
        window.get_question_1_result = function () {
            return "yrx_console_welcome_v1"
        }
        // 你可以按站点主色（橙白）调整这些
        const styleTitle =
            "color:#fff;" +
            "background:linear-gradient(90deg,#ff7a00,#ffb100);" +
            "padding:10px 14px;" +
            "border-radius:12px;" +
            "font-weight:900;" +
            "font-size:14px;";

        const styleBadge =
            "color:#111;" +
            "background:#fff3e0;" +
            "padding:10px 12px;" +
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

        // 主 banner
        console.log("%c猿人学 · 新手试炼1 观气寻诀", styleTitle);
        console.log("%c✅ 恭喜你打开（Console）！", styleOk);

        // 小进度条（纯装饰）
        console.log("%c当前题目完成进度：▰▰▰▱▱  (3/5)", "color:#ff7a00;font-weight:900;");

        // 下一步指引
        console.log("%c下一步：在这里输入并回车", styleHint);
        console.log("%cget_question_1_result()", styleCode);

        // 规则提醒（不剧透）
        console.log(
            "%c返回值区分大小写；建议复制粘贴。",
            styleBox
        );

        // 折叠“高手小抄”
        console.groupCollapsed("%c（可选）小知识：快捷键与用法", styleLink);
        console.log("打开 DevTools：F12 / Ctrl + Shift + I");
        console.log("直达 Console：Ctrl + Shift + J");
        console.log("清空 Console：Ctrl + L");
        console.groupEnd();

    })();