"""Render every home-screen icon choice as real PNGs (Android needs them).

    python tools/make-icons.py

Reads config.js (through node) and writes icons/choices/<id>-192.png and
-512.png for each selfie, each icon photo and each colour icon, plus the
default icons/icon-180/192/512.png from the first selfie. Run it again after
changing selfies, iconPhotos or iconText.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
cfg = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./config.js')))"]))
os.makedirs('icons/choices', exist_ok=True)

PREMADE = {'blush': ('#c4513f', '#ffffff'), 'cream': ('#fbf7f4', '#c4513f'), 'sage': ('#4f7a55', '#ffffff'),
           'sky': ('#2f6db5', '#ffffff'), 'night': ('#131115', '#f08a76')}

def square(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    w, h = im.size; s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))

def save(im, name, sizes=(192, 512)):
    for s in sizes:
        im.resize((s, s), Image.LANCZOS).save(f'icons/choices/{name}-{s}.png')

def font(size):
    for f in ['C:/Windows/Fonts/georgiab.ttf', '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
              '/Library/Fonts/Georgia Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)

made = []
for i, p in enumerate(cfg.get('selfies', [])):
    save(square(p), f'selfie-{i}'); made.append(f'selfie-{i}')
for i, p in enumerate(cfg.get('iconPhotos', [])):
    save(square(p), f'photo-{i}'); made.append(f'photo-{i}')
text = (cfg.get('iconText') or '').strip()
for pid, (bg, fg) in PREMADE.items():
    im = Image.new('RGB', (512, 512), bg); d = ImageDraw.Draw(im)
    if text:
        size = 190
        while size > 60 and d.textlength(text, font=font(size)) > 420:
            size -= 10
        d.text((256, 256), text, font=font(size), fill=fg, anchor='mm')
    else:
        d.ellipse((164, 164, 348, 348), fill=fg)
    save(im, pid); made.append(pid)

if cfg.get('selfies'):
    base = square(cfg['selfies'][0])
    for s in (180, 192, 512):
        base.resize((s, s), Image.LANCZOS).save(f'icons/icon-{s}.png')
print('made', ', '.join(made), file=sys.stderr)
