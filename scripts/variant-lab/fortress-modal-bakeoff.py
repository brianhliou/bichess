"""Modal fan-out bake-off for the Fortress Xiangqi A/B arms.

Forked 2026-09-02 from docs-private/drop-game-lab/harness/modal_bakeoff.py, which
produced every number in DESIGN-SPEC and DATA-INDEX. Same protocol, so a `base`
arm run here is directly comparable to the published 55/11/20/83. Changes: the
ini path and output dir are arguments instead of one session's hardcoded
scratchpad, and `smoke` takes the variant to load.

Our exact Fairy-Stockfish (upstream @ 1b5bdd4) compiled in a Linux image; games
fanned across many containers (no sequencing). Variety = TOP-K openings
(randomize among moves within `margin` cp of the best), not random blunders.
Depth is a parameter (deep confirmation cheap via fan-out).

  modal run modal_bakeoff.py::smoke                      # validate image
  modal run modal_bakeoff.py --variant zmini-drop-nc --games 400 --depth 18
"""
from __future__ import annotations
import modal

FSF_COMMIT = "1b5bdd4"
FSF = "/usr/local/bin/fairy-stockfish"

image = (
    modal.Image.debian_slim()
    .apt_install("git", "build-essential", "ca-certificates")
    .run_commands(
        "git clone https://github.com/fairy-stockfish/Fairy-Stockfish.git /fsf",
        f"cd /fsf && git checkout {FSF_COMMIT}",
        "cd /fsf/src && (make -j build ARCH=x86-64-modern || make -j build ARCH=x86-64)",
        "cp /fsf/src/stockfish /usr/local/bin/fairy-stockfish && chmod +x /usr/local/bin/fairy-stockfish",
    )
)
# Large-board build. The default image compiles without `largeboards=yes`, so
# anything wider or taller than 8x8 does not exist in it and FSF silently keeps
# the variant it already had — a `xiangqi` reference run came back byte-identical
# to the chess run before it (2026-09-02). Fortress arms are unaffected: they
# inherit minixiangqi, which is 7x7 and fits.
image_large = (
    modal.Image.debian_slim()
    .apt_install("git", "build-essential", "ca-certificates")
    .run_commands(
        "git clone https://github.com/fairy-stockfish/Fairy-Stockfish.git /fsf",
        f"cd /fsf && git checkout {FSF_COMMIT}",
        "cd /fsf/src && (make -j build ARCH=x86-64-modern largeboards=yes || make -j build ARCH=x86-64 largeboards=yes)",
        "cp /fsf/src/stockfish /usr/local/bin/fairy-stockfish && chmod +x /usr/local/bin/fairy-stockfish",
    )
)

app = modal.App("fortress-bakeoff", image=image)

# Hard ceiling on parallel containers: the Modal plan on this account allows 100,
# and a run that asks for more does not fail, it silently sits at 100 with the
# rest queued while `modal app list` reports the cap as if it were the request.
# Pair it with --chunk so games/chunk lands at or under this, or containers get
# reused for no benefit. A killed local `modal run` does NOT stop the app: the
# containers keep running and keep billing until `modal app stop <id> --yes`.
MAX_CONTAINERS = 100


