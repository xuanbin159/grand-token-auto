"""Draw the cartoon hero: assets/face.webp and assets/bust.webp.

face.webp: 300x364 RGBA, 3/4 view turned to the viewer's left. The eyes sit at face-image px
(50,148) and (142,158), where the in-game glasses and hats are anchored (see drawGlasses / drawHat).
bust.webp: 456x528 title-screen poster of the same character.
Usage: python3 scripts/draw_hero.py <out_dir>   (needs Pillow)
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
K = 4  # supersampling

SKIN, SKIN_SH, HAIR, HAIR_HI = (243, 199, 160, 255), (226, 170, 128, 255), (29, 31, 38, 255), (70, 76, 92, 255)
INK, WHITE, IRIS = (26, 26, 31, 255), (255, 255, 255, 255), (60, 42, 30, 255)
MOUTH, TONGUE = (122, 31, 43, 255), (224, 88, 106, 255)


def P(pts):
    return [(x * K, y * K) for x, y in pts]


def ell(d, cx, cy, rx, ry, fill=None, outline=None, width=0):
    d.ellipse([(cx - rx) * K, (cy - ry) * K, (cx + rx) * K, (cy + ry) * K], fill=fill, outline=outline, width=width * K)


def face(w=300, h=364):
    im = Image.new('RGBA', (w * K, h * K), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # hair mass behind the head, a little further back on the right (3/4 view)
    ell(d, 166, 150, 132, 134, fill=HAIR)
    ell(d, 232, 228, 58, 92, fill=HAIR)
    # ear
    ell(d, 246, 206, 21, 33, fill=SKIN, outline=INK, width=5)
    d.arc([(238) * K, (186) * K, (256) * K, (226) * K], 110, 260, fill=SKIN_SH, width=5 * K)
    # face
    ell(d, 118, 208, 112, 138, fill=SKIN, outline=INK, width=5)
    # blush
    blush = Image.new('RGBA', im.size, (0, 0, 0, 0)); bd = ImageDraw.Draw(blush)
    ell(bd, 30, 222, 16, 9, fill=(255, 110, 120, 110)); ell(bd, 176, 236, 21, 11, fill=(255, 110, 120, 110))
    im.alpha_composite(blush.filter(ImageFilter.GaussianBlur(3 * K)))
    d = ImageDraw.Draw(im)
    # spiky fringe
    fringe = [(2, 168), (4, 112), (22, 70), (60, 38), (112, 22), (172, 20), (228, 34), (268, 70), (286, 118), (266, 116), (246, 100), (232, 132),
              (210, 102), (190, 128), (168, 98), (150, 126), (130, 96), (110, 122), (90, 92), (72, 120), (54, 94), (38, 126), (24, 102), (12, 146)]
    d.polygon(P(fringe), fill=HAIR)
    d.line(P(fringe + [fringe[0]]), fill=INK, width=5 * K, joint='curve')
    d.line(P([(92, 46), (132, 36), (176, 38)]), fill=HAIR_HI, width=5 * K, joint='curve')
    # brows: determined, inner ends lower
    d.line(P([(24, 110), (70, 120)]), fill=INK, width=11 * K); d.line(P([(114, 126), (174, 112)]), fill=INK, width=12 * K)
    for x, y, r in [(24, 110, 5.5), (70, 120, 5.5), (114, 126, 6), (174, 112, 6)]:
        ell(d, x, y, r, r, fill=INK)
    # eyes at the photo's eye positions, looking a little left
    for (cx, cy), (rx, ry), (px, py, pr), (hx, hy, hr) in [((50, 148), (17, 21), (45, 152, 10), (41, 146, 4)), ((142, 158), (22, 25), (135, 162, 12), (130, 155, 5))]:
        ell(d, cx, cy, rx, ry, fill=WHITE, outline=INK, width=4)
        ell(d, px, py, pr, pr, fill=IRIS); ell(d, px, py, pr * 0.55, pr * 0.55, fill=INK); ell(d, hx, hy, hr, hr, fill=WHITE)
    # nose pointing left
    d.line(P([(96, 170), (84, 196), (78, 214), (90, 222), (104, 218)]), fill=INK, width=5 * K, joint='curve')
    # big confident grin
    grin = [(46, 256), (70, 262), (100, 266), (130, 268), (152, 264), (146, 282), (128, 298), (100, 306), (74, 300), (56, 284)]
    d.polygon(P(grin), fill=MOUTH)
    d.polygon(P([(52, 260), (152, 266), (148, 276), (54, 270)]), fill=WHITE)
    d.polygon(P([(78, 294), (100, 288), (126, 292), (110, 304), (90, 304)]), fill=TONGUE)
    d.line(P(grin + [grin[0]]), fill=INK, width=5 * K, joint='curve')
    d.line(P([(40, 250), (48, 258)]), fill=INK, width=4 * K); d.line(P([(150, 258), (158, 266)]), fill=INK, width=4 * K)
    return im.resize((w, h), Image.LANCZOS)


def bust(face_img, w=456, h=528):
    # the title panel crops this with object-fit: cover (about the middle 60% vertically), so keep the hero in the centre band
    im = Image.new('RGBA', (w * K, h * K), (15, 22, 40, 255))
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    for k in range(18):
        r = 250 - k * 12; a = 10 + k * 3
        ell(gd, 228, 240, r, r, fill=(43, 63, 107, min(255, a)))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(20 * K)))
    d = ImageDraw.Draw(im)
    ell(d, 228, 232, 146, 146, outline=(242, 194, 51, 150), width=9)
    ell(d, 228, 232, 130, 130, outline=(242, 194, 51, 70), width=4)
    # T-shirt, shoulders, neck
    shirt = [(24, h), (40, 460), (80, 418), (156, 392), (228, 388), (300, 392), (376, 418), (416, 460), (432, h)]
    d.polygon(P(shirt), fill=(23, 25, 30, 255))
    d.line(P(shirt), fill=INK, width=5 * K, joint='curve')
    d.polygon(P([(202, 346), (254, 346), (256, 394), (228, 410), (200, 394)]), fill=SKIN)
    d.line(P([(200, 394), (228, 410), (256, 394)]), fill=INK, width=5 * K, joint='curve')
    ell(d, 228, 398, 40, 17, outline=(60, 64, 74, 255), width=5)
    # teal token print on the chest
    ell(d, 158, 474, 34, 34, fill=(43, 179, 168, 255), outline=(20, 110, 104, 255), width=5)
    d.polygon(P([(139, 458), (177, 458), (177, 467), (162, 467), (162, 495), (154, 495), (154, 467), (139, 467)]), fill=(23, 25, 30, 255))
    im = im.resize((w, h), Image.LANCZOS)
    f = face_img.resize((216, 262), Image.LANCZOS)
    rim = Image.new('RGBA', (f.width + 14, f.height + 14), (0, 0, 0, 0))
    a = f.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    sil = Image.new('RGBA', f.size, (255, 255, 255, 255)); sil.putalpha(a)
    for dx in range(0, 15, 2):
        for dy in range(0, 15, 2):
            if (dx - 7) ** 2 + (dy - 7) ** 2 <= 49:
                rim.alpha_composite(sil, (dx, dy))
    im.alpha_composite(rim, (228 - rim.width // 2, 94))
    im.alpha_composite(f, (228 - f.width // 2, 101))
    return im.convert('RGB')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    f = face()
    f.save(OUT / 'face.webp', 'WEBP', lossless=True)
    bust(f).save(OUT / 'bust.webp', 'WEBP', quality=90)
    # previews for eyeballing
    prev = Image.new('RGBA', (300, 364), (200, 230, 200, 255)); prev.alpha_composite(f); prev.convert('RGB').save(OUT / '_face_preview.png')
    print('ok', (OUT / 'face.webp').stat().st_size, (OUT / 'bust.webp').stat().st_size)
