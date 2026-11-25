"""Check alignment and spacing in the shipped S2000 LCD font."""

from pathlib import Path

from fontTools.ttLib import TTFont


with TTFont(Path(__file__).with_name('s2000-lcd.ttf')) as font:
    names = font.getBestCmap()
    outlines = font['glyf']
    advances = font['hmtx'].metrics
    for char in '1402356789':
        digit = outlines[names[ord(char)]]
        assert (digit.yMin, digit.yMax) == (0, 780), f'{char} must reach the digit baseline and cap height'

    one, zero = (names[ord(char)] for char in '10')
    width, _ = advances[one]
    assert width < advances[zero][0] / 2, '1 must use a proportional advance'
    assert abs(outlines[one].xMin + outlines[one].xMax - width) <= 2, '1 must centre on its own'

    for char in 'km/hpiOIL°CFrn':
        assert ord(char) in names, f'{char} must use authored lettering instead of the fallback font'

print('LCD digits share a baseline and cap height, and every label uses authored glyphs')
