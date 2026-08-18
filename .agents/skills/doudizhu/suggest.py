# -*- coding: utf-8 -*-
"""suggest.py — 斗地主出牌引擎
用法:
  python suggest.py "<手牌>" "<上家牌>" [地主|农民]
  python suggest.py "<手牌>" "" "" 叫分
牌编码: S3 H10 DK BJ LJ (花色S/H/D/C + 点数, BJ=大王 LJ=小王)
输出 JSON 建议。
"""
import json
import sys

VAL = {"3": 0, "4": 1, "5": 2, "6": 3, "7": 4, "8": 5, "9": 6, "10": 7, "J": 8, "Q": 9, "K": 10, "A": 11, "2": 12}
VAL_NAME = {v: k for k, v in VAL.items()}
VAL_NAME[13] = "小王"
VAL_NAME[14] = "大王"
SUIT = {"S": "黑桃", "H": "红桃", "D": "方块", "C": "梅花"}


def parse_card(c):
    c = c.strip()
    if c == "BJ":
        return ("B", 14)
    if c == "LJ":
        return ("B", 13)
    s, n = c[0], c[1:]
    return (s, VAL[n])


def fmt_card(s, v):
    if v >= 13:
        return "大王" if v == 14 else "小王"
    return SUIT[s] + VAL_NAME[v]


def freq_map(cards):
    f = {}
    for _, v in cards:
        f[v] = f.get(v, 0) + 1
    return f


def get_type(cards):
    """返回 (类型, 关键点数) 或 None"""
    f = freq_map(cards)
    vals = sorted(f)
    n = len(cards)
    if n == 1:
        return ("单张", cards[0][1])
    if n == 2:
        if 13 in f and 14 in f:
            return ("王炸", 15)
        if len(vals) == 1:
            return ("对子", vals[0])
        return None
    if n == 3:
        if len(vals) == 1:
            return ("三张", vals[0])
        return None
    if n == 4:
        if len(vals) == 1:
            return ("炸弹", vals[0])
        if len(vals) == 2 and max(f.values()) == 3:
            return ("三带一", max(vals, key=lambda v: f[v]))
        return None
    # n >= 5
    if len(vals) == 1:
        return ("炸弹", vals[0])
    # 顺子: 全部频次1, 连续, 不含2/王, >=5
    if all(c == 1 for c in f.values()) and vals[-1] - vals[0] == n - 1 and vals[0] <= 7 and vals[-1] <= 11:
        return ("顺子", vals[-1])
    # 连对: 频次全2, 连续, >=3对
    if all(c == 2 for c in f.values()) and vals[-1] - vals[0] == len(vals) - 1 and len(vals) >= 3 and vals[-1] <= 11:
        return ("连对", vals[-1])
    # 三带一: 3+1
    if n == 4 and len(vals) == 2 and max(f.values()) == 3:
        return ("三带一", max(vals, key=lambda v: f[v]))
    # 三带一对: 3+2
    if n == 5 and sorted(f.values()) == [2, 3]:
        return ("三带一对", max(vals, key=lambda v: f[v]))
    # 飞机(纯): 2+ 组三张连续
    tris = [v for v in vals if f[v] == 3]
    if len(tris) >= 2 and tris[-1] - tris[0] == len(tris) - 1 and tris[-1] <= 11:
        if n == len(tris) * 3:
            return ("飞机", tris[-1])
    return None


def candidates_to_beat(hand, top_type, top_val):
    """返回所有能压 top 的候选 [(类型, 关键点数, 代价, 具体牌)]"""
    f = freq_map(hand)
    cands = []
    if top_type == "单张":
        for v in sorted(f):
            if v > top_val:
                cands.append((v, [c for c in hand if c[1] == v][:1]))
    elif top_type == "对子":
        for v in sorted(f):
            if f[v] >= 2 and v > top_val:
                cands.append((v, [c for c in hand if c[1] == v][:2]))
    elif top_type == "三张":
        for v in sorted(f):
            if f[v] >= 3 and v > top_val:
                cands.append((v, [c for c in hand if c[1] == v][:3]))
    elif top_type == "三带一":
        for v in sorted(f):
            if f[v] >= 3 and v > top_val:
                trio = [c for c in hand if c[1] == v][:3]
                rest = [c for c in hand if c[1] != v]
                if rest:
                    cands.append((v, trio + [rest[0]]))
    elif top_type == "三带一对":
        for v in sorted(f):
            if f[v] >= 3 and v > top_val:
                trio = [c for c in hand if c[1] == v][:3]
                pair = [c for c in hand if c[1] != v and f[c[1]] >= 2]
                if pair:
                    cands.append((v, trio + [c for c in hand if c[1] == pair[0][1]][:2]))
    elif top_type == "顺子":
        ln = None  # 需要知道上家顺子长度
        # 用点数范围推断: 我们只拿到关键点数, 需要长度 -> 由调用方补充, 这里用 top_len 参数
        pass
    elif top_type == "炸弹":
        for v in sorted(f):
            if f[v] == 4 and v > top_val:
                cands.append((v, [c for c in hand if c[1] == v][:4]))
    # 炸弹/王炸万能压
    for v in sorted(f):
        if f[v] == 4 and (top_type != "炸弹" or v > top_val):
            cands.append((v, [c for c in hand if c[1] == v][:4]))
    if 13 in f and 14 in f and top_type != "王炸":
        cands.append((15, [c for c in hand if c[1] in (13, 14)]))
    return cands


