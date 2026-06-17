/* unzip.js — 端末内だけで ZIP を展開する純 JS 実装（外部送信なし・ビルド不要）。
 *
 * ZIP の Central Directory を読み、各エントリを STORE(無圧縮) / DEFLATE で復元します。
 * DEFLATE(RFC1951) の inflate は tiny-inflate（Devon Govett, MIT License）の
 * アルゴリズムを移植したものです。ZIP64 と暗号化は非対応（小さな .md 配布物が対象）。
 *
 *   NSCode.unzip(arrayBuffer) -> [{ path, text, bytes }]
 */
(function (NSCode) {
  'use strict';

  /* ===== DEFLATE inflate (RFC 1951) — port of tiny-inflate (MIT) ============ */
  function Tree() { this.table = new Uint16Array(16); this.trans = new Uint16Array(288); }
  function Data(source, dest) {
    this.s = source; this.i = 0; this.t = 0; this.bitcount = 0;
    this.dest = dest; this.destLen = 0;
    this.ltree = new Tree(); this.dtree = new Tree();
  }

  var sltree = new Tree(), sdtree = new Tree();
  var length_bits = new Uint8Array(30), length_base = new Uint16Array(30);
  var dist_bits = new Uint8Array(30), dist_base = new Uint16Array(30);
  var clcidx = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var code_tree = new Tree(), lengths = new Uint8Array(288 + 32), offs = new Uint16Array(16);

  function build_bits_base(bits, base, delta, first) {
    var i, sum;
    for (i = 0; i < delta; ++i) bits[i] = 0;
    for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;
    for (sum = first, i = 0; i < 30; ++i) { base[i] = sum; sum += 1 << bits[i]; }
  }
  function build_fixed_trees(lt, dt) {
    var i;
    for (i = 0; i < 7; ++i) lt.table[i] = 0;
    lt.table[7] = 24; lt.table[8] = 152; lt.table[9] = 112;
    for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
    for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
    for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
    for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;
    for (i = 0; i < 5; ++i) dt.table[i] = 0;
    dt.table[5] = 32;
    for (i = 0; i < 32; ++i) dt.trans[i] = i;
  }
  function build_tree(t, src, off, num) {
    var i, sum;
    for (i = 0; i < 16; ++i) t.table[i] = 0;
    for (i = 0; i < num; ++i) t.table[src[off + i]]++;
    t.table[0] = 0;
    for (sum = 0, i = 0; i < 16; ++i) { offs[i] = sum; sum += t.table[i]; }
    for (i = 0; i < num; ++i) if (src[off + i]) t.trans[offs[src[off + i]]++] = i;
  }
  function getbit(d) {
    if (!d.bitcount--) { d.t = d.s[d.i++]; d.bitcount = 7; }
    var bit = d.t & 1; d.t >>>= 1; return bit;
  }
  function read_bits(d, num, base) {
    if (!num) return base;
    while (d.bitcount < 24) { d.t |= d.s[d.i++] << d.bitcount; d.bitcount += 8; }
    var val = d.t & (0xffff >>> (16 - num));
    d.t >>>= num; d.bitcount -= num; return val + base;
  }
  function decode_symbol(d, t) {
    while (d.bitcount < 24) { d.t |= d.s[d.i++] << d.bitcount; d.bitcount += 8; }
    var sum = 0, cur = 0, len = 0, tag = d.t;
    do {
      cur = 2 * cur + (tag & 1); tag >>>= 1; ++len;
      sum += t.table[len]; cur -= t.table[len];
    } while (cur >= 0);
    d.t = tag; d.bitcount -= len;
    return t.trans[sum + cur];
  }
  function decode_trees(d, lt, dt) {
    var hlit = read_bits(d, 5, 257), hdist = read_bits(d, 5, 1), hclen = read_bits(d, 4, 4);
    var i, num, length;
    for (i = 0; i < 19; ++i) lengths[i] = 0;
    for (i = 0; i < hclen; ++i) lengths[clcidx[i]] = read_bits(d, 3, 0);
    build_tree(code_tree, lengths, 0, 19);
    for (num = 0; num < hlit + hdist;) {
      var sym = decode_symbol(d, code_tree);
      switch (sym) {
        case 16:
          var prev = lengths[num - 1];
          for (length = read_bits(d, 2, 3); length; --length) lengths[num++] = prev;
          break;
        case 17:
          for (length = read_bits(d, 3, 3); length; --length) lengths[num++] = 0;
          break;
        case 18:
          for (length = read_bits(d, 7, 11); length; --length) lengths[num++] = 0;
          break;
        default:
          lengths[num++] = sym;
      }
    }
    build_tree(lt, lengths, 0, hlit);
    build_tree(dt, lengths, hlit, hdist);
  }
  function inflate_block_data(d, lt, dt) {
    while (1) {
      var sym = decode_symbol(d, lt);
      if (sym === 256) return;
      if (sym < 256) { d.dest[d.destLen++] = sym; continue; }
      sym -= 257;
      var length = read_bits(d, length_bits[sym], length_base[sym]);
      var dist = decode_symbol(d, dt);
      var o = d.destLen - read_bits(d, dist_bits[dist], dist_base[dist]);
      for (var k = o; k < o + length; ++k) d.dest[d.destLen++] = d.dest[k];
    }
  }
  function inflate_uncompressed_block(d) {
    while (d.bitcount > 8) { d.i--; d.bitcount -= 8; }
    var length = 256 * d.s[d.i + 1] + d.s[d.i];
    d.i += 4; // skip LEN(2) + NLEN(2)
    for (var i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];
    d.bitcount = 0;
  }
  function inflate(source, dest) {
    var d = new Data(source, dest), bfinal, btype;
    do {
      bfinal = getbit(d);
      btype = read_bits(d, 2, 0);
      if (btype === 0) inflate_uncompressed_block(d);
      else if (btype === 1) inflate_block_data(d, sltree, sdtree);
      else if (btype === 2) { decode_trees(d, d.ltree, d.dtree); inflate_block_data(d, d.ltree, d.dtree); }
      else throw new Error('inflate: 不正なブロック種別です');
    } while (!bfinal);
    return d.dest;
  }
  build_fixed_trees(sltree, sdtree);
  build_bits_base(length_bits, length_base, 4, 3);
  build_bits_base(dist_bits, dist_base, 2, 1);
  length_bits[28] = 0; length_base[28] = 258;

  /* ===== ZIP container ====================================================== */
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  NSCode.unzip = function (buf) {
    var bytes = new Uint8Array(buf), dv = new DataView(buf), n = bytes.length;
    var dec = new TextDecoder('utf-8');
    // End Of Central Directory: 後方から 0x06054b50 を探す（コメント領域考慮）
    var eocd = -1, min = Math.max(0, n - 22 - 65536);
    for (var p = n - 22; p >= min; p--) { if (u32(dv, p) === 0x06054b50) { eocd = p; break; } }
    if (eocd < 0) throw new Error('ZIP の終端レコードが見つかりません（壊れたファイル？）');
    var count = u16(dv, eocd + 10), off = u32(dv, eocd + 16), out = [];
    for (var i = 0; i < count; i++) {
      if (off + 46 > n || u32(dv, off) !== 0x02014b50) break;
      var method = u16(dv, off + 10);
      var compSize = u32(dv, off + 20);
      var uncompSize = u32(dv, off + 24);
      var fnLen = u16(dv, off + 28);
      var extraLen = u16(dv, off + 30);
      var commentLen = u16(dv, off + 32);
      var localOff = u32(dv, off + 42);
      var name = dec.decode(bytes.subarray(off + 46, off + 46 + fnLen));
      off += 46 + fnLen + extraLen + commentLen;
      if (!name || name.charAt(name.length - 1) === '/') continue;      // ディレクトリ
      if (u32(dv, localOff) !== 0x04034b50) continue;                   // ローカルヘッダ不正
      var dataStart = localOff + 30 + u16(dv, localOff + 26) + u16(dv, localOff + 28);
      var comp = bytes.subarray(dataStart, dataStart + compSize);
      var raw;
      if (method === 0) raw = comp;
      else if (method === 8) raw = inflate(comp, new Uint8Array(uncompSize));
      else continue;                                                    // 未対応の圧縮方式
      out.push({ path: name, bytes: raw, text: dec.decode(raw) });
    }
    return out;
  };
})(window.NSCode);
