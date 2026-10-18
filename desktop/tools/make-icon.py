"""desktop/papernotes.ico from the PaperNotes logo (assets/brand/papernotes-logo.png):
trimmed to the artwork, squared, a hair of padding, every size Windows asks for.
   python desktop/tools/make-icon.py"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
im = Image.open(root / 'assets/brand/papernotes-logo.png').convert('RGBA')
# Trim by alpha: the file's fully transparent pixels still carry colour, and
# getbbox() on RGBA counts those, which left the icon small inside its frame.
im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
w, h = im.size
s = max(w, h)
sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
sq.paste(im, ((s - w) // 2, (s - h) // 2))
pad = int(s * 0.02)
out = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0))
out.paste(sq, (pad, pad))
sizes = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)]
out.save(root / 'desktop/papernotes.ico', sizes=sizes)
preview = Image.new('RGBA', (16 + 32 + 48 + 64 + 40, 64), (40, 40, 40, 255))
x = 4
for n in (16, 32, 48, 64):
    preview.alpha_composite(out.resize((n, n), Image.LANCZOS), (x, 64 - n))
    x += n + 8
preview.save(root / 'desktop/test/out/icon-preview.png')
print('wrote desktop/papernotes.ico')