def suggest_follow(hand, top_cards):
    """跟牌: 返回最优建议"""
    top_type, top_val = get_type(top_cards)
    if top_type is None:
        return {"pass": True, "reason": "上家牌型无法解析"}
    # 顺子需要长度: 从上家牌数量推断
    if top_type == "顺子":
        ln = len(top_cards)
        f = freq_map(hand)
        # 找长度相同、起点更高的连续序列
        best = None
        for start in range(0, 8):  # 3~10 起点
            seq = list(range(start, start + ln))
            if seq[-1] > 11 or seq[-1] <= top_val:
                continue
            if all(f.get(v, 0) >= 1 for v in seq):
                cards = []
                for v in seq:
                    cards.append(next(c for c in hand if c[1] == v and c not in cards))
                if best is None or seq[-1] < best[0]:
                    best = (seq[-1], cards)
        if best:
            return {"type": "顺子", "cards": [fmt_card(*c) for c in best[1]], "key": best[0],
                    "reason": f"顺子 {best[0]+1} 起压 (上家顺子尾{top_val+1})"}
        cands = []
    else:
        cands = candidates_to_beat(hand, top_type, top_val)

    if not cands:
        # 炸弹/王炸兜底
        return {"pass": True, "reason": f"没有能压 {top_type} 的牌"}

    # 选代价最小的: 关键点数最小优先
    cands.sort(key=lambda x: (x[0], len(x[1])))
    k, cards = cands[0]
    t, _ = get_type(cards)
    return {"type": t, "cards": [fmt_card(*c) for c in cards], "key": k,
            "reason": f"最小可压: {t} ({VAL_NAME.get(k, k)})"}


def suggest_first(hand):
    """先手: 优先出最小散牌"""
    f = freq_map(hand)
    # 找最小的单张(非顺子核心的简单策略: 最小单张)
    singles = [v for v in sorted(f) if f[v] == 1 and v <= 10]  # 不拆 2/王
    if singles:
        v = singles[0]
        c = next(c for c in hand if c[1] == v)
        return {"type": "单张", "cards": [fmt_card(*c)], "key": v,
                "reason": f"先手出最小散牌 {fmt_card(*c)}"}
    # 没有零散单张: 出最小对子
    pairs = [v for v in sorted(f) if f[v] == 2]
    if pairs:
        v = pairs[0]
        cs = [c for c in hand if c[1] == v][:2]
        return {"type": "对子", "cards": [fmt_card(*c) for c in cs], "key": v,
                "reason": f"出最小对子 {VAL_NAME[v]}{VAL_NAME[v]}"}
    # 全部成组: 出最小三张或单张
    v = sorted(f)[0]
    cs = [c for c in hand if c[1] == v]
    n = len(cs)
    if n >= 3:
        return {"type": "三张", "cards": [fmt_card(*c) for c in cs[:3]], "key": v, "reason": "出最小三张"}
    return {"type": "单张", "cards": [fmt_card(*cs[0])], "key": v, "reason": "出最小单张"}


def suggest_bid(hand):
    """叫分评估"""
    f = freq_map(hand)
    score = 0.0
    for v, cnt in f.items():
        if v == 12:
            score += 2 * cnt  # 2
        elif v == 14:
            score += 2  # 大王
        elif v == 13:
            score += 1  # 小王
        elif v == 11:
            score += 1 * cnt  # A
        elif v == 10:
            score += 0.5 * cnt  # K
        elif cnt == 4:
            score += 3  # 炸弹
    if score >= 5:
        return {"bid": 3, "score": score, "reason": "牌力强, 叫3分"}
    if score >= 3.5:
        return {"bid": 2, "score": score, "reason": "牌力中上, 叫2分"}
    if score >= 2.5:
        return {"bid": 1, "score": score, "reason": "牌力中等, 叫1分"}
    return {"bid": 0, "score": score, "reason": "牌力弱, 不叫"}


def main():
    args = sys.argv[1:]
    if len(args) < 1:
        print(json.dumps({"error": "用法: suggest.py '<手牌>' ['<上家牌>'] [地主|农民|叫分]"}, ensure_ascii=False))
        return
    hand_str = args[0].strip()
    hand = [parse_card(c) for c in hand_str.split() if c.strip()]
    if not hand:
        print(json.dumps({"error": "空手牌"}, ensure_ascii=False))
        return
    mode = args[2] if len(args) > 2 else "地主"
    top_arg = args[1] if len(args) > 1 else ""
    # 兼容: 空串/占位符/模式词 都视为"无上家"
    if top_arg in ("", "-", "地主", "农民", "叫分", "先手"):
        top_arg = ""
    if top_arg:
        top_cards = [parse_card(c) for c in top_arg.split() if c.strip()]
        r = suggest_follow(hand, top_cards)
        r["hand_count"] = len(hand)
        print(json.dumps(r, ensure_ascii=False))
    elif mode == "叫分":
        r = suggest_bid(hand)
        r["hand_count"] = len(hand)
        print(json.dumps(r, ensure_ascii=False))
    else:
        r = suggest_first(hand)
        r["hand_count"] = len(hand)
        print(json.dumps(r, ensure_ascii=False))


if __name__ == "__main__":
    main()
