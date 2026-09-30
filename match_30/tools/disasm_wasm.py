data = open(__file__.rsplit('/',2)[0] + '/wasm/challenge30.wasm','rb').read()

def uleb(b, i):
    r = 0; s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7f) << s
        if not (x & 0x80): break
        s += 7
    return r, i

def sleb(b, i):
    r = 0; s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7f) << s
        s += 7
        if not (x & 0x80):
            if x & 0x40: r -= (1 << s)
            break
    return r, i

i = 8
sections = {}
while i < len(data):
    sid = data[i]; i += 1
    size, i = uleb(data, i)
    sections[sid] = data[i:i+size]
    i += size

csec = sections[10]
j = 0
n, j = uleb(csec, j)
bodies = []
for _ in range(n):
    sz, j = uleb(csec, j)
    bodies.append(csec[j:j+sz]); j += sz

OPS = {0x71:'i32.and',0x74:'i32.shl',0x6b:'i32.sub',0x76:'i32.shr_u',0x72:'i32.or',
 0x70:'i32.rem_u',0x46:'i32.eq',0x6a:'i32.add',0x73:'i32.xor',0x6c:'i32.mul',
 0x45:'i32.eqz',0x3a:'i32.store8',0x0f:'return',0x2d:'i32.load8_u',0x6e:'i32.div_u',
 0x4f:'i32.ge_u',0x49:'i32.lt_u',0x4b:'i32.gt_u',0x4a:'i32.gt_s',0x48:'i32.lt_s',
 0x47:'i32.ne',0x75:'i32.shr_s',0x6f:'i32.rotr',0x6d:'i32.div_s',0x3b:'i32.store8?'}
OPS = {0x71:'i32.and',0x74:'i32.shl',0x6b:'i32.sub',0x76:'i32.shr_u',0x72:'i32.or',
 0x70:'i32.rem_u',0x46:'i32.eq',0x6a:'i32.add',0x73:'i32.xor',0x6c:'i32.mul',
 0x45:'i32.eqz',0x0f:'return',0x2d:'i32.load8_u',0x6e:'i32.div_u',0x4f:'i32.ge_u',
 0x49:'i32.lt_u',0x4b:'i32.gt_u',0x4a:'i32.gt_s',0x48:'i32.lt_s',0x47:'i32.ne',
 0x75:'i32.shr_s',0x6f:'i32.rotr',0x6d:'i32.div_s'}

NAMES = {0x00:'unreachable',0x01:'nop',0x02:'block',0x03:'loop',0x04:'if',0x05:'else',
 0x0b:'end',0x0c:'br',0x0d:'br_if',0x0e:'br_table',0x0f:'return',0x10:'call',
 0x11:'call_indirect',0x1a:'drop',0x1b:'select'}
for op in range(0x41, 0x45):
    NAMES[op] = {0x41:'i32.const',0x42:'i64.const',0x43:'f32.const',0x44:'f64.const'}[op]
for op in range(0x20, 0x25):
    NAMES[op] = {0x20:'local.get',0x21:'local.set',0x22:'local.tee',0x23:'global.get',0x24:'global.set'}[op]
for op in range(0x28, 0x36):
    NAMES[op] = 'load/%02x' % op
NAMES[0x3a] = 'i32.store8'

def disasm(body):
    k = 0
    nloc, k = uleb(body, k)
    locdesc = []
    for _ in range(nloc):
        cnt, k = uleb(body, k)
        t = body[k]; k += 1
        locdesc.append((cnt, {0x7f:'i32',0x7e:'i64'}.get(t, hex(t))))
    out = []
    depth = 0
    while k < len(body):
        op = body[k]; k += 1
        nm = NAMES.get(op)
        if op == 0x0b:
            out.append(('end', [], depth))
            depth -= 1
            if depth < 0: break
            continue
        if op in (0x02, 0x03, 0x04):
            bt = body[k]; k += 1
            out.append((nm, [hex(bt)], depth))
            depth += 1
            continue
        if op == 0x05:
            out.append(('else', [], depth)); continue
        if op == 0x41:
            v, k = sleb(body, k); out.append(('i32.const', [v, '=0x%x' % (v & 0xffffffff)], depth)); continue
        if op == 0x20 or op == 0x21 or op == 0x22:
            v, k = uleb(body, k); out.append((nm, [v], depth)); continue
        if op in (0x28, 0x2c, 0x2d):
            a, k = uleb(body, k); o, k = uleb(body, k)
            out.append((nm, ['align=%d' % a, 'off=%d' % o], depth)); continue
        if op == 0x36 or op == 0x3a:
            a, k = uleb(body, k); o, k = uleb(body, k)
            out.append((nm, ['align=%d' % a, 'off=%d' % o], depth)); continue
        if op in (0x10, 0x0c, 0x0d):
            v, k = uleb(body, k); out.append((nm, [v], depth)); continue
        out.append((nm or OPS.get(op, 'op_%02x' % op), [], depth))
    return locdesc, out

for bi, body in enumerate(bodies):
    locd, ins = disasm(body)
    print(f'\n===== body {bi} (func index {bi+1}), locals={locd}, bytes={len(body)} =====')
    for op, args, depth in ins:
        print('  ' + '  ' * depth + f'{op:12} {args}')
