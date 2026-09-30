(function () {

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

        const styleBox =
            "color:#6b3b00;" +
            "background:rgba(255,247,230,1);" +
            "border:1px solid rgba(255,122,0,.25);" +
            "padding:10px 12px;" +
            "border-radius:12px;" +
            "line-height:1.7;";

        console.log("%c猿人学 · 新手试炼6 练气初成（密钥与向量）", styleTitle);
        console.log("%c✅ 阵法已启：页面会向 /api/user 发起一次加密请求。", styleOk);
        console.log("%c key 与 iv 请使用调试技巧自行寻找与猜测", styleHint);
        console.log("%c提示：可以在 Network 观察 /api/user 的 POST 痕迹。", styleBox);

        function aesEncryptToB64_CryptoJS(plainText) {
            if (!window.CryptoJS) throw new Error("CryptoJS not loaded");
            const key = CryptoJS.enc.Utf8.parse("yrx_aes_key_v6!0");
            const iv = CryptoJS.enc.Utf8.parse("yrx_aes_iv__v6_0");
            const encrypted = CryptoJS.AES.encrypt(plainText, key, {
                iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            // 注意：CryptoJS.AES.encrypt 返回对象，ciphertext 才是纯密文
            return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
        }

        function postEncryptedUser() {
            // 你可以按需改 payload 字段
            const payload = {
                ts: Date.now(),
                nonce: Math.random().toString(16).slice(2),
                action: "cultivate",
                scene: "guide6"
            };

            const cipherB64 = aesEncryptToB64_CryptoJS(JSON.stringify(payload));

            // 向 /api/user 发起 POST（用于 Network 留痕）
            return $.ajax({
                url: "/api/user",
                method: "POST",
                data: {
                    cipher: cipherB64,
                    ts: payload.ts
                },
                success: function () {
                    console.log("%c✅ /api/user 加密请求已发出。", styleOk)
                },
                error: function () {
                    console.log("%c⚠️ 加密请求未完成（接口可能未就绪）： ", styleBox)
                }
            });
        }

        // 建议：玩家先开 DevTools 再刷新；这里延迟触发一次请求
        setTimeout(() => {
            postEncryptedUser()
        }, 250);
    })();