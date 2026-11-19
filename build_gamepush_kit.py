#!/usr/bin/env python3
"""
Builds the complete VK Games / GamePush Promotional Kit (Section 9) in GAMEPUSH_KIT/:
 - icon_1024x1024.png (exact 1024x1024, 3 hero silhouettes, NO text, full-bleed)
 - cover_1920x1080.png (exact 1920x1080 with Russian title «ЗВЁЗДНАЯ АРЕНА: ОТРЯД»)
 - cover_en_1920x1080.png (exact 1920x1080 with English title «STAR ARENA: SQUAD»)
 - screenshots/{ru,en}/{portrait_720x1280,landscape_1280x720}/{01_match,02_super,03_case,04_trophy_road}.png
 - videos/gameplay_portrait_720x1280.mp4  (14s <= 20s, H.264+AAC, zero black bars: match -> super -> victory -> case)
 - videos/gameplay_landscape_1280x720.mp4 (14s <= 20s, H.264+AAC, zero black bars: match -> super -> victory -> case)
 - texts/store_ru.md, texts/store_en.md, texts/metadata.json (verified VK char limits!)
"""

import json
import math
import os
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "GAMEPUSH_KIT"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

BOLD_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size: int):
    for fp in BOLD_FONT_PATHS:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size=size)
    return ImageFont.load_default()


def build_icon_and_covers():
    print("[1/4] Building icon_1024x1024.png & cover_1920x1080.png...")
    icon_src = Image.open(KIT / "icon_raw.png").convert("RGB")
    w, h = icon_src.size
    # Crop 7% margin so rounded-corner vignette from raw render is completely removed -> pure full-bleed 1024x1024!
    margin_x = int(w * 0.075)
    margin_y = int(h * 0.075)
    icon_cropped = icon_src.crop((margin_x, margin_y, w - margin_x, h - margin_y))
    icon_1024 = icon_cropped.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon_1024.save(KIT / "icon_1024x1024.png", format="PNG", optimize=True)

    cover_src = Image.open(KIT / "cover_raw.png").convert("RGBA")
    # Center-crop 16:9 and resize to exact 1920x1080
    cw, ch = cover_src.size
    target_ratio = 1920 / 1080
    cur_ratio = cw / ch
    if cur_ratio > target_ratio:
        new_w = int(ch * target_ratio)
        off = (cw - new_w) // 2
        cover_crop = cover_src.crop((off, 0, off + new_w, ch))
    else:
        new_h = int(cw / target_ratio)
        off = (ch - new_h) // 2
        cover_crop = cover_src.crop((0, off, cw, off + new_h))
    base_1080 = cover_crop.resize((1920, 1080), Image.Resampling.LANCZOS)

    for lang, main_title, sub_line, out_name in [
        ("ru", "ЗВЁЗДНАЯ АРЕНА: ОТРЯД", "КОСМИЧЕСКИЙ ЭКШЕН 3v3 И СОЛО · 72 ГЕРОЯ · 6+", "cover_1920x1080.png"),
        ("en", "STAR ARENA: SQUAD", "3v3 & SOLO COSMIC ACTION · 72 HEROES · 6+", "cover_en_1920x1080.png"),
    ]:
        canvas = base_1080.copy()
        overlay = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)

        # Subtle top readability gradient
        for y in range(290):
            alpha = int(165 * (1 - y / 290.0))
            odraw.line([(0, y), (1920, y)], fill=(8, 12, 32, alpha))

        font_title = load_font(88 if lang == "ru" else 94)
        font_sub = load_font(30)

        # Glow + 3D bevel shadow for title
        glow_layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow_layer)
        tb = gdraw.textbbox((0, 0), main_title, font=font_title)
        tx = (1920 - (tb[2] - tb[0])) // 2
        ty = 56
        gdraw.text((tx, ty), main_title, font=font_title, fill=(0, 229, 255, 220), stroke_width=10, stroke_fill=(49, 27, 146, 255))
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=10))
        canvas = Image.alpha_composite(canvas, overlay)
        canvas = Image.alpha_composite(canvas, glow_layer)

        draw = ImageDraw.Draw(canvas)
        # Extruded dark bevel
        draw.text((tx, ty + 8), main_title, font=font_title, fill=(24, 14, 68, 255), stroke_width=8, stroke_fill=(24, 14, 68, 255))
        # Crisp gold-white arcade face
        draw.text((tx, ty), main_title, font=font_title, fill=(255, 226, 89, 255), stroke_width=5, stroke_fill=(18, 25, 58, 255))

        # Subtitle pill
        sb = draw.textbbox((0, 0), sub_line, font=font_sub)
        sw = sb[2] - sb[0]
        sx = (1920 - sw) // 2
        sy = ty + 114
        draw.rounded_rectangle(
            [sx - 28, sy - 10, sx + sw + 28, sy + 44],
            radius=22,
            fill=(15, 23, 52, 225),
            outline=(0, 229, 255, 230),
            width=3,
        )
        draw.text((sx, sy), sub_line, font=font_sub, fill=(248, 250, 252, 255))

        canvas.convert("RGB").save(KIT / out_name, format="PNG", optimize=True)

    # Remove intermediate raw files so GAMEPUSH_KIT stays squeaky clean
    for raw in ["icon_raw.png", "cover_raw.png"]:
        p = KIT / raw
        if p.exists():
            p.unlink()


