function submit() {
        $.ajax({
            url: '/a/guide5',
            method: 'POST',
            data: {answer: $("#answer").val()},
            success: function (data) {
                if (data.code === 2) {

                    // 通关成功，取 exp 接口
                    $.ajax({
                        url: '/api/userExp',
                        dataType: 'json',
                        success: function (userExp_data) {
                            expUpAlert("恭喜通关！！！", {
                                totalExp: userExp_data.real_exp - data.exp,
                                gainExp: data.exp,
                                subtitle: "通关成功，修为获得微量精进。",
                                breakthroughKey: null,
                                unlockedGateMaxKey: userExp_data.breakthrough_tier,
                                autoCloseMs: 240000
                            });
                        }
                    })


                    // setTimeout(() => {
                    //   window.location.href = '/' ;
                    // }, 2000);
                } else if (data.code === 1) {
                    successAlert("您已做过这道题了~ 请勿重复通关")
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 2000);
                } else {
                    failedAlert("答案错误~ 请重新尝试哦")
                }
            },
            error: function () {
                failedAlert("请登录后再提交答案吧~")
            }
        })
    }