# ---------- FSF UCI driver (runs inside the container) ----------
def _make_engine(ini_path: str, variant: str, multipv: int = 1):
    import subprocess
    p = subprocess.Popen([FSF], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

    def send(c): p.stdin.write(c + "\n"); p.stdin.flush()
    def read_until(pred):
        lines = []
        for line in p.stdout:
            line = line.rstrip("\n")
            lines.append(line)
            if pred(line):
                return lines
        return lines

    send("uci"); read_until(lambda l: l == "uciok")
    # Only load a VariantPath when there is one. Pointing it at an ini that does
    # not define the requested variant makes this FSF build silently keep the
    # variant it already had, so a built-in reference run (chess, xiangqi) came
    # back byte-identical to the run before it (2026-09-02).
    if ini_path:
        send(f"setoption name VariantPath value {ini_path}")
    send(f"setoption name UCI_Variant value {variant}")
    send("setoption name Threads value 1")
    send("setoption name Skill Level value 20")
    if multipv > 1:
        send(f"setoption name MultiPV value {multipv}")
    send("isready"); read_until(lambda l: l == "readyok")
    send("ucinewgame")
    return p, send, read_until


def _score(lines):
    import re
    for l in reversed(lines):
        m = re.search(r"\bscore (cp|mate) (-?\d+)", l)
        if m:
            v = int(m.group(2))
            return (30000 - v if v >= 0 else -30000 - v) if m.group(1) == "mate" else v
    return 0


def _play_one(send, read_until, *, seed, depth, book_plies, open_depth, k, margin, stale_loss, max_plies, play_margin=0):
    """One game: balanced random opening (eval-filtered), then best play.
    (`margin` = opening eval cap in cp; `k` is unused — top-K biased first-mover.)"""
    import random, re
    rng = random.Random(seed)
    moves, evalsW = [], []
    seen = {}

    def pos():
        return "position startpos moves " + " ".join(moves) if moves else "position startpos"

    # --- balanced opening (VALIDATED, ~52% control): book_plies RANDOM legal
    #     moves, kept only if the result is within `margin` cp of even. Shallow on
    #     purpose: deeper "balanced" walks drift first-mover-favorable (600-game
    #     control hit 59% vs the true 52%, z=3.43) because deep eval-balanced
    #     positions hide first-mover initiative the eval can't see. ---
    def legal_moves(line):
        send("position startpos moves " + " ".join(line) if line else "position startpos")
        send("go perft 1")
        ls = read_until(lambda l: l.startswith("Nodes searched"))
        out = []
        for l in ls:
            m = re.match(r"^(\S+): 1$", l)
            if m and not l.startswith("Nodes searched"):
                out.append(m.group(1))
        return out

    for _attempt in range(40):
        line, ok = [], True
        for _ in range(book_plies):
            lm = legal_moves(line)
            if not lm:
                ok = False; break
            line.append(rng.choice(lm))
        if not ok:
            continue
        send("position startpos moves " + " ".join(line)); send(f"go depth {open_depth}")
        bl = read_until(lambda l: l.startswith("bestmove "))
        if abs(_score(bl)) <= margin:
            moves, evalsW = line[:], [0] * len(line)
            break
    book_reached = len(moves)
    def result(winner, reason):
        return {"winner": winner, "reason": reason, "moveList": moves, "evalsW": evalsW, "book": book_reached}

    # --- best play to the end ---
    for _ in range(max_plies):
        white = len(moves) % 2 == 0
        send(pos()); send("d"); send("isready")
        dl = read_until(lambda l: l == "readyok")
        fen = next((l[5:] for l in dl if l.startswith("Fen: ")), "")
        parts = fen.split()
        key = (parts[0] if parts else "") + " " + (parts[1] if len(parts) > 1 else "")
        checkers = bool(next((l[len("Checkers:"):].strip() for l in dl if l.startswith("Checkers:")), ""))
        send(pos()); send(f"go depth {depth}")
        bl = read_until(lambda l: l.startswith("bestmove "))
        bm = next((l.split()[1] for l in bl if l.startswith("bestmove ")), "(none)")
        n = seen.get(key, 0) + 1; seen[key] = n
        if n >= 3:
            return result("draw", "repetition")
        if bm == "(none)":
            loser = "red" if white else "black"
            if checkers:
                return result("black" if white else "red", f"checkmate({loser}-mated)")
            if stale_loss:
                return result("black" if white else "red", f"stalemate-loss({loser}-stuck)")
            return result("draw", "stalemate")
        # imperfect play: pick a random move within play_margin cp of best (MultiPV).
        chosen, sc_chosen = bm, _score(bl)
        if play_margin > 0:
            cand = {}
            for l in bl:
                if " multipv " in l and " pv " in l:
                    mi = re.search(r" multipv (\d+) ", l)
                    ms = re.search(r"score (cp|mate) (-?\d+)", l)
                    mv = re.search(r" pv (\S+)", l)
                    if mi and ms and mv:
                        v = int(ms.group(2))
                        sc = (30000 - v if v >= 0 else -30000 - v) if ms.group(1) == "mate" else v
                        cand[int(mi.group(1))] = (sc, mv.group(1))
            if cand:
                best_sc = cand.get(1, max(cand.values()))[0]
                pool = [(s, mv) for s, mv in cand.values() if s >= best_sc - play_margin]
                if pool:
                    sc_chosen, chosen = rng.choice(pool)
        stm = sc_chosen
        moves.append(chosen); evalsW.append(stm if white else -stm)
    return result("draw", "maxplies")


@app.function(timeout=5400, max_containers=MAX_CONTAINERS, image=image_large)
def play_chunk_large(ini_text: str, variant: str, seeds: list[int], depth: int,
                     book_plies: int, open_depth: int, k: int, margin: int,
                     stale_loss: bool, max_plies: int, play_margin: int = 0) -> list[dict]:
    return _play_chunk_body(ini_text, variant, seeds, depth, book_plies, open_depth,
                            k, margin, stale_loss, max_plies, play_margin)


@app.function(timeout=5400, max_containers=MAX_CONTAINERS)
def play_chunk(ini_text: str, variant: str, seeds: list[int], depth: int,
               book_plies: int, open_depth: int, k: int, margin: int,
               stale_loss: bool, max_plies: int, play_margin: int = 0) -> list[dict]:
    return _play_chunk_body(ini_text, variant, seeds, depth, book_plies, open_depth,
                            k, margin, stale_loss, max_plies, play_margin)


def _play_chunk_body(ini_text, variant, seeds, depth, book_plies, open_depth, k,
                     margin, stale_loss, max_plies, play_margin=0):
    import tempfile, os
    ini = None
    ini_name = ""
    if ini_text.strip():
        ini = tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False)
        ini.write(ini_text); ini.close()
        ini_name = ini.name
    p, send, read_until = _make_engine(ini_name, variant, multipv=8 if play_margin > 0 else 1)
    out = []
    try:
        for s in seeds:
            out.append(_play_one(send, read_until, seed=s, depth=depth, book_plies=book_plies,
                                  open_depth=open_depth, k=k, margin=margin,
                                  stale_loss=stale_loss, max_plies=max_plies, play_margin=play_margin))
    finally:
        try: p.stdin.write("quit\n"); p.stdin.flush()
        except Exception: pass
        p.kill()
        if ini is not None: os.unlink(ini.name)
    return out


