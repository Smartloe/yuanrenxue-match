/**
   * Debugger 迎新彩蛋（修仙风）
   * - 不直接暴露答案：函数仅在暂停调试的作用域中可见
   * - 玩家需要单步执行（F10）若干次，直到 get_question_3_result 变为函数
   */
  (function () {
    // 只打印一次（可选）
    const ONCE_KEY = "yrx_q3_debug_welcome_v1";
    try {
      if (localStorage.getItem(ONCE_KEY) === "1") {
        // 即使不重复打印，debugger 仍然要触发（题目机制）
      } else {
        localStorage.setItem(ONCE_KEY, "1");
      }
    } catch (e) {}

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

    const styleLink = "color:#ff7a00;font-weight:900;";

    // banner（先打出来，再断点）
    console.log("%c猿人学 · 序章3 点亮灵根（单步试炼）", styleTitle);
    console.log("%c✅ 你已进入“经文运行态”：答案不在页面上，在作用域里。", styleOk);
    console.log("%c下一步：Sources → 刷新页面（F5） → 停在 debugger → 连续 F10 单步", styleHint);
    console.log("%c观察 Scope：直到出现 get_question_3_result 是一个函数为止", styleHint);
    console.log("%c然后在 Console 输入：", styleHint);
    console.log("%cget_question_3_result(\"yrx_No.1\")", styleCode);
    console.log("%c复制返回值提交。", styleBox);

    console.groupCollapsed("%c（可选）小知识：单步快捷键", styleLink);
    console.log("F10：Step over（本题推荐） 遇到函数不会追进去，只会正常向下走");
    console.log("F11：Step into 遇到函数不会追进去，会进到函数里面观测");
    console.log("Shift + F11：Step out 从某个函数里面【跳出去】");
    console.log("Scope 面板：看 Local / Block / Closure 等变量变化，可以有效帮助逆向哦~");
    console.groupEnd();

    // ====== 题目核心：debugger + 逐步显露函数 ======
    ;(function n(t,r,i,e,u,l,o,c){var f,a,s,h,g,p,m,v,y,d,C,w,S,b,j,k,q,x,z,A,B,D,E,F,G,H,I;if(this.constructor!=n){if(e||((e=[this]).n=e[0],e.t=[],I={s:!1,v:!1},e.t.push(I),n.r=n.g=n),a=e[e.length-1],-3==i||-2==i){if(-2==i){for(l=0,o=0;t[r]>127;)o+=t[r++]-128<<7*l++;o+=t[r++]<<7*l}else o=(r=(s=n(t,r,-2)).i)+(l=s.n)-1,r+=l;return{n:o,i:r}}if(u===n){for(h=new n.g,g=[].slice.call(c),p=0;p<l.length;p++)h[l[p]]=g[p];return h.arguments=c,(m=[].concat(e).concat(h)).n=o,m.t=[],n(t,r,i,m)}return v=r||0,f=i||t.length,y=t[v++],J(),d=0,82==y||51==y?d=1:12==y?d=2:110==y&&(d=3),82==y||51==y||12==y||110==y?function(){for(var r,i,u=e.t&&e.t[e.t.length-1],l=[];v<f;){if(r=K(),i=L(),l.push(n(t,r,i,e)),3!=d&&e.a)return l[l.length-1];if(2==d&&u&&(u.v||u.s))return l[l.length-1]}if(2!=d)return l}():44==y||66==y?(e.m=!0,C=n(t,K(),L(),e),w=n(t,K(),L(),e),e.m=!1,S=K(),b=L(),j=function(){return n(t,S,b,e,n,w,this,arguments)},C&&(a[C]=j),j):125==y||59==y?(k=t[v++],q=function(){var n,t,r=J(),i=[];for(n=0;n<r;n++)t=J(),i.push(t);return String.fromCharCode.apply(null,i)}(),59==y||e.m?q:u?[e[k],q]:e[k][q]):105==y?n(t,K(),L(),e):60==y?l?++o[0][o[1]]:o[0][o[1]]++:30==y?l>=o:91==y?l*o:3==y?n(t,K(),L(),e,0,n(t,K(),L(),e),n(t,K(),L(),e)):7==y?l&o:121==y?(e.m=!0,x=n(t,K(),L(),e),e.m=!1,z=n(t,K(),L(),e),a[x]=z,e.e?[a,x]:void 0):111==y?l+o:79==y?l!==o:5==y?(A=n(t,K(),L(),e),B=n(t,K(),L(),e),e.m=!A,D=n(t,K(),L(),e),e.m=!1,u?[B,D]:B[D]):58==y?n(t,K(),L(),e)?n(t,K(),L(),e):(K(),L(),n(t,K(),L(),e)):126==y?null:80==y?l^o:19==y?(E=n(t,K(),L(),e,!0),F=n(t,K(),L(),e),E instanceof n.constructor?n.apply.call(E,e[0].n,F):(G=E[0][E[1]],E[0]instanceof n.g?n.apply.call(G,e.n,F):n.apply.call(G,E[0],F))):54==y?(20==t[v++]&&(H=t[v++]),H):67==y?n(t,K(),L(),e,0,n(t,K(),L(),e),n(t,K(),L(),e,!0)):42==y?(e.a=!0,n(t,K(),L(),e)):void 0}function J(){return s=n(t,v,-2),v=s.i,s.n}function K(){return v++}function L(){return s=n(t,v,-3),v=s.i,s.n}})([82,235,3,51,232,3,44,146,3,125,9,0,7,98,114,101,97,116,104,101,110,0,12,130,3,12,255,2,105,16,67,14,60,0,54,2,20,0,125,6,0,4,116,105,99,107,12,33,12,31,121,29,125,3,1,1,97,3,22,80,0,3,14,91,0,125,6,0,4,116,105,99,107,54,2,20,13,54,2,20,90,12,30,12,28,121,26,125,3,1,1,98,3,19,7,0,3,11,111,0,125,3,1,1,97,54,2,20,17,54,2,20,255,58,160,2,3,14,30,0,125,6,0,4,116,105,99,107,54,2,20,11,12,139,2,12,136,2,12,47,12,45,121,43,125,5,1,3,101,110,99,59,34,0,32,77,88,90,102,90,71,86,117,90,87,116,104,100,50,70,102,98,109,86,110,90,50,53,112,98,70,57,52,99,110,107,61,42,212,1,66,209,1,125,23,1,21,103,101,116,95,113,117,101,115,116,105,111,110,95,51,95,114,101,115,117,108,116,110,7,125,5,2,3,97,114,103,12,172,1,12,169,1,58,60,3,23,79,0,125,5,2,3,97,114,103,125,12,0,10,69,88,80,69,67,84,95,65,82,71,42,31,59,29,0,9,245,224,1,185,208,1,170,206,1,136,168,1,154,254,3,194,167,1,240,202,1,141,156,1,166,246,1,126,0,12,30,12,28,121,26,125,5,2,3,114,97,119,19,17,125,6,0,4,97,116,111,98,110,7,125,5,1,3,101,110,99,42,73,19,71,5,63,54,2,20,0,19,49,5,45,54,2,20,0,19,28,5,20,54,2,20,0,125,5,2,3,114,97,119,125,7,0,5,115,112,108,105,116,110,4,59,2,0,0,125,9,0,7,114,101,118,101,114,115,101,110,0,125,6,0,4,106,111,105,110,110,4,59,2,0,0,126,0,42,5,125,3,1,1,98,12,16,12,14,121,12,125,6,0,4,116,105,99,107,54,2,20,0,12,31,12,29,121,27,125,23,0,21,103,101,116,95,113,117,101,115,116,105,111,110,95,51,95,114,101,115,117,108,116,126,0,12,30,12,28,121,26,125,12,0,10,69,88,80,69,67,84,95,65,82,71,59,10,0,8,121,114,120,95,78,111,46,49]);

    // 只有一个 debugger 关键词（断点在此）
    debugger;

    // 单步执行（F10）会逐行运行这些语句：tick 逐渐增加，直到 tick===11 时点亮函数
    let get_question_3_result = breathe()
    get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
      get_question_3_result = breathe()
  })();