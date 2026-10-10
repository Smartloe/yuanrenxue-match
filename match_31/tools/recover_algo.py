#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
猿人学第31题 —— 从 WASM 自动还原 token 算法（证明 key/IV/明文格式的来源）

本题的"算法混淆"手法：WASM 把 AES 的 20 个常量挖空，改由 36 个 JS 导入函数
(js.K0..K19 / js.E0..E15) 在运行时喂进来 —— 所以直接跑 WASM 会算出错误结果。

本脚本用"扰动定位"自动找出这些空洞，填入标准常量后让 WASM 还原成标准
AES-128-CBC，再自动推导 key 与 IV，最后用真实抓到的 token 做确定性校验。

    python3 tools/recover_algo.py

依赖：wasmtime、cryptography
"""
import base64
import json
import os
import re
import sys

try:
    import wasmtime
except ImportError:
    sys.exit("请先安装 wasmtime:  pip install wasmtime")

try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
except ImportError:
    sys.exit("请先安装 cryptography:  pip install cryptography")

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.dirname(HERE)
WASM = os.path.join(DIR, "wasm", "31.wasm")
JS = os.path.join(DIR, "docs", "31.js")

# 标准 AES 参照表（仅作为"标准答案参照"，不是从题目里抠出来的）
STD_SBOX = bytes.fromhex(
    "637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0"
    "b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275"
    "09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cf"
    "d0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2"
    "cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdb"
    "e0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08"
    "ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9e"
    "e1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16")
STD_RCON = bytes([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36])

# 参照内存镜像：S-box 在 0x20，Rcon 在 0x120（由扰动实验确认的布局）
REF = bytearray(0x400)
REF[0x20:0x120] = STD_SBOX
REF[0x120:0x12a] = STD_RCON


def aes128_expand(key):
    """标准 AES-128 密钥扩展，用于校验 WASM 里的轮密钥"""
    w = [list(key[i * 4:i * 4 + 4]) for i in range(4)]
    for i in range(4, 44):
        t = w[i - 1][:]
        if i % 4 == 0:
            t = t[1:] + t[:1]
            t = [STD_SBOX[b] for b in t]
            t[0] ^= STD_RCON[i // 4 - 1]
        w.append([w[i - 4][j] ^ t[j] for j in range(4)])
    return bytes(b for word in w for b in word)


def load_wasm():
    if not os.path.exists(WASM):
        src = open(JS, encoding="utf-8", errors="replace").read()
        m = re.search(r'WASM_B64\s*=\s*"([^"]+)"', src)
        if not m:
            sys.exit("未找到 WASM_B64，且 wasm/31.wasm 不存在")
        os.makedirs(os.path.dirname(WASM), exist_ok=True)
        open(WASM, "wb").write(base64.b64decode(m.group(1)))
        print(f"[+] 已从 31.js 提取 WASM → {WASM}")
    return open(WASM, "rb").read()


class Wasm:
    def __init__(self, blob):
        self.engine = wasmtime.Engine()
        self.module = wasmtime.Module(self.engine, blob)

    def run(self, values=None, plain=None):
        """values: {导入序号: 返回值}；plain 不为空则调用 encrypt 并把内存快照拷回"""
        values = values or {}
        store = wasmtime.Store(self.engine)
        fns = []
        for idx in range(36):
            v = values.get(idx, 0)
            fns.append(wasmtime.Func(
                store, wasmtime.FuncType([], [wasmtime.ValType.i32()]),
                (lambda v=v: (lambda: v))()))
        inst = wasmtime.Instance(store, self.module, fns)
        ex = inst.exports(store)
        ex["aes_init"](store)
        mem = ex["memory"].data_ptr(store)
        ret = None
        if plain is not None:
            for i, b in enumerate(plain):
                mem[0x1000 + i] = b
            ret = ex["encrypt"](store, 0x1000, len(plain), 0x2000)
        snap = bytes(mem[0:0x4000])          # 必须在 store 存活期内拷贝
        out = bytes(mem[0x2000:0x2000 + ret]) if ret else b""
        return snap, out


def aes_dec_ecb(key, block):
    d = Cipher(algorithms.AES(key), modes.ECB()).decryptor()
    return d.update(block) + d.finalize()


def main():
    blob = load_wasm()
    w = Wasm(blob)
    name = lambda i: ("K%d" % i) if i < 20 else ("E%d" % (i - 20))

    # ── 1. 基线 + 扰动定位 ────────────────────────────────────────────────
    base, _ = w.run()
    print("\n=== 1. 扰动定位：找出被 JS 导入函数挖空的常量位置 ===")
    holes = {}
    for idx in range(36):
        got, _ = w.run({idx: 0xAA})
        changed = [o for o in range(len(base)) if got[o] != base[o]]
        # K 系列只有 1~3 处变化，其中第一处就是它负责填的那个空洞
        if idx < 20 and changed:
            holes[idx] = changed[0]
    for idx in sorted(holes):
        off = holes[idx]
        zone = "S-box" if 0x20 <= off < 0x120 else ("Rcon" if 0x120 <= off < 0x12a else "?")
        print(f"  {name(idx):>4} → 0x{off:03x}  标准值=0x{REF[off]:02x}  ({zone})")

    sbox_holes = sum(1 for o in holes.values() if 0x20 <= o < 0x120)
    rcon_holes = sum(1 for o in holes.values() if 0x120 <= o < 0x12a)
    print(f"  ⇒ 共 {len(holes)} 个空洞：S-box {sbox_holes} 个 + Rcon {rcon_holes} 个")

    # ── 2. 填入标准常量，验证是否还原成标准 AES 表 ────────────────────────
    print("\n=== 2. 填入标准常量，让 WASM 还原成标准 AES ===")
    fixed = {i: REF[off] for i, off in holes.items()}
    snap, _ = w.run(fixed)
    sbox_ok = bytes(snap[0x20:0x120]) == STD_SBOX
    rcon_ok = bytes(snap[0x120:0x12a]) == STD_RCON
    print(f"  S-box 与标准一致 : {'✓' if sbox_ok else '✗'}")
    print(f"  Rcon  与标准一致 : {'✓' if rcon_ok else '✗'}")

    # ── 3. 从内存里取出密钥，并用密钥扩展自校验 ──────────────────────────
    print("\n=== 3. 推导密钥 key ===")
    ks_off = 0x12a                      # 轮密钥紧随 Rcon 之后
    ks = bytes(snap[ks_off:ks_off + 176])
    key = ks[:16]
    expand_ok = aes128_expand(key) == ks
    print(f"  内存 0x{ks_off:x} 处的 176 字节轮密钥，首 16 字节 = {key!r}")
    print(f"  与标准 AES-128 密钥扩展比对 : {'✓ 完全一致' if expand_ok else '✗'}")
    print(f"  ⇒ key = {key.decode()}")

    # ── 4. 用一次加密反推 IV，并用 PKCS#7 自校验 ─────────────────────────
    print("\n=== 4. 推导 IV 并判定分组模式 ===")
    _, out = w.run(fixed, plain=b"\x00" * 16)
    ct = base64.b64decode(out)
    c1, c2 = ct[:16], ct[16:]
    pad_block = bytes(a ^ b for a, b in zip(aes_dec_ecb(key, c2), c1))
    cbc_ok = pad_block == b"\x10" * 16
    print(f"  WASM 加密 16 个 0x00 → {out.decode()}")
    print(f"  D(C2) XOR C1 = {pad_block.hex()}  (期望 PKCS#7 填充 {(b'\x10' * 16).hex()})")
    print(f"  ⇒ 分组模式 : {'✓ 标准 AES-128-CBC + PKCS#7，输出 base64 文本' if cbc_ok else '✗ 非标准 CBC'}")
    iv = aes_dec_ecb(key, c1)
    print(f"  ⇒ IV = {iv.hex()}  ({iv.decode('latin1')})")

    # 用 Python 独立复现 WASM 的这次加密，交叉验证（注意 cryptography 是裸分组模式，需自己补 PKCS#7）
    padded = b"\x00" * 16 + b"\x10" * 16
    e = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    mine = base64.b64encode(e.update(padded) + e.finalize()).decode()
    print(f"  Python 独立复现          → {mine}")
    print(f"  与 WASM 输出一致 : {'✓' if mine == out.decode() else '✗'}")

    # ── 5. 用真实抓到的 token 做确定性校验 ───────────────────────────────
    print("\n=== 5. 确定性校验：用真实 token 反解明文格式 ===")
    tok_path = os.path.join(DIR, "docs", "tokens.json")
    samples = []
    if os.path.exists(tok_path):
        t = json.load(open(tok_path, encoding="utf-8"))
        for item in t.values():
            if isinstance(item, dict) and item.get("dbg"):
                m = re.search(r"page=(\d+).*?token=([^&]+)&now=(\d+)", item["dbg"])
                if m:
                    samples.append((int(m.group(1)), int(m.group(3)),
                                    requests_unquote(m.group(2))))
    if not samples:
        print("  (未找到 docs/tokens.json 样本，跳过)")
        return 0

    for page, now, tok in samples:
        d = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
        pt = d.update(base64.b64decode(tok)) + d.finalize()
        pad = pt[-1]
        body = pt[:-pad] if 0 < pad <= 16 else pt
        print(f"  page={page} now={now} → 明文 {body!r}")

    print("\n  明文结构 = '/api/question/31' + str(now) + '31' + '(kjskj)' + str(page) + '1'")

    # 反向生成并与真实 token 逐一比对
    print("\n=== 6. 反向生成 token 与真实值比对 ===")
    allok = True
    for page, now, tok in samples:
        pt = f"/api/question/31{now}31(kjskj){page}1".encode()
        pad = 16 - len(pt) % 16
        pt += bytes([pad]) * pad
        e = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
        mine = base64.b64encode(e.update(pt) + e.finalize()).decode()
        ok = mine == tok
        allok &= ok
        print(f"  page={page} now={now}: {'✓ 完全一致' if ok else '✗ 不一致'}")
    print(f"\n[*] 结论：{'算法已完全还原，可脱离浏览器生成 token' if allok else '仍有偏差'}")

    # ── 7. E 系列导入是否影响最终密文 ────────────────────────────────────
    print("\n=== 7. 附：E 系列导入函数的作用 ===")
    _, out_e0 = w.run(fixed, plain=b"\x00" * 16)
    snap_eaa, out_eaa = w.run({**fixed, **{20 + i: 0xAA for i in range(16)}}, plain=b"\x00" * 16)
    print(f"  E 全 0   → 密文 {out_e0.decode()}")
    print(f"  E 全 AA  → 密文 {out_eaa.decode()}")
    print(f"  E 全 AA 时 S-box 仍为标准值 : "
          f"{'✓ 是' if bytes(snap_eaa[0x20:0x120]) == STD_SBOX else '✗ 否（表被污染）'}")
    print("  ⇒ E 系列把返回值掺进表/状态里做干扰；真实环境下其取值使结果恰好等价于标准 AES")
    print("     （第 6 步已用纯 Python 标准 AES 逐字节复现真实 token，可反证这一点）")
    return 0


def requests_unquote(s):
    from urllib.parse import unquote
    return unquote(s)


if __name__ == "__main__":
    sys.exit(main())
