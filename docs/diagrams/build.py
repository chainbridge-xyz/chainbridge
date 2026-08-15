#!/usr/bin/env python3
"""
Builds the ChainBridge diagrams. This file is the only source of truth for them.

    python3 docs/diagrams/build.py               -> exports/*.svg
    python3 docs/diagrams/build.py --excalidraw  -> also *.excalidraw

Diagrams are defined as Excalidraw elements (plain JSON: a list of elements plus
appState, every element carrying the full property set even at defaults — hence
the helpers below rather than literal dicts), then rendered straight to SVG.

The .excalidraw form is an optional side output, useful only for hand-editing on
the Excalidraw canvas — open one at https://excalidraw.com via File -> Open, or
drag it in. Canvas edits are throwaway: the next run overwrites them. For a
change that should survive, edit this file.
"""

import json
import math
import pathlib
import sys
import xml.sax.saxutils as sax

OUT = pathlib.Path(__file__).parent

# ── Palette ────────────────────────────────────────────────────────────────
# Shares the documentation site's tokens (chainbridge-docs, app/globals.css) so exported
# diagrams sit on the page without a colour clash. Diagrams always render on a
# light plate in both themes, so these are the light-theme values.
#
# Only three hues carry meaning. Everything else is encoded by fill and stroke
# style instead — fewer hues read as more deliberate, and stay legible when a
# diagram is projected or printed:
#
#   petrol  filled   ChainBridge's own code
#   bronze  filled   on-chain, settled, proven
#   ink     outline  actors and external systems
#   dim     dashed   designed but not built
#   crimson filled   a constraint or a rejected path
INK      = "#0D1517"
DIM      = "#5D7071"
PETROL   = "#0A5F63"; PETROL_BG = "#DDEAE9"
BRONZE   = "#8A5A0F"; BRONZE_BG = "#F2E7D3"
CRIMSON  = "#9B2C2C"; CRIMSON_BG = "#F6DEDE"
PLATE    = "#FFFFFF"

# Aliases kept so the diagram bodies below read semantically.
BLUE, BLUE_BG     = INK, PLATE          # client / off-chain — outlined, not filled
GREEN, GREEN_BG   = BRONZE, BRONZE_BG   # on-chain
VIOLET, VIOLET_BG = PETROL, PETROL_BG   # ChainBridge code
AMBER, AMBER_BG   = DIM, "#EDF1F0"      # third-party service
RED, RED_BG       = CRIMSON, CRIMSON_BG

HAND, SANS, CODE = 2, 2, 3  # fontFamily ids — clean sans to match the docs type

_seed = [1000]


def _next_seed():
    _seed[0] += 7717
    return _seed[0]


def _base(el_type, x, y, w, h, **kw):
    e = {
        "id": kw.pop("id"),
        "type": el_type,
        "x": x, "y": y, "width": w, "height": h,
        "angle": 0,
        "strokeColor": kw.pop("stroke", INK),
        "backgroundColor": kw.pop("bg", "transparent"),
        "fillStyle": kw.pop("fill", "solid"),
        "strokeWidth": kw.pop("sw", 2),
        "strokeStyle": kw.pop("ss", "solid"),
        # roughness 0 = "architect" — clean lines. The sketchy default reads as
        # a whiteboard doodle next to the docs page's engineered typography.
        "roughness": kw.pop("roughness", 0),
        "opacity": kw.pop("opacity", 100),
        "groupIds": kw.pop("groupIds", []),
        "frameId": None,
        "roundness": kw.pop("roundness", None),
        "seed": _next_seed(),
        "version": 1,
        "versionNonce": _next_seed(),
        "isDeleted": False,
        "boundElements": kw.pop("boundElements", []),
        "updated": 1,
        "link": None,
        "locked": False,
    }
    e.update(kw)
    return e


