#!/usr/bin/env python3
"""Génère les icônes PNG pour la PWA Pac-Neon."""
from PIL import Image, ImageDraw
import os

OUT_DIR = "/home/z/my-project/public"

def make_icon(size: int, path: str):
    """Crée une icône Pac-Man néon."""
    img = Image.new("RGBA", (size, size), (5, 5, 15, 255))
    draw = ImageDraw.Draw(img)

    # Fond avec dégradé radial (sombre avec lueur centrale)
    cx, cy = size // 2, size // 2
    r = size // 2

    # Halo cyan extérieur
    for i in range(r, 0, -1):
        alpha = max(0, int(30 * (1 - i / r)))
        if alpha > 0:
            draw.ellipse(
                [cx - i, cy - i, cx + i, cy + i],
                fill=(34, 211, 238, alpha),
            )

    # Pac-Man : cercle jaune avec une encoche (bouche)
    pac_r = int(size * 0.38)
    # Couleur jaune néon
    yellow = (253, 224, 71, 255)

    # Dessiner le corps comme un "pie" avec une encoche pour la bouche
    # On dessine un cercle plein puis on efface un triangle pour la bouche
    draw.ellipse(
        [cx - pac_r, cy - pac_r, cx + pac_r, cy + pac_r],
        fill=yellow,
    )

    # Bouche : triangle orienté vers la droite
    mouth_start = size * 0.05
    mouth_end_x = cx + pac_r + 2
    mouth_h = int(pac_r * 0.45)
    draw.polygon(
        [
            (cx, cy),
            (mouth_end_x, cy - mouth_h),
            (mouth_end_x, cy + mouth_h),
        ],
        fill=(5, 5, 15, 255),
    )

    # Petit reflet (effet glossy)
    gloss_r = int(pac_r * 0.25)
    gloss_cx = cx - int(pac_r * 0.35)
    gloss_cy = cy - int(pac_r * 0.35)
    draw.ellipse(
        [gloss_cx - gloss_r, gloss_cy - gloss_r, gloss_cx + gloss_r, gloss_cy + gloss_r],
        fill=(255, 255, 255, 80),
    )

    # Œil
    eye_r = max(2, int(pac_r * 0.12))
    eye_cx = cx + int(pac_r * 0.05)
    eye_cy = cy - int(pac_r * 0.4)
    draw.ellipse(
        [eye_cx - eye_r, eye_cy - eye_r, eye_cx + eye_r, eye_cy + eye_r],
        fill=(5, 5, 15, 255),
    )

    img.save(path, "PNG")
    print(f"Generated {path} ({size}x{size})")

if __name__ == "__main__":
    make_icon(192, os.path.join(OUT_DIR, "icon-192.png"))
    make_icon(512, os.path.join(OUT_DIR, "icon-512.png"))
    # Favicon aussi
    make_icon(32, os.path.join(OUT_DIR, "favicon-32.png"))
    make_icon(16, os.path.join(OUT_DIR, "favicon-16.png"))