@app.function(timeout=120)
def smoke(ini_text: str, variant: str = "fortressxiangqi") -> str:
    p, send, read_until = _make_engine(_w(ini_text), variant)
    send("position startpos"); send("go perft 1")
    lines = read_until(lambda l: l.startswith("Nodes searched"))
    p.kill()
    return "loaded; " + next((l for l in lines if l.startswith("Nodes searched")), "?")


def _w(text):
    import tempfile
    f = tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False); f.write(text); f.close()
    return f.name


def _aggregate(label, games, stale_loss):
    n = len(games)
    draws = sum(1 for g in games if g["winner"] == "draw")
    red = sum(1 for g in games if g["winner"] == "red")
    black = sum(1 for g in games if g["winner"] == "black")
    dec = red + black
    fm = (red / dec * 100) if dec else 0
    # comeback: winner trailed by >=150 after ply 10
    cb = 0
    for g in games:
        if g["winner"] == "draw":
            continue
        e = g["evalsW"]; behind = False
        for i in range(10, len(e)):
            if g["winner"] == "red" and e[i] < -150: behind = True
            elif g["winner"] == "black" and e[i] > 150: behind = True
        if behind: cb += 1
    cbr = (cb / dec * 100) if dec else 0
    avg = round(sum(len(g["moveList"]) for g in games) / n) if n else 0
    avgbook = round(sum(g.get("book", 0) for g in games) / n) if n else 0
    print(f"[{label}] n={n} (draw {draws}, red {red}, black {black})")
    print(f"  draw%={draws/n*100:.0f}  1stMover%={fm:.0f}  comeback%={cbr:.0f}  avgPlies={avg}  avgBook={avgbook}")
    return {"label": label, "n": n, "draw_pct": draws/n*100, "first_mover_pct": fm, "comeback_pct": cbr, "avg_plies": avg, "avg_book": avgbook}


@app.local_entrypoint()
def main(variants: str = "fortressxiangqi,fortressxiangqitreasurehome",
         games: int = 200, depth: int = 16,
         book_plies: int = 4, open_depth: int = 12, k: int = 6, margin: int = 150,
         chunk: int = 2, seed: int = 1, max_plies: int = 400, play_margin: int = 0,
         ini: str = "", out: str = "", large: bool = False):
    from pathlib import Path
    import json
    base = out
    if ini == "-":
        ini_text = ""   # built-in variants only (chess, xiangqi): no VariantPath
    else:
        ini_text = (Path(ini) if ini else Path(__file__).with_name("fortress-bakeoff.ini")).read_text()
    Path(base).mkdir(parents=True, exist_ok=True)
    seeds = list(range(seed * 100000, seed * 100000 + games))
    chunks = [seeds[i:i + chunk] for i in range(0, len(seeds), chunk)]
    vlist = [v.strip() for v in variants.split(",") if v.strip()]
    print(
        f"fan-out: {vlist} x {games} games, depth {depth}, top-{k}@{margin}cp openings, "
        f"{len(chunks)} chunks/variant of {chunk} game(s), cap {MAX_CONTAINERS} containers\n"
    )
    summary = []
    for variant in vlist:
        args = [(ini_text, variant, c, depth, book_plies, open_depth, k, margin, True, max_plies, play_margin) for c in chunks]
        results = []
        runner = play_chunk_large if large else play_chunk
        for chunk_res in runner.starmap(args, return_exceptions=True):
            if isinstance(chunk_res, Exception):
                continue  # a timed-out/crashed container drops its game(s), not the whole run
            results.extend(chunk_res)
        agg = _aggregate(f"{variant} (modal, depth {depth})", results, True)
        summary.append(agg)
        Path(f"{base}/modal-games-{variant}.json").write_text(
            json.dumps({"variant": variant, "label": agg["label"], "depth": depth, "games": results}))
    print("\n=== SUMMARY ===")
    for s in summary:
        print(f"  {s['label']}: 1stMover%={s['first_mover_pct']:.0f}  draw%={s['draw_pct']:.0f}  comeback%={s['comeback_pct']:.0f}  avgPlies={s['avg_plies']}  avgBook={s['avg_book']}  (n={s['n']})")


@app.function(timeout=120, image=image_large)
def probe() -> str:
    """Does the container's FSF actually switch to a built-in variant?"""
    out = []
    for v in ("chess", "xiangqi", "minixiangqi"):
        p, send, read_until = _make_engine("", v)
        send("position startpos"); send("go perft 1")
        lines = read_until(lambda l: l.startswith("Nodes searched"))
        out.append(f"{v}: " + next((l for l in lines if l.startswith("Nodes searched")), "?"))
        p.kill()
    return " | ".join(out)


@app.local_entrypoint()
def probe_main():
    print("PROBE:", probe.remote())
