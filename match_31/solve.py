#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
猿人学第31题 —— 纯后端求解器（无浏览器 / 无 Node / 无 CDP）

算法已在 tools/recover_algo.py 中从 WASM 完整还原：

    token = base64( AES-128-CBC( key="1234567890654321",
                                iv ="123456789O654321",       # 注意是大写字母 O
                                PKCS7( 明文 ) ) )

    明文 = "/api/question/31" + str(now) + "31" + "(kjskj)" + str(page) + "1"
           └── URL 路径 ──┘   └─ 毫秒时间戳 ─┘  └题号┘ └─ 固定标记 ─┘ └页码┘ └固定 1┘

请求：
    GET /api/question/31?page=P&pageSize=10&kw=&m=&token=<token>&now=<now>
      · token 与 (page, now) 强绑定，换任一个都 403 token failed
      · page 1..4 需普通浏览器 UA；page 5 需 User-Agent: yuanrenxue
      · 数据按 sessionid 生成，取数与提交需同一会话

用法：
    python3 solve.py                      # 只取数（写 docs/last_run_pure.json）
    python3 solve.py --submit             # 取数并提交（写 result.json）
    python3 solve.py --page 5             # 只取某一页（调试用）
    python3 solve.py --verify             # 顺带校验本地 result.json 的答案

依赖：requests、cryptography
"""
import argparse
import base64
import json
import os
import sys
import time

import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

HERE = os.path.dirname(os.path.abspath(__file__))
HOST = "https://match.yuanrenxue.cn"
QID = 31

# ── 从 WASM 还原出的算法常量 ────────────────────────────────────────────────
KEY = b"1234567890654321"
IV = b"123456789O654321"          # 第 10 个字符是大写字母 O(0x4f)，不是数字 0
PREFIX = "/api/question/31"       # 被加密的路径
MARKER = "(kjskj)"                # 固定标记

UA_BROWSER = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")
UA_YRX = "yuanrenxue"


def gen_token(page, now):
    """按还原出的明文格式生成 token（页 1..5 通用）"""
    pt = f"{PREFIX}{now}{QID}{MARKER}{page}1".encode()
    pad = 16 - len(pt) % 16
    pt += bytes([pad]) * pad                       # PKCS#7
    enc = Cipher(algorithms.AES(KEY), modes.CBC(IV)).encryptor()
    return base64.b64encode(enc.update(pt) + enc.finalize()).decode()


def make_session(sessionid):
    s = requests.Session()
    s.cookies.set("sessionid", sessionid, domain="match.yuanrenxue.cn")
    s.headers.update({
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": f"{HOST}/match/{QID}",
        "X-Requested-With": "XMLHttpRequest",
    })
    return s


def fetch_page(session, page, ua=None):
    """取一页数据；page=5 会自动用 yuanrenxue 的 UA"""
    now = int(time.time() * 1000)
    params = {"page": page, "pageSize": 10, "kw": "", "m": "",
              "token": gen_token(page, now), "now": now}
    r = session.get(f"{HOST}/api/question/{QID}", params=params,
                    headers={"User-Agent": ua or (UA_YRX if page == 5 else UA_BROWSER)},
                    timeout=15)
    try:
        return r.status_code, json.loads(r.text)
    except ValueError:
        return r.status_code, {"raw": r.text}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submit", action="store_true", help="取数后提交答案")
    ap.add_argument("--page", type=int, help="只取指定页")
    ap.add_argument("--verify", action="store_true", help="与 result.json 中的答案比对")
    ap.add_argument("--session", default=None, help="指定 sessionid（默认读 config/session.json）")
    args = ap.parse_args()

    sessionid = args.session
    if not sessionid:
        cfg = json.load(open(os.path.join(HERE, "config/session.json"), encoding="utf-8"))
        sessionid = cfg["sessionid"]
    session = make_session(sessionid)

    if args.page:
        st, body = fetch_page(session, args.page)
        print(f"page {args.page}: HTTP {st} {json.dumps(body, ensure_ascii=False)[:200]}")
        return 0

    pages, ok = {}, True
    for p in range(1, 6):
        st, body = fetch_page(session, p)
        data = body.get("data") if isinstance(body, dict) else None
        nums = [n for n in (data or []) if isinstance(n, int)]
        pages[p] = nums
        flag = "✓" if (st == 200 and len(nums) == 10) else "✗"
        print(f"  [{flag}] page {p}: HTTP {st} {nums if nums else body}")
        ok &= (st == 200 and len(nums) == 10)

    flat = [n for p in range(1, 6) for n in pages[p]]
    total = sum(flat)
    print(f"\n[*] 共 {len(flat)} 个数，合计 = {total}")

    out = {"question": str(QID), "pages": [pages[p] for p in range(1, 6)],
           "total": total, "count": len(flat), "at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}

    if args.verify:
        ref = json.load(open(os.path.join(HERE, "result.json"), encoding="utf-8"))
        same = ref.get("total") == total
        print(f"[*] 与 result.json 记录答案比对: {'✓ 一致' if same else '✗ 不一致'} "
              f"(记录 {ref.get('total')})")

    if not ok:
        print("[-] 数据不完整，拒绝提交")
        return 1

    if args.submit:
        r = session.post(f"{HOST}/a/{QID}",
                         headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                                  "User-Agent": UA_YRX},
                         data={"answer": str(total)}, timeout=15)
        print(f"[*] 提交 → HTTP {r.status_code} {r.text}")
        try:
            out["response"] = json.loads(r.text)
        except ValueError:
            out["raw"] = r.text
        json.dump(out, open(os.path.join(HERE, "result.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
    else:
        os.makedirs(os.path.join(HERE, "docs"), exist_ok=True)
        json.dump(out, open(os.path.join(HERE, "docs/last_run_pure.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
