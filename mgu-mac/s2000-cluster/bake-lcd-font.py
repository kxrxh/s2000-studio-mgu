"""Build the Studio face from authored segment and label outlines."""

import json
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

MASKS = (119, 36, 93, 109, 46, 107, 123, 37, 127, 111)
TOP = ((10, 0), (63, 0), (68, 2), (71, 7), (72, 13), (1, 13), (3, 6), (6, 2))
BOTTOM = ((1, 87), (71, 87), (69, 94), (65, 98), (61, 100), (1, 100))


def middle_segment(join_left, join_right):
    left, left_tip = (13, 0) if join_left else (14, 4)
    right, right_tip = (59, 72) if join_right else (58, 68)
    return ((left, 43), (right, 43), (right_tip, 50), (right, 57), (left, 57), (left_tip, 50))


def digit_segments(mask):
    top, upper_left, upper_right, middle, lower_left, lower_right, bottom = (
        bool(mask & (1 << bit)) for bit in range(7)
    )
    # Free ends reach the full height. At the midpoint, adjoining strokes leave a thin diagonal seam.
    top_edge = 14 if top else 0
    bottom_edge = 86 if bottom else 100
    upper_inner, upper_outer = (42, 49) if middle else (46, 51)
    lower_inner, lower_outer = (58, 51) if middle else (47, 52)
    upper = ((0, top_edge), (13, top_edge), (13, upper_inner), (0, upper_outer))
    lower = ((0, lower_outer), (13, lower_inner), (13, bottom_edge), (0, bottom_edge))
    return [outline for lit, outline in (
        (top, TOP), (upper_left, upper),
        (upper_right, tuple((72 - x, y) for x, y in reversed(upper))),
        (middle, middle_segment(upper_left or lower_left, upper_right or lower_right)),
        (lower_left, lower), (lower_right, tuple((72 - x, y) for x, y in reversed(lower))),
        (bottom, BOTTOM),
    ) if lit]


def dot(y):
    return ((33, y), (39, y), (41, y + 3), (41, y + 7),
            (39, y + 10), (33, y + 10), (31, y + 7), (31, y + 3))


def outline_glyph(contours, transform):
    pen = TTGlyphPen(None)
    for corners in contours:
        for i, (x, y) in enumerate(corners):
            (pen.moveTo if i == 0 else pen.lineTo)(transform(x, y))
        pen.closePath()
    return pen.glyph()


def main():
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (0, 0)}
    cmap = {}

    def add(char, glyph, advance):
        name = f'uni{ord(char):04X}'
        cmap[ord(char)] = name
        glyphs[name] = glyph
        metrics[name] = (advance, min(x for x, _ in glyph.coordinates))

    for char, segments, advance, centre in [
        *((str(digit), digit_segments(mask), 290 if digit == 1 else 665, 65.5 if digit == 1 else 36)
          for digit, mask in enumerate(MASKS)),
        ('-', [middle_segment(False, False)], 665, 36),
        (':', [dot(29), dot(64)], 240, 36),
        ('.', [dot(90)], 240, 36),
    ]:
        def lcd_point(x, y):
            return (round(advance / 2 + 7.7 * (x - centre + (50 - y) * 0.095)),
                    round(7.8 * (100 - y)))

        add(char, outline_glyph(segments, lcd_point), advance)

    labels = json.loads(Path(__file__).with_name('label-outlines.json').read_text(encoding='utf-8'))
    for char, contours in labels.items():
        if char in '01×':  # The printed RPM caption has its own non-LCD numerals.
            continue
        width = max(x for contour in contours for x, _ in contour)
        add(char, outline_glyph(contours, lambda x, y: (round(35 * (x + 1.4)), round(35 * (18 - y)))),
            round(35 * (width + 2.8)))

    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder(list(glyphs))
    font.setupCharacterMap(cmap)
    font.setupGlyf(glyphs)
    font.setupHorizontalMetrics(metrics)
    font.setupHorizontalHeader(ascent=800, descent=-150)
    font.setupNameTable({'familyName': 'S2000 LCD', 'styleName': 'Regular',
                         'uniqueFontIdentifier': 'S2000 LCD 1.0',
                         'fullName': 'S2000 LCD', 'psName': 'S2000LCD'})
    font.setupOS2(sTypoAscender=800, sTypoDescender=-150, usWinAscent=800, usWinDescent=150)
    font.setupPost()
    font.font.recalcTimestamp = False
    font.font['head'].created = font.font['head'].modified = 3700000000
    font.save(Path(__file__).with_name('s2000-lcd.ttf'))


if __name__ == '__main__':
    main()