def capture_screenshots(browser):
    print("[2/4] Capturing 16 live Three.js RU/EN Portrait & Landscape screenshots...")
    orientations = [
        ("portrait_720x1280", 720, 1280),
        ("landscape_1280x720", 1280, 720),
    ]
    for lang in ["ru", "en"]:
        for orient_dir, vw, vh in orientations:
            out_dir = KIT / "screenshots" / lang / orient_dir
            out_dir.mkdir(parents=True, exist_ok=True)

            ctx = browser.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=1)
            page = ctx.new_page()
            q = "?vk_language=ru&lang=ru" if lang == "ru" else "?lang=en"
            page.goto(f"http://127.0.0.1:8080/{q}")
            page.wait_for_timeout(700)

            # Lock 3D High quality so CPU SwiftShader never downshifts to 2D during capture
            page.evaluate("""() => {
                const s = window.SA_DEBUG.getSave();
                s.settings.quality = 'high';
                s.coins = 540;
                s.pp = 120;
                s.cases = 3;
                window.SA_DEBUG.setLang('""" + lang + """');
            }""")

            # 1) 01_match.png: Intense 3v3 Crystal Rush battle around center mine!
            page.evaluate("""() => {
                window.SA_DEBUG.startMatch('crystal_rush', 'map_cr_nebula_mine');
                const m = window.SA_DEBUG.getActiveMatch();
                // Advance 140 simulation ticks (7 seconds) so heroes clash around the center mine!
                for (let i = 0; i < 140; i++) {
                    window.SA.MatchSim.stepMatchTick(m, null, true);
                }
                const p = m.units.find(u => u.isPlayer);
                p.superCharge = 68;
            }""")
            page.wait_for_timeout(220)
            page.screenshot(path=str(out_dir / "01_match.png"))

            # 2) 02_super.png: Golden 100% SUPER ready & unleashed mid-action!
            page.evaluate("""() => {
                const m = window.SA_DEBUG.getActiveMatch();
                const p = m.units.find(u => u.isPlayer);
                p.superCharge = 100;
                window.SA_DEBUG.castPlayerSuper();
            }""")
            page.wait_for_timeout(140)
            page.evaluate("""() => {
                const m = window.SA_DEBUG.getActiveMatch();
                if (m) {
                    const p = m.units.find(u => u.isPlayer);
                    if (p) p.superCharge = 100;
                }
            }""")
            page.wait_for_timeout(120)
            page.screenshot(path=str(out_dir / "02_super.png"))

            # 3) 03_case.png: Star Capsule tap-to-hasten opening with reward reveal & disclosed odds!
            page.reload()
            page.wait_for_timeout(650)
            page.evaluate("""() => {
                const s = window.SA_DEBUG.getSave();
                s.cases = 2;
                s.casesWithoutHero = 10; // Trigger exciting guaranteed hero reveal for screenshot!
                window.SA_DEBUG.setLang('""" + lang + """');
                window.SA_DEBUG.grantAndOpenCase();
            }""")
            page.wait_for_timeout(200)
            for _ in range(5):
                stage = page.locator("#saCapsuleStage")
                if stage.count() > 0:
                    stage.dispatch_event("pointerdown")
                page.wait_for_timeout(90)
            page.wait_for_timeout(250)
            page.screenshot(path=str(out_dir / "03_case.png"))

            # 4) 04_trophy_road.png: Trophy Road (0 - 1500) with reached & claimable rewards!
            page.reload()
            page.wait_for_timeout(650)
            page.evaluate("""() => {
                window.SA_DEBUG.setLang('""" + lang + """');
                window.SA_DEBUG.setTrophiesDemo(265);
                window.SA_DEBUG.setTab('road');
            }""")
            page.wait_for_timeout(250)
            page.screenshot(path=str(out_dir / "04_trophy_road.png"))

            ctx.close()


