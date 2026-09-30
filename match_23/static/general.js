$.ajax({
    url: '/api/topic_info?href=' + location.href.split("/").at(-1),
    method: 'GET',
    success: function (data){
        let difficultyMap = ["新手引导", "非常简单", "简单", "中等", "困难", "非常困难",]
        var difficultyClassMap = ["guide", "very-easy", "easy", "medium", "difficult", "very-difficult"];

        $('#topic-title').text(data.title);
        $("#metaDifficulty").siblings('span').text("难度分值")
        $('#metaDifficulty').text(data.difficulty_score);
        $('#metaScore').text(data.exp);
        $('#metaType').text(data.category);

        $('#metaTags').html(`
          <span class="${difficultyClassMap[data.difficulty]}">${difficultyMap[data.difficulty]}</span>
          <span class="guide">${data.category}</span>
        `);
    },
    error:function (){
        failedAlert("题目读取失败~ 如看到该提示请联系群内管理员！")
        // setTimeout(() => {
        //   window.location.href = "/";
        // }, 2000);
    }
})