#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
猿人学第31题 —— WASM 结构分析工具

从 docs/31.js 里把 base64 的 WASM 提取出来（写到 wasm/31.wasm），
然后纯 Python 解析它的段结构：类型签名 / 导入(js.K0..K19, js.E0..E15) / 导出 / 数据段。

用法：
    python3 tools/inspect_wasm.py            # 结构统计
    python3 tools/inspect_wasm.py --dump     # 额外：打印导出函数的类型、数据段明细

可选：pip install wasmtime，脚本会自动实例化模块并转储初始内存
（可直接看到 AES S-box / Rcon / 初始数据，验证"标准 AES-CBC"这一题面结论）。
"""
import base64
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.dirname(HERE)
JS = os.path.join(DIR, "docs", "31.js")
WASM = os.path.join(DIR, "wasm", "31.wasm")

VAL = {0x7F: "i32", 0x7E: "i64", 0x7D: "f32", 0x7C: "f64"}


def read_leb(data, off):
    """无符号 LEB128"""
    res = shift = 0
    while True:
        b = data[off]
        off += 1
        res |= (b & 0x7F) << shift
        shift += 7
        if not (b & 0x80):
            return res, off


def extract_wasm():
    """从 31.js 提取 WASM_B64 并落盘"""
    src = open(JS, encoding="utf-8", errors="replace").read()
    m = re.search(r'WASM_B64\s*=\s*"([^"]+)"', src)
    if not m:
        sys.exit("[-] 未在 31.js 中找到 WASM_B64")
    blob = base64.b64decode(m.group(1))
    os.makedirs(os.path.dirname(WASM), exist_ok=True)
    with open(WASM, "wb") as f:
        f.write(blob)
    print(f"[+] WASM_B64 长度 {len(m.group(1))} → wasm/31.wasm {len(blob)} 字节，magic={blob[:4]!r}")
    return blob


def parse_sections(blob):
    off, sections = 8, {}
    while off < len(blob):
        sid = blob[off]
        off += 1
        size, off = read_leb(blob, off)
        sections[sid] = blob[off:off + size]
        off += size
    return sections


def parse_types(sec):
    pos, types = 0, []
    n, pos = read_leb(sec, pos)
    for _ in range(n):
        pos += 1  # 0x60 functype
        np_, pos = read_leb(sec, pos)
        params = [VAL.get(sec[pos + i], "?") for i in range(np_)]
        pos += np_
        nr, pos = read_leb(sec, pos)
        rets = [VAL.get(sec[pos + i], "?") for i in range(nr)]
        pos += nr
        types.append((params, rets))
    return types


def parse_imports(sec):
    pos, out = 0, []
    n, pos = read_leb(sec, pos)
    for _ in range(n):
        ml, pos = read_leb(sec, pos)
        mod = sec[pos:pos + ml].decode(); pos += ml
        nl, pos = read_leb(sec, pos)
        name = sec[pos:pos + nl].decode(); pos += nl
        kind = sec[pos]; pos += 1
        if kind == 0:
            t, pos = read_leb(sec, pos)
            out.append((f"{mod}.{name}", "func", t))
        elif kind == 1:
            pos += 1; _f, pos = read_leb(sec, pos); _m, pos = read_leb(sec, pos)
            out.append((f"{mod}.{name}", "table", None))
        elif kind == 2:
            _f, pos = read_leb(sec, pos); _m, pos = read_leb(sec, pos)
            out.append((f"{mod}.{name}", "memory", None))
        else:
            pos += 2
            out.append((f"{mod}.{name}", "global", None))
    return out


def parse_exports(sec):
    pos, out = 0, []
    n, pos = read_leb(sec, pos)
    for _ in range(n):
        nl, pos = read_leb(sec, pos)
        name = sec[pos:pos + nl].decode(); pos += nl
        kind = sec[pos]; pos += 1
        idx, pos = read_leb(sec, pos)
        out.append((name, {0: "func", 1: "table", 2: "memory", 3: "global"}[kind], idx))
    return out


def parse_data(sec, dump=False):
    pos, segs = 0, []
    n, pos = read_leb(sec, pos)
    for i in range(n):
        flags, pos = read_leb(sec, pos)
        off = 0
        if flags == 0:
            if sec[pos] == 0x41:  # i32.const
                pos += 1
                v = shift = 0
                while True:
                    b = sec[pos]; pos += 1
                    v |= (b & 0x7F) << shift; shift += 7
                    if not (b & 0x80):
                        break
                off = v
            pos += 1  # end
        ln, pos = read_leb(sec, pos)
        d = sec[pos:pos + ln]; pos += ln
        segs.append((i, off, ln, d))
    nz = [s for s in segs if s[2] and any(b for b in s[3])]
    print(f"[+] 数据段 {len(segs)} 个，非零 {len(nz)} 个")
    if dump:
        for i, off, ln, d in nz:
            print(f"    seg{i}: off={off} len={ln} {d[:48].hex()}")
    return nz


def dump_memory():
    """可选：用 wasmtime 实例化，转储初始内存（可见 AES S-box / Rcon）"""
    try:
        import wasmtime
    except ImportError:
        print("[i] 未安装 wasmtime，跳过内存转储（pip install wasmtime）")
        return
    with open(WASM, "rb") as f:
        blob = f.read()
    eng = wasmtime.Engine()
    mod = wasmtime.Module(eng, blob)
    store = wasmtime.Store(eng)
    imports = []
    for i in range(20):
        imports.append(wasmtime.Func(store, wasmtime.FuncType([], [wasmtime.ValType.i32()]), lambda: 0))
    for i in range(16):
        imports.append(wasmtime.Func(store, wasmtime.FuncType([], [wasmtime.ValType.i32()]), lambda: 0))
    inst = wasmtime.Instance(store, mod, imports)
    ex = inst.exports(store)
    ex["aes_init"](store)
    mem = ex["memory"].data_ptr(store)
    print("[+] 初始内存前 0x140 字节：")
    for base in range(0, 0x140, 32):
        chunk = bytes(mem[base:base + 32])
        asc = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"    {base:04x}: {chunk.hex()}  {asc}")
    print("[i] 0x20 起即为标准 AES S-box（637c777b...），0x120 起为 Rcon 01 02 04 08 10 20 40 80 1b 36")


if __name__ == "__main__":
    dump = "--dump" in sys.argv
    blob = extract_wasm()
    secs = parse_sections(blob)
    print("[+] 段: " + ", ".join(f"{k}({len(v)}B)" for k, v in sorted(secs.items())))
    types = parse_types(secs[1])
    for i, (p, r) in enumerate(types):
        print(f"    type{i}: ({', '.join(p)}) -> ({', '.join(r)})")
    imps = parse_imports(secs[2])
    print(f"[+] 导入 {len(imps)} 个：{imps[0][0]} … {imps[-1][0]}（全部 js.* 函数，即算法被拆到 JS 侧）")
    exps = parse_exports(secs[7])
    for name, kind, idx in exps:
        print(f"[+] 导出 {name} ({kind}, index={idx})")
    parse_data(secs[11], dump)
    if dump:
        dump_memory()