def synthesize_promo_bgm(wav_path: Path, duration_sec: float = 14.0, sr: int = 44100):
    """Generates an upbeat, cheerful 6+ cosmic synth soundtrack wav for the promo videos."""
    notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 349.23, 440.00, 523.25, 659.25]
    total_samples = int(duration_sec * sr)
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for i in range(total_samples):
            t = i / sr
            beat = int(t * 5.0)
            freq = notes[beat % len(notes)]
            env = max(0.0, 1.0 - ((t * 5.0) % 1.0) * 0.75)
            # Add fanfare swell at Victory (8.5s) & Case Reveal (12.0s)
            swell = 1.35 if (8.4 <= t <= 10.5 or t >= 12.0) else 1.0
            val = (
                0.55 * math.sin(2 * math.pi * freq * t)
                + 0.25 * math.sin(2 * math.pi * freq * 2.0 * t)
                + 0.20 * math.sin(2 * math.pi * (freq * 0.5) * t)
            ) * env * 0.22 * swell
            pcm = max(-32767, min(32767, int(val * 32767)))
            frames += struct.pack("<h", pcm)
        wf.writeframes(frames)


def record_promo_videos(browser):
    print("[3/4] Recording 2 full-bleed gameplay videos (720x1280 & 1280x720, 14s <= 20s, zero black bars)...")
    fps = 15
    total_frames = 210  # 210 / 15 = 14.0 seconds (<= 20s VK limit!)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        bgm_wav = tmp / "bgm.wav"
        synthesize_promo_bgm(bgm_wav, duration_sec=total_frames / fps)

        for label, vw, vh, out_file in [
            ("portrait", 720, 1280, "gameplay_portrait_720x1280.mp4"),
            ("landscape", 1280, 720, "gameplay_landscape_1280x720.mp4"),
        ]:
            frame_dir = tmp / f"frames_{label}"
            frame_dir.mkdir(parents=True, exist_ok=True)

            ctx = browser.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=1)
            page = ctx.new_page()
            page.goto("http://127.0.0.1:8080/?vk_language=ru&lang=ru")
            page.wait_for_timeout(650)

            # Act 1 setup: Start Crystal Rush in 3D High mode
            page.evaluate("""() => {
                const s = window.SA_DEBUG.getSave();
                s.settings.quality = 'high';
                s.cases = 3;
                s.casesWithoutHero = 10;
                window.SA_DEBUG.setLang('ru');
                window.SA_DEBUG.startMatch('crystal_rush', 'map_cr_nebula_mine');
                const m = window.SA_DEBUG.getActiveMatch();
                for (let i = 0; i < 65; i++) window.SA.MatchSim.stepMatchTick(m, null, true);
            }""")

            for f_idx in range(total_frames):
                # Act 1 (frames 0..74 = 0.0s..5.0s): Live 3v3 combat
                if f_idx < 75:
                    page.evaluate("""() => {
                        const m = window.SA_DEBUG.getActiveMatch();
                        if (m && !m.finished) {
                            window.SA.MatchSim.stepMatchTick(m, null, true);
                            const p = m.units.find(u => u.isPlayer);
                            if (p) p.superCharge = Math.min(98, 35 + m.tick * 0.6);
                        }
                    }""")
                # Act 2 (frames 75..124 = 5.0s..8.3s): Golden SUPER unleashed!
                elif f_idx == 75:
                    page.evaluate("""() => {
                        window.SA_DEBUG.castPlayerSuper();
                    }""")
                elif 75 < f_idx < 125:
                    page.evaluate("""() => {
                        const m = window.SA_DEBUG.getActiveMatch();
                        if (m && !m.finished) {
                            window.SA.MatchSim.stepMatchTick(m, null, true);
                            if (m.tick % 12 === 0) window.SA_DEBUG.castPlayerSuper();
                        }
                    }""")
                # Act 3 (frames 125..164 = 8.3s..11.0s): VICTORY! Results screen
                elif f_idx == 125:
                    page.evaluate("""() => {
                        window.SA_DEBUG.forceVictoryScreen();
                    }""")
                # Act 4 (frames 165..209 = 11.0s..14.0s): Star Capsule tap-to-open reveal!
                elif f_idx == 165:
                    page.evaluate("""() => {
                        const res = document.getElementById('saResultsOverlay');
                        if (res) res.classList.add('hidden');
                        window.SA_DEBUG.grantAndOpenCase();
                    }""")
                elif f_idx in (170, 174, 178, 182, 186):
                    stage = page.locator("#saCapsuleStage")
                    if stage.count() > 0:
                        stage.dispatch_event("pointerdown")

                page.wait_for_timeout(18)
                page.screenshot(path=str(frame_dir / f"frame_{f_idx:04d}.png"))

            ctx.close()

            out_mp4 = KIT / "videos" / out_file
            cmd = [
                FFMPEG, "-y",
                "-framerate", str(fps),
                "-i", str(frame_dir / "frame_%04d.png"),
                "-i", str(bgm_wav),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-crf", "22",
                "-c:a", "aac",
                "-b:a", "128k",
                "-shortest",
                "-movflags", "+faststart",
                str(out_mp4),
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def write_store_texts():
    print("[4/4] Writing & verifying VK Store texts (strict char-limit validation)...")

    ru = {
        "title": "Звёздная Арена: Отряд",
        "short": "Динамичный космический экшен 3v3 и Соло! 72 героя, умные боты, битвы за кристаллы и честные звёздные кейсы без доната. 6+",
        "full": (
            "«Звёздная Арена: Отряд» — яркий командный экшен 3v3 и «Последний Герой» с быстрыми матчами по 60–120 секунд!\n\n"
            "• 72 ГЕРОЯ В ОТРЯДЕ: 12 уникальных боевых архетипов (Стрелок, Дробовик, Танк, Снайпер, Лекарь, Метатель, Убийца, Контролёр, Призыватель, Боец, Трикстер, Подрывник) × 6 стихий (Огонь, Лёд, Гроза, Природа, Тьма, Свет) и 40 стильных скинов.\n"
            "• РЕЖИМЫ И РОТАЦИЯ КАРТ: «Кристальная Гонка» (3v3), «Звёздная Охота» (3v3), «Последний Герой» (FFA на 6 бойцов), а также события «Взлом Хранилища» и «Звёздный Мяч».\n"
            "• УМНЫЕ ЧЕЛОВЕЧНЫЕ БОТЫ: 6 уровней мастерства по кубкам, засады в кустах, командный фокус и режим «Хардкор ×2 монеты».\n"
            "• ПРИЗРАК ДРУГА: призови рекорды друзей в свой отряд по коду без ожидания онлайна!\n"
            "• 100% БЕЗ ДОНАТА (6+): все кейсы, герои и 30 уровней сезона открываются только игрой!"
        ),
        "howto": (
            "УПРАВЛЕНИЕ (удобно и вертикально, и горизонтально):\n"
            "• Левая половина экрана (или клавиши WASD / Стрелки на ПК) — виртуальный джойстик движения. Заходи в зелёные кусты, чтобы стать невидимым для соперников!\n"
            "• Красная кнопка справа (или Пробел) — выстрел с умным авто-прицелом в конусе 25° (можно потянуть кнопку для ручного прицела).\n"
            "• Золотая кнопка СУПЕР (или клавиша E / Shift) — копится от попаданий и выпускает мощный ультимейт героя!\n\n"
            "ПРОКАЧКА И ПОБЕДА:\n"
            "• В «Кристальной Гонке» собери командой 10 кристаллов из шахты и удержи их 15 секунд.\n"
            "• Побеждай за кубки, продвигайся по Лестнице кубков до 1500, открывай Звёздные капсулы с системой гаранта (Pity на 11-м кейсе) и прокачивай героев до 9 уровня (талант на 7 ур., усиленный Супер на 9 ур.)!"
        ),
        "about": (
            "Добро пожаловать на космический турнир «Звёздная Арена: Отряд»!\n\n"
            "Игра создана специально для быстрых, честных и азартных сессий на смартфонах, планшетах и ПК. Каждый бой длится от 60 до 120 секунд и дарит концентрированный экшен с красочными мультяшными звёздами, тактическими кустами, рикошетами и командными комбо — с добрым семейным рейтингом 6+ и полным отсутствием платных покупок.\n\n"
            "МОДУЛЬНАЯ СИСТЕМА 72 ГЕРОЕВ:\n"
            "Комбинация 12 боевых китов и 6 стихий создаёт 72 неповторимых бойца: от пламенного Стрелка Вулкана с веерным залпом до крио-Снайпера Авроры со сквозным лучом и Трикстера с голографическими клонами. Прокачивай любимцев монетами и очками силы с 1 по 9 уровень, открывая пассивные таланты на 7 уровне и мега-версии Супера на 9 уровне.\n\n"
            "ЖИВЫЕ БОТЫ И СОЦИАЛЬНЫЙ КО-ОП:\n"
            "Система из 6 брекетов ИИ адаптируется под твои кубки: на старте боты дают освоиться, а на высоких рангах используют укрытия, кайтят, проверяют кусты и ведут предиктивный огонь. Делись победами с друзьями и обменивайся кодами «Призрака друга», чтобы герой товарища сражался плечом к плечу в твоём отряде!"
        ),
        "keywords": "арена, герои, 3v3, боты, кубки, кейсы, экшен, для всей семьи, vk игры"
    }

    en = {
        "title": "Star Arena: Squad",
        "short": "Fast-paced 3v3 & Solo cosmic arena action! 72 heroes, smart adaptive bots, crystal battles, and fair Star Capsules with zero IAP. 6+",
        "full": (
            "Star Arena: Squad is a vibrant 3v3 and Free-for-All cosmic action game built for thrilling 60–120 second matches!\n\n"
            "• 72 MODULAR HEROES: 12 distinct combat archetypes (Blaster, Scattergun, Vanguard, Marksman, Medic, Alchemist, Striker, Warden, Engineer, Champion, Trickster, Demolisher) × 6 Elements (Fire, Ice, Storm, Nature, Shadow, Light) + 40 unlockable skins.\n"
            "• 5 MODES & SYMMETRIC MAPS: Crystal Rush (3v3), Star Hunt (3v3), Last Hero (6-player FFA), plus Live-Ops Vault Breach & Star Ball with weekly map rotation.\n"
            "• SMART HUMAN-LIKE BOTS: 6 trophy AI brackets with bush ambushes, kiting, focus-fire, and Hardcore ×2 Coins mode.\n"
            "• ASYNC FRIEND GHOST: Import a friend's Ghost Code so their hero and skin fight beside you!\n"
            "• ZERO IAP (6+): All capsules, heroes, and the 30-tier Season Pass are 100% earned via play!"
        ),
        "howto": (
            "CONTROLS (Portrait, Landscape & Desktop):\n"
            "• Left screen half (or WASD / Arrow keys on PC) — floating movement joystick. Step into green bushes to turn invisible to rivals!\n"
            "• Red button on the right (or Spacebar) — fires with smart 25° cone Auto-Aim (or drag to aim manually).\n"
            "• Golden SUPER button (or E / Shift) — charges from hits landed and unleashes your hero's ultimate skill!\n\n"
            "PROGRESSION & VICTORY:\n"
            "• In Crystal Rush, collect 10 Star Crystals from the central mine and hold them for 15 seconds.\n"
            "• Climb the 1500 Trophy Road, crack open Star Capsules (with transparent odds & 11th-case Hero Pity!), and upgrade heroes to Level 9 (Lv.7 Talent & Lv.9 Super+)!"
        ),
        "about": (
            "Welcome to Star Arena: Squad — a family-friendly (6+) cosmic arena action game engineered for instant fun on mobile and desktop browsers.\n\n"
            "Every match runs 60–120 seconds at a crisp 20Hz deterministic simulation rate with smooth 60fps 3D rendering and an automatic 2.5D sprite fallback for older devices. Collect 72 heroes, master 12 weapon kits, team up with Friend Ghosts, and conquer the galaxy with zero pay-to-win!"
        ),
        "keywords": "arena, heroes, 3v3, bots, trophies, cases, action, family friendly, vk games"
    }

    limits = [("title", 48), ("short", 255), ("full", 1024), ("howto", 1024), ("about", 10000)]
    for lang_code, pack in [("ru", ru), ("en", en)]:
        for field, max_len in limits:
            actual = len(pack[field])
            assert actual <= max_len, f"[{lang_code}] {field} length {actual} exceeds limit {max_len}!"

    (KIT / "texts" / "store_ru.md").write_text(
        f"# {ru['title']} ({len(ru['title'])}/48)\n\n"
        f"## Краткое описание ({len(ru['short'])}/255)\n{ru['short']}\n\n"
        f"## Полное описание ({len(ru['full'])}/1024)\n{ru['full']}\n\n"
        f"## Как играть / Инструкция ({len(ru['howto'])}/1024)\n{ru['howto']}\n\n"
        f"## Об игре ({len(ru['about'])}/10000)\n{ru['about']}\n\n"
        f"## Ключевые слова\n{ru['keywords']}\n",
        encoding="utf-8",
    )

    (KIT / "texts" / "store_en.md").write_text(
        f"# {en['title']} ({len(en['title'])}/48)\n\n"
        f"## Short Description ({len(en['short'])}/255)\n{en['short']}\n\n"
        f"## Full Description ({len(en['full'])}/1024)\n{en['full']}\n\n"
        f"## How to Play ({len(en['howto'])}/1024)\n{en['howto']}\n\n"
        f"## About the Game ({len(en['about'])}/10000)\n{en['about']}\n\n"
        f"## Keywords\n{en['keywords']}\n",
        encoding="utf-8",
    )

    (KIT / "texts" / "metadata.json").write_text(
        json.dumps(
            {
                "age_rating": "6+",
                "monetization": "ads_only_no_iap",
                "ru": {k: {"text": v, "length": len(v)} for k, v in ru.items()},
                "en": {k: {"text": v, "length": len(v)} for k, v in en.items()},
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main():
    build_icon_and_covers()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
            ]
        )
        capture_screenshots(browser)
        record_promo_videos(browser)
        browser.close()
    write_store_texts()
    print("GAMEPUSH_KIT build complete!")


if __name__ == "__main__":
    main()
