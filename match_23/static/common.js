function checkWxStatus(uuid, timer) {
    $.ajax({
        url: '/api/checkWxStatus?uuid=' + uuid,
        method: 'GET',
        success: function (data) {
            if (data.success) {
                clearInterval(timer)
                successAlert("登录成功！欢迎回来", 2)
                $(".bg").hide();
                
                $(".benefit-modal .close, .benefit-modal .btn-primary").on("click", function () {
                    $(".benefit-modal").fadeOut(200);
                    localStorage.setItem("hideBenefitQr", "1");
                });
                let insert_html = `<div class="benefit-modal">
                  <div class="benefit-card">
                    <span class="close" onclick="location.reload()">×</span>
                 
                    <h3>🎁 登录福利</h3>
                    <p>
                      扫码加入反混淆交流群<br>
                      掌握最新题目发布信息<br>
                      获取比赛题解 PDF 等（可选）
                    </p>
                
                    <img src="/static/new_match/images/wechat-group.png" />
                
                    <button class="btn-primary" onclick="location.reload()">我知道了</button>
                  </div>
                </div>`

                setTimeout(function (){
                    $('body').append(insert_html)
                    $('#benefit-modal').show()
                    $(".benefit-modal").addClass("show");
                    $(".close, .btn-primary").click(function (){
                        $(".benefit-modal").hide();
                    });
                }, 2000)
                check_login()

            } else if (data.status === "EXPIRED OR CONSUMED") {
                clearInterval(timer)
                failedAlert("登录失败, 二维码过期")
            }
        }
    })
}

function check_login(){
    $.ajax({
    url: '/api/user',
    dataType: 'json',
    success: function (data) {
        if (data.isLogin) {
            $('.login-btn').css('display', 'none')
            $('.isLogin').css('display', 'block')
            $('.user-name').prepend(document.createTextNode(data.nickname))
            $('.user-logo').css({
                display: 'block',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundImage: 'url("' + data.avatar + '")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            });
        }
    },
    error: function (xhr, status, err) {
    }
});
    $(function () {
        // 点击头像：切换显示
        $('.user-menu-wrap').on('click', function (e) {
            e.stopPropagation(); // 防止触发 document 点击导致立刻关闭
            $('.user-dropdown').toggle();
        });
        // 点击菜单内部：不关闭（除非点了具体项）
        $('.user-dropdown').on('click', function (e) {
            e.stopPropagation();
        });
        // 点击页面其他地方：关闭所有下拉
        $(document).on('click', function () {
            $('.user-dropdown').hide();
        });
        // 登出：你可以跳转到登出接口，或用 ajax 调接口
        $('.js-logout').on('click', function () {
            // 方式A：直接跳转登出 URL（推荐最简单）
            window.location.href = '/logout';
        });
    });
    typeof load_user_info === "function" && load_user_info()
}
// bannerLoginBtn
// 登录逻辑

// 轮询定时器句柄。原来每点一次登录就新建一个 setInterval 且从不清理，
// 连点或关掉弹窗后旧定时器照样每秒打一次 checkWxStatus 直到 180 秒跑满，
// 这里统一收口，开新二维码和关弹窗时都先停掉上一个。
let qrTimer = null;

function stopQrPolling() {
    if (qrTimer) {
        clearInterval(qrTimer);
        qrTimer = null;
    }
}

// 二维码区域的状态渲染。原来这里只有「成功」一条路径，任何失败都是静默空白，
// 用户看到的和我们查到的都是「什么都没有」——线上排查最耗时的就是这一点，
// 所以失败态必须自己说出原因。
function renderQrMessage(html) {
    $('#login_container').html(
        '<div class="qr-msg" style="width:200px;min-height:200px;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'margin:0 auto;padding:10px;font-size:13px;line-height:1.8;color:#666;' +
        'text-align:center;border:1px dashed #d0d0d0;border-radius:6px;">' + html + '</div>'
    );
}

function loadLoginQRCode() {
    stopQrPolling();
    renderQrMessage('二维码加载中…');

    $.ajax({
        url: '/api/getQRCode?scene=match',
        method: 'GET',
        timeout: 15000,
        success: function (data) {
            if (!data || !data.success || !data.ticket) {
                renderQrMessage('二维码获取失败<br><a href="javascript:void(0)" class="qr-retry">点击重试</a>');
                return;
            }

            // 微信文档要求 ticket 使用前做 UrlEncode。当前 ticket 实测是 URL-safe base64，
            // 不编码也能用，但这是微信那边的实现细节、不是接口契约，按文档编码更稳。
            const src = 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=' + encodeURIComponent(data.ticket);
            const $img = $('<img>', {alt: '微信登录二维码'}).css({width: '200px', height: '200px'});

            // error 必须在设置 src 之前绑定，否则命中缓存的失败图片可能在绑定前就已触发
            $img.on('error', function () {
                renderQrMessage(
                    '二维码图片没能加载出来<br>常见原因是广告拦截插件或网络限制<br>' +
                    '<a href="' + src + '" target="_blank" rel="noopener">直接打开二维码图片</a><br>' +
                    '<a href="javascript:void(0)" class="qr-retry">重试</a>'
                );
            });
            $img.attr('src', src);
            $('#login_container').empty().append($img);

            // 启动定时器，调用登录信息
            let count = 0;
            const maxCount = 180;

            qrTimer = setInterval(() => {
                count += 1;
                checkWxStatus(data.uuid, qrTimer);
                if (count >= maxCount) {
                    stopQrPolling();
                    renderQrMessage('二维码已过期<br><a href="javascript:void(0)" class="qr-retry">点击刷新</a>');
                }
            }, 1000);
        },
        error: function (xhr, status) {
            const reason = (status === 'timeout') ? '请求超时' : ('服务异常 ' + (xhr.status || ''));
            renderQrMessage(reason + '<br><a href="javascript:void(0)" class="qr-retry">点击重试</a>');
        }
    });
}

$(".login-btn, #bannerLoginBtn").click(function () {
    $(".bg").css("display", "block")
    $(".wx-login").css("display", "block")
    $(".wx-login-no-account").css("display", "none")
    $(".register").css("display", "none")
    $(".bind-old-account").css("display", "none")
    $(".login-box").css("height", "400px")

    loadLoginQRCode()
})

// 重试链接是动态渲染出来的，必须用事件委托，不能直接 bind
$(document).on('click', '.qr-retry', function () {
    loadLoginQRCode()
})

$(".close").click(function () {
    stopQrPolling()
    $(".bg").css("display", "none")
})
check_login()