def box(eid, x, y, w, h, label, *, stroke=INK, bg="transparent", font=HAND,
        size=16, ss="solid", sw=2, shape="rectangle"):
    """A rectangle (or diamond/ellipse) with a bound, auto-wrapping text label."""
    tid = eid + "_t"
    roundness = {"type": 3} if shape == "rectangle" else {"type": 2}
    if shape == "ellipse":
        roundness = None
    rect = _base(shape, x, y, w, h, id=eid, stroke=stroke, bg=bg, ss=ss, sw=sw,
                 roundness=roundness, boundElements=[{"id": tid, "type": "text"}])
    text = _base("text", x + 8, y + h / 2 - size / 2, w - 16, size * 1.25,
                 id=tid, stroke=stroke, roundness=None,
                 text=label, fontSize=size, fontFamily=font,
                 textAlign="center", verticalAlign="middle",
                 containerId=eid, originalText=label, lineHeight=1.25,
                 autoResize=False)
    return [rect, text]


def note(eid, x, y, text, *, stroke=DIM, size=14, font=HAND, align="left", w=None):
    """Free-standing text, not bound to any container."""
    lines = text.split("\n")
    width = w or max(len(l) for l in lines) * size * 0.58
    height = len(lines) * size * 1.25
    return [_base("text", x, y, width, height, id=eid, stroke=stroke, roundness=None,
                  text=text, fontSize=size, fontFamily=font,
                  textAlign=align, verticalAlign="top",
                  containerId=None, originalText=text, lineHeight=1.25,
                  autoResize=True)]


def arrow(eid, x, y, points, *, stroke=INK, ss="solid", sw=2, label=None,
          size=13, start_head=None, end_head="arrow"):
    """Arrow through `points`, relative to (x, y). Optional bound label."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    bound = []
    els = []
    if label:
        tid = eid + "_t"
        bound = [{"id": tid, "type": "text"}]
    a = _base("arrow", x, y, w, h, id=eid, stroke=stroke, ss=ss, sw=sw,
              roundness={"type": 2}, boundElements=bound,
              points=[list(p) for p in points], lastCommittedPoint=None,
              startBinding=None, endBinding=None,
              startArrowhead=start_head, endArrowhead=end_head,
              elbowed=False)
    els.append(a)
    if label:
        mx, my = x + w / 2, y + h / 2
        els.append(_base("text", mx - 40, my - size, 80, size * 1.25,
                         id=eid + "_t", stroke=stroke, roundness=None,
                         text=label, fontSize=size, fontFamily=HAND,
                         textAlign="center", verticalAlign="middle",
                         containerId=eid, originalText=label, lineHeight=1.25,
                         autoResize=False))
    return els


def title(eid, x, y, text, sub=None):
    els = note(eid, x, y, text, stroke=INK, size=28, font=HAND)
    if sub:
        els += note(eid + "_s", x, y + 40, sub, stroke=DIM, size=15, font=SANS)
    return els


def frame(eid, x, y, w, h, *, stroke=DIM, bg="transparent", ss="dashed"):
    return [_base("rectangle", x, y, w, h, id=eid, stroke=stroke, bg=bg,
                  ss=ss, sw=1, roundness={"type": 3}, opacity=100)]


# ── SVG output ─────────────────────────────────────────────────────────────
# Rendering lives here rather than in a separate pass over .excalidraw files:
# the diagrams are drawn in architect mode (roughness 0), so there is no sketch
# simulation to reproduce and the geometry above is already the final geometry.
# The .excalidraw form is only useful for hand-editing on the Excalidraw canvas,
# so it is written on request (--excalidraw) instead of every run.

PAD = 28
# The SVG is embedded as an <img>, which is an isolated document — the docs
# page's fonts don't reach inside it. Ask for a system stack explicitly rather
# than inherit a serif default.
# Named *_STACK to avoid colliding with the SANS/CODE fontFamily ids above.
SANS_STACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO_STACK = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
ADVANCE = {2: 0.52, 3: 0.60}  # advance width per char, as a fraction of size


def _font(family):
    return MONO_STACK if family == 3 else SANS_STACK


def _tw(s, size, family):
    return len(s) * size * ADVANCE.get(family, 0.52)


def _wrap(text, size, family, max_w):
    out = []
    for para in text.split("\n"):
        if _tw(para, size, family) <= max_w or " " not in para:
            out.append(para)
            continue
        line = ""
        for word in para.split(" "):
            trial = f"{line} {word}".strip()
            if _tw(trial, size, family) <= max_w or not line:
                line = trial
            else:
                out.append(line)
                line = word
        if line:
            out.append(line)
    return out


def _dash(el):
    if el["strokeStyle"] == "dashed":
        return ' stroke-dasharray="8 6"'
    if el["strokeStyle"] == "dotted":
        return ' stroke-dasharray="2 5" stroke-linecap="round"'
    return ""


def _svg_rect(el):
    fill = el["backgroundColor"] if el["fillStyle"] == "solid" else "none"
    if fill == "transparent":
        fill = "none"
    r = min(32, min(el["width"], el["height"]) * 0.25) if el.get("roundness") else 0
    return (f'<rect x="{el["x"]:.1f}" y="{el["y"]:.1f}" width="{el["width"]:.1f}" '
            f'height="{el["height"]:.1f}" rx="{r:.1f}" fill="{fill}" '
            f'stroke="{el["strokeColor"]}" stroke-width="{el["strokeWidth"]}"{_dash(el)}/>')


def _svg_text(el, by_id):
    size, fam = el["fontSize"], el["fontFamily"]
    lh = el.get("lineHeight", 1.25)
    box = by_id.get(el.get("containerId")) if el.get("containerId") else None
    pre = []

    if box and box["type"] == "rectangle":
        lines = _wrap(el["text"], size, fam, box["width"] - 16)
        x, anchor = box["x"] + box["width"] / 2, "middle"
        top = box["y"] + (box["height"] - len(lines) * size * lh) / 2
    elif box and box["type"] == "arrow":
        pts = box["points"]
        x = box["x"] + (pts[0][0] + pts[-1][0]) / 2
        my = box["y"] + (pts[0][1] + pts[-1][1]) / 2
        lines, anchor = el["text"].split("\n"), "middle"
        top = my - len(lines) * size * lh / 2
        w = max(_tw(l, size, fam) for l in lines) + 10
        # Break the arrow line behind its own label.
        pre.append(f'<rect x="{x - w/2:.1f}" y="{top - 2:.1f}" width="{w:.1f}" '
                   f'height="{len(lines)*size*lh + 4:.1f}" fill="{PLATE}"/>')
    else:
        lines = el["text"].split("\n")
        anchor = {"center": "middle", "right": "end"}.get(el.get("textAlign"), "start")
        x = el["x"] + (el["width"] / 2 if anchor == "middle" else 0)
        top = el["y"]

    pre.append(f'<text x="{x:.1f}" y="{top:.1f}" fill="{el["strokeColor"]}" '
               f'font-family="{_font(fam)}" font-size="{size}" '
               f'text-anchor="{anchor}" xml:space="preserve">')
    for i, line in enumerate(lines):
        dy = size * 0.82 if i == 0 else size * lh
        pre.append(f'<tspan x="{x:.1f}" dy="{dy:.1f}">{sax.escape(line)}</tspan>')
    pre.append("</text>")
    return "".join(pre)


def _svg_arrow(el):
    pts = [(el["x"] + p[0], el["y"] + p[1]) for p in el["points"]]
    out = [f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" '
           f'fill="none" stroke="{el["strokeColor"]}" stroke-width="{el["strokeWidth"]}" '
           f'stroke-linecap="round" stroke-linejoin="round"{_dash(el)}/>']
    if el.get("endArrowhead") == "arrow" and len(pts) >= 2:
        (x0, y0), (x1, y1) = pts[-2], pts[-1]
        ang = math.atan2(y1 - y0, x1 - x0)
        for s in (+1, -1):
            ax = x1 - 13 * math.cos(ang + s * math.radians(26))
            ay = y1 - 13 * math.sin(ang + s * math.radians(26))
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{ax:.1f}" y2="{ay:.1f}" '
                       f'stroke="{el["strokeColor"]}" stroke-width="{el["strokeWidth"]}" '
                       f'stroke-linecap="round"/>')
    return "".join(out)


def to_svg(name, elements):
    by_id = {e["id"]: e for e in elements}
    xs, ys = [], []
    for el in elements:
        if el["type"] == "arrow":
            for p in el["points"]:
                xs.append(el["x"] + p[0]); ys.append(el["y"] + p[1])
        else:
            xs += [el["x"], el["x"] + el["width"]]
            ys += [el["y"], el["y"] + el["height"]]
    x0, y0 = min(xs) - PAD, min(ys) - PAD
    w, h = max(xs) - min(xs) + PAD * 2, max(ys) - min(ys) + PAD * 2

    # Shapes and arrows first, then every label, so no text is overdrawn.
    body = [_svg_rect(e) if e["type"] == "rectangle" else _svg_arrow(e)
            for e in elements if e["type"] in ("rectangle", "arrow")]
    body += [_svg_text(e, by_id) for e in elements if e["type"] == "text"]

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
            f'viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" role="img" '
            f'aria-label="{sax.escape(name)}">' + "".join(body) + "</svg>")


def to_excalidraw(elements):
    return json.dumps({
        "type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
        "elements": elements,
        "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
        "files": {},
    }, indent=2)


# ── 01 · System overview ───────────────────────────────────────────────────
def system_overview():
    e = []
    e += title("t", 60, 40, "ChainBridge — system overview",
               "What an agent touches, and which layer owns it.")

    e += box("agent", 380, 140, 240, 60, "Autonomous agent",
             stroke=BLUE, bg=BLUE_BG, size=18)

    # SDK band
    e += frame("sdk", 60, 260, 880, 190, stroke=VIOLET)
    e += note("sdk_l", 76, 272, "ChainBridge SDK", stroke=VIOLET, size=15)

    mods = [
        ("identity",   90,  "identity",   "registry\nread / write", "planned"),
        ("wallet",     262, "wallet",     "ERC-4337\nsmart accounts", "v0.1"),
        ("pay",        434, "pay",        "x402 +\nEIP-3009", "v0.1"),
        ("reputation", 606, "reputation", "attestations", "planned"),
        ("bridge",     778, "bridge",     "MCP / A2A", "planned"),
    ]
    for eid, x, name, desc, status in mods:
        shipped = status == "v0.1"
        e += box(eid, x, 310, 150, 62, name,
                 stroke=VIOLET if shipped else DIM,
                 bg=VIOLET_BG if shipped else "transparent",
                 font=CODE, size=15,
                 ss="solid" if shipped else "dashed")
        e += note(eid + "_d", x + 8, 380, desc, stroke=DIM, size=12)
        e += note(eid + "_s", x + 8, 288, status,
                  stroke=VIOLET if shipped else DIM, size=11)

    # Chain band
    e += frame("chain", 60, 510, 880, 150, stroke=GREEN)
    e += note("chain_l", 76, 522, "Base  (Base Sepolia today)", stroke=GREEN, size=15)

    chain = [
        ("ep",  90,  "EntryPoint v0.7"),
        ("safe", 262, "Safe v1.4.1"),
        ("usdc", 434, "USDC"),
        ("reg",  606, "Identity Registry"),
        ("pm",   778, "Paymaster"),
    ]
    for eid, x, name in chain:
        e += box(eid, x, 560, 150, 56, name, stroke=GREEN, bg=GREEN_BG, size=13)

    e += arrow("a1", 500, 205, [(0, 0), (0, 50)], stroke=BLUE)
    e += arrow("a2", 500, 455, [(0, 0), (0, 50)], stroke=VIOLET)

    e += note("legend", 60, 700,
              "Filled petrol = ChainBridge code.    Filled bronze = on-chain.    Dashed = designed, not built.\n"
              "The wedge is wallet + pay; everything else waits on customer input.",
              stroke=DIM, size=13, font=SANS)
    return e


# ── 02 · x402 payment flow ─────────────────────────────────────────────────
def x402_flow():
    e = []
    e += title("t", 60, 40, "x402 payment flow",
               "One paid HTTP request, end to end. Round trip measured at under 2 seconds.")

    lanes = [("Agent", 100, BLUE, BLUE_BG), ("Seller API", 460, AMBER, AMBER_BG),
             ("USDC on Base", 820, GREEN, GREEN_BG)]
    for name, x, stroke, bg in lanes:
        e += box("lane_" + name[:4], x, 130, 220, 52, name, stroke=stroke, bg=bg, size=16)
        # Lifelines — without them the message arrows float free of their sender.
        e += arrow("life_" + name[:4], x + 110, 190, [(0, 0), (0, 500)],
                   stroke=DIM, ss="dashed", sw=1, end_head=None)

    steps = [
        (215, "GET /inference",           100, 460, BLUE),
        (285, "402 + requirements",       460, 100, AMBER),
        (430, "retry + X-PAYMENT",        100, 460, BLUE),
        (500, "transferWithAuthorization", 460, 820, AMBER),
        (570, "settled",                  820, 460, GREEN),
        (640, "200 OK + receipt",         460, 100, AMBER),
    ]
    for i, (y, label, fx, tx, colour) in enumerate(steps):
        x0, x1 = fx + 110, tx + 110
        e += arrow(f"s{i}", x0, y, [(0, 0), (x1 - x0, 0)], stroke=colour, label=label)

    # The signing step happens inside the agent, between 402 and retry.
    e += box("sign", 60, 330, 300, 76,
             "sign EIP-3009 authorization\n(EOA, offline)", stroke=BLUE, bg="transparent",
             ss="dashed", size=13)

    e += note("n1", 620, 320,
              "Nothing is on-chain yet — the\n402 body is just requirements.",
              stroke=DIM, size=12)
    e += note("n2", 620, 600,
              "83,208 gas per settlement.\nSettled in the next block.",
              stroke=GREEN, size=12)

    e += box("warn", 100, 720, 940, 70,
             "The signer must be an EOA. USDC verifies with ecrecover, so a smart account cannot sign EIP-3009.",
             stroke=RED, bg=RED_BG, size=14)
    return e


# ── 03 · Wallet provisioning ───────────────────────────────────────────────
def wallet_flow():
    e = []
    e += title("t", 60, 40, "Smart account provisioning",
               "How @chainbridge/wallet turns an EOA into a deployed Safe. First UserOp deploys it.")

    e += box("owner", 60, 150, 200, 60, "Owner EOA", stroke=BLUE, bg=BLUE_BG, size=16)

    e += box("derive", 320, 140, 260, 80,
             "computeSafeAddress()\npure CREATE2 — no RPC", stroke=VIOLET, bg=VIOLET_BG, font=CODE, size=13)
    e += arrow("a1", 262, 180, [(0, 0), (56, 0)], stroke=BLUE)

    e += box("addr", 640, 140, 300, 80,
             "address known\nbefore anything exists on-chain", stroke=VIOLET, size=13)
    e += arrow("a2", 582, 180, [(0, 0), (56, 0)], stroke=VIOLET)

    e += note("n1", 640, 232, "Show it. Fund it. Store it.", stroke=DIM, size=12)

    # Build pipeline — the ordering is the point.
    e += frame("pipe", 60, 300, 880, 210, stroke=VIOLET)
    e += note("pipe_l", 76, 312, "provision()  ·  order matters", stroke=VIOLET, size=15)

    stages = [
        ("p1", 90,  "estimate\nfees + nonce"),
        ("p2", 300, "ask paymaster\nto sponsor"),
        ("p3", 510, "estimate gas\nlimits"),
        ("p4", 720, "sign SafeOp\nEIP-712"),
    ]
    for eid, x, label in stages:
        e += box(eid, x, 360, 190, 76, label, stroke=VIOLET, bg=VIOLET_BG, size=13)
    for i in range(3):
        x0 = stages[i][1] + 190
        e += arrow(f"pa{i}", x0, 398, [(0, 0), (20, 0)], stroke=VIOLET)

    e += box("order", 90, 456, 820, 40,
             "Sponsor BEFORE signing — paymaster fields are inside the signed digest.",
             stroke=RED, bg=RED_BG, size=13)

    e += box("bundler", 60, 570, 200, 66, "Bundler", stroke=AMBER, bg=AMBER_BG, size=15)
    e += box("ep", 320, 570, 200, 66, "EntryPoint v0.7", stroke=GREEN, bg=GREEN_BG, size=14)
    e += box("factory", 580, 570, 200, 66, "SafeProxyFactory", stroke=GREEN, bg=GREEN_BG, size=13)
    e += box("safe", 840, 570, 200, 66, "Safe deployed", stroke=GREEN, bg=GREEN_BG, size=14)

    e += arrow("b0", 160, 512, [(0, 0), (0, 50)], stroke=VIOLET)
    for i, x in enumerate([262, 522, 782]):
        e += arrow(f"b{i+1}", x, 603, [(0, 0), (56, 0)], stroke=GREEN)

    e += note("n2", 60, 670,
              "Measured on Base Sepolia:  409,504 gas to deploy, included 3.6s after submission,\n"
              "fully paymaster-sponsored — the owner EOA paid zero. A later no-op UserOp cost 146,991.",
              stroke=DIM, size=13, font=SANS)
    return e


# ── 04 · The EIP-3009 signer constraint ────────────────────────────────────
def signer_constraint():
    e = []
    e += title("t", 60, 40, "Why the EOA signs, not the smart account",
               "The single most load-bearing constraint the spike surfaced.")

    e += box("usdc", 400, 420, 280, 90,
             "USDC\ntransferWithAuthorization", stroke=GREEN, bg=GREEN_BG, size=15)
    # A caption on the box, not a box of its own — boxing it would imply a step.
    e += note("ecr", 400, 522, "verifies with ecrecover", stroke=GREEN, font=CODE, size=13)

    e += box("sa", 60, 170, 300, 90,
             "Smart account\n(Safe, ERC-1271)", stroke=RED, bg=RED_BG, size=15)
    e += arrow("bad", 210, 262, [(0, 0), (190, 150)], stroke=RED, ss="dashed")
    # Plain labels, set clear of the arrow path — a boxed label here reads as a
    # step in the flow, which is exactly what these are not.
    e += note("badx", 95, 338, "cannot sign", stroke=RED, size=15)

    # The working path reads as endorsed, not merely neutral — petrol is the
    # colour the rest of the set uses for "this is what ChainBridge does".
    e += box("eoa", 720, 170, 300, 90,
             "Owner EOA\n(ECDSA key)", stroke=PETROL, bg=PETROL_BG, size=15)
    e += arrow("good", 870, 262, [(0, 0), (-190, 150)], stroke=PETROL)
    e += note("goodx", 900, 338, "signs", stroke=PETROL, size=15)

    e += note("why", 60, 640,
              "A contract has no private key. ERC-1271 lets it declare a signature valid, but USDC never asks —\n"
              "it recovers an address from v, r, s and compares. So the account holding USDC must be an EOA.",
              stroke=DIM, size=14, font=SANS)

    e += frame("impl", 60, 730, 960, 130, stroke=VIOLET)
    e += note("impl_l", 76, 742, "What this means for the SDK", stroke=VIOLET, size=15)
    e += note("impl_b", 80, 776,
              "·  The EOA holds USDC and signs every payment.\n"
              "·  The smart account is used for everything that is not an EIP-3009 transfer.\n"
              "·  Routing payments through a UserOp instead is a Phase 2 investigation, not a v0.1 problem.",
              stroke=INK, size=13, font=SANS)
    return e


# ── 05 · Settlement models ─────────────────────────────────────────────────
def settlement_models():
    e = []
    e += title("t", 60, 40, "Settlement models",
               "ADR-004. Facilitator is the default; self-host is the enterprise opt-out.")

    # Option A
    e += frame("a", 60, 130, 440, 420, stroke=AMBER)
    e += note("a_l", 78, 144, "Option A — self-host, synchronous", stroke=AMBER, size=16)
    e += note("a_s", 78, 172, "ships today  ·  opt-out for enterprise", stroke=DIM, size=12)

    e += box("a1", 90, 210, 380, 54, "Seller receives X-PAYMENT", stroke=AMBER, bg=AMBER_BG, size=13)
    e += box("a2", 90, 300, 380, 54, "Seller submits to USDC itself", stroke=AMBER, bg=AMBER_BG, size=13)
    e += box("a3", 90, 390, 380, 54, "Seller pays the gas, waits for the block", stroke=AMBER, size=13)
    e += arrow("aa1", 280, 266, [(0, 0), (0, 30)], stroke=AMBER)
    e += arrow("aa2", 280, 356, [(0, 0), (0, 30)], stroke=AMBER)
    e += note("a_n", 90, 466, "Simple. No third party.\nEvery payment pays full gas.", stroke=DIM, size=12)

    # Option C
    e += frame("c", 560, 130, 460, 420, stroke=VIOLET)
    e += note("c_l", 578, 144, "Option C — ChainBridge facilitator", stroke=VIOLET, size=16)
    e += note("c_s", 578, 172, "the default", stroke=VIOLET, size=12)

    e += box("c1", 590, 210, 400, 54, "Seller forwards the authorization", stroke=VIOLET, bg=VIOLET_BG, size=13)
    e += box("c2", 590, 300, 400, 54, "ChainBridge batches N payments", stroke=VIOLET, bg=VIOLET_BG, size=13)
    e += box("c3", 590, 390, 400, 54, "One settlement tx, gas split N ways", stroke=VIOLET, bg=VIOLET_BG, size=13)
    e += arrow("ca1", 790, 266, [(0, 0), (0, 30)], stroke=VIOLET)
    e += arrow("ca2", 790, 356, [(0, 0), (0, 30)], stroke=VIOLET)
    e += note("c_n", 590, 466, "Batching is where the margin lives.\n0.3% take rate stays viable.", stroke=DIM, size=12)

    e += frame("econ", 60, 590, 960, 150, stroke=GREEN)
    e += note("econ_l", 78, 604, "Measured economics — Base Sepolia", stroke=GREEN, size=15)
    e += note("econ_b", 82, 638,
              "83,208 gas per settlement  ≈  $0.001 at current Base gas.\n"
              "Unbatched:  $1 payment  ->  $0.003 fee  ->  ~$0.002 net.\n"
              "Batched x10:  gas drops ~10x  ->  ~$0.0029 net per payment.",
              stroke=INK, size=13, font=SANS)

    e += box("rej", 60, 780, 960, 44,
             "Option B (on-chain escrow per payment) rejected — gas cost destroys the unit economics.",
             stroke=RED, bg=RED_BG, size=13)
    return e


# ── 06 · Identity registry ─────────────────────────────────────────────────
def identity_flow():
    e = []
    e += title("t", 60, 40, "Agent identity",
               "ChainBridgeIdentityRegistry — minimal, ERC-8004-shaped, live on Base Sepolia.")

    e += box("ctrl", 60, 160, 240, 60, "controller address", stroke=BLUE, bg=BLUE_BG, size=15)
    e += box("nonce", 60, 250, 240, 60, "per-controller nonce", stroke=BLUE, bg=BLUE_BG, size=15)

    e += box("hash", 380, 195, 280, 80,
             "keccak256(\n  abi.encode(controller, nonce))", stroke=VIOLET, bg=VIOLET_BG, font=CODE, size=12)
    e += arrow("h1", 302, 190, [(0, 0), (76, 25)], stroke=BLUE)
    e += arrow("h2", 302, 280, [(0, 0), (76, -25)], stroke=BLUE)

    e += box("id", 740, 195, 300, 80, "agentId\nknown before the tx confirms",
             stroke=VIOLET, bg=VIOLET_BG, size=14)
    e += arrow("h3", 662, 235, [(0, 0), (76, 0)], stroke=VIOLET)

    e += frame("chain", 60, 350, 980, 250, stroke=GREEN)
    e += note("chain_l", 78, 364, "On-chain  ·  0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2", stroke=GREEN, size=14)

    e += box("reg", 90, 410, 280, 60, "register(name, caps, endpoint)", stroke=GREEN, bg=GREEN_BG, font=CODE, size=11)
    e += box("store", 420, 410, 240, 60, "AgentInfo stored", stroke=GREEN, bg=GREEN_BG, size=14)
    e += box("res", 710, 410, 300, 60, "resolve(agentId) -> AgentInfo", stroke=GREEN, bg=GREEN_BG, font=CODE, size=11)
    e += arrow("r1", 372, 440, [(0, 0), (46, 0)], stroke=GREEN)
    e += arrow("r2", 662, 440, [(0, 0), (46, 0)], stroke=GREEN)

    e += note("gas", 90, 500,
              "register  253,385 gas        deploy  938,775 gas        9 tests incl. fuzz, source verified",
              stroke=DIM, size=13, font=SANS)

    e += note("why", 60, 640,
              "Why a per-controller nonce, and not the obvious alternatives:\n\n"
              "·  keccak(controller, timestamp) — the spike's version — collides for two agents in one block.\n"
              "·  A global sequential uint256 leaks total supply and blocks one controller holding many agents.\n"
              "·  The nonce is readable, so the id is counterfactual: the SDK returns it before the tx lands,\n"
              "   exactly as wallet addresses already behave.",
              stroke=INK, size=13, font=SANS)
    return e


DIAGRAMS = [
    ("01-system-overview", system_overview),
    ("02-x402-payment-flow", x402_flow),
    ("03-wallet-provisioning", wallet_flow),
    ("04-eip3009-signer-constraint", signer_constraint),
    ("05-settlement-models", settlement_models),
    ("06-identity-registry", identity_flow),
]

if __name__ == "__main__":
    also_excalidraw = "--excalidraw" in sys.argv
    EXPORTS = OUT / "exports"
    EXPORTS.mkdir(exist_ok=True)

    print("Building diagrams:")
    for name, fn in DIAGRAMS:
        _seed[0] = 1000  # deterministic output — no diff unless content changed
        els = fn()
        svg = to_svg(name, els)
        (EXPORTS / f"{name}.svg").write_text(svg)
        line = f"  {name + '.svg':38} {len(els):3} el   {len(svg.encode()):>6,} B"
        if also_excalidraw:
            (OUT / f"{name}.excalidraw").write_text(to_excalidraw(els))
            line += "   + .excalidraw"
        print(line)

    print(f"\n{len(DIAGRAMS)} SVGs -> {EXPORTS}")
    if also_excalidraw:
        print("Also wrote .excalidraw files — open them at https://excalidraw.com")
    else:
        print("Pass --excalidraw to also emit editable canvas files.")
