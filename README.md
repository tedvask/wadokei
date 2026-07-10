# Wadokei 和時計

A GNOME Shell extension that keeps time the way Edo-period Japan did: in
**unequal temporal hours** (不定時法, *futeijihō*). The top bar shows a single
kanji — the current hour of the twelve earthly branches. The popup lists the
full cycle of twelve hours, their bell counts, boundaries, and today's dawn
and dusk.

No notifications, no sounds, no network requests. One glyph in the panel.

## The timekeeping model

The extension implements the variable-hour system used in Japan until the
Meiji calendar reform of 1873. Four principles govern the computation.

### 1. Day and night are divided separately

Daytime (dawn to dusk) is divided into six equal *toki*; nighttime (dusk to
dawn) into six more. Because the two spans are divided independently, a
daytime toki and a nighttime toki are almost never the same length, and both
drift continuously with the seasons. At the latitude of Vilnius the contrast
is dramatic: near the summer solstice a daytime toki stretches past three
hours while a nighttime toki shrinks below one; at the winter solstice the
proportions invert. This seasonal breathing is not a defect to be corrected
but the entire point of the system — wadokei clocks were built with movable
hour plates or dual foliots precisely to track it.

### 2. Bells strike at the *center* of each hour

The bell time is the *shōkoku* (正刻), the midpoint of the toki — not its
boundary. This is why solar noon is called 正午, "exact Horse": it falls in
the **middle** of the hour of the Horse, and solar midnight (正子) in the
middle of the hour of the Rat. Consequently the hour boundaries lie halfway
between adjacent bells. The extension computes bells first — dusk and dawn
anchor the runs, each run's bells spaced one unit apart — and derives
boundaries from them.

### 3. The seam hours are stitched from unequal halves

The hours of the Rabbit (卯, centered on dawn) and the Rooster (酉, centered
on dusk) straddle the day/night boundary. Their first and second halves
therefore run at *different rates*: half a night-unit glued to half a
day-unit. In July at 54°N the Rooster lasts about 120 minutes while its
all-day neighbors run 182 and its all-night neighbors 59. This is the
historically correct behavior, not an artifact.

### 4. Dawn and dusk follow the Edo civil convention

*Ake-mutsu* (明け六つ) and *kure-mutsu* (暮れ六つ) were not sunrise and
sunset but the onset of usable light — traditionally, when the lines of
one's palm become visible, corresponding to the sun several degrees below
the horizon. The extension approximates this with a constant offset,
`DAWN_DUSK_OFFSET_MIN = 36` minutes before sunrise / after sunset. A fixed
offset is a simplification (the rigorous definition is a solar depression
angle, whose clock-time equivalent varies with season and latitude); set the
constant to `0` for plain sunrise/sunset if you prefer astronomical purity
over civil convention.

### Bell counts

Hours are announced by 9 down to 4 strikes, twice per cycle — 9 at the Horse
(noon) and the Rat (midnight), descending to 4, then restarting. The
traditional derivation multiplies the yang number nine by the hour's index
and keeps the last digit: 9, 18→8, 27→7, 36→6, 45→5, 54→4. Counts one
through three were reserved for temple signals, which is why no hour strikes
fewer than four.

## Astronomical computation

Sunrise and sunset are computed locally with the standard low-precision
solar algorithm (the SunCalc formulation: solar mean anomaly → ecliptic
longitude → declination → hour angle), using the conventional altitude of
−0.833° to account for atmospheric refraction and the solar radius.
Accuracy is on the order of a minute, which is well below the natural
fuzziness of the "lines on your palm" convention. All times are handled in
the system timezone via ordinary `Date` arithmetic, so DST transitions are
absorbed automatically.

Above the polar circles the division is undefined on days without a
sunrise or sunset; the extension then shows an em dash and says so in the
popup, rather than inventing hours the system never defined.

## Location

Coordinates come from **GeoClue** at city-level accuracy when location
services are enabled (*Settings → Privacy → Location*). GeoClue is loaded
lazily and cancelled cleanly on disable; if it is unavailable, denied, or
disabled, the extension silently falls back to the static coordinates in
`src/extension.js` — Nihonbashi in Tokyo, the zero milestone of Edo, a
deliberately conspicuous default. The popup's last line always shows the
active coordinates and their source.

## Languages

The interface follows the system locale via gettext: English (source),
Russian, Lithuanian, Belarusian. The twelve branch characters
(子丑寅卯辰巳午未申酉戌亥) are hanzi and are intentionally never
translated — they are the interface.

To add a language: `make pot`, copy `po/wadokei.pot` to `po/<lang>.po`,
translate (note the translator comment about grammatical case: animal names
are used inside the frame "hour of the %s"), then `make install`.

## Installation

```sh
git clone https://github.com/tedvask/wadokei.git
cd wadokei
sudo dnf install gettext zip   # build dependencies
make install
```

Log out and back in (Wayland), then:

```sh
gnome-extensions enable wadokei@tianci.vilnius
```

Requires GNOME Shell 48–50. Developed and tested on Fedora 44 / GNOME 50.

## Development

| Target         | Effect                                              |
|----------------|-----------------------------------------------------|
| `make pot`     | regenerate the translation template from source     |
| `make pack`    | compile translations and build the installable zip  |
| `make install` | pack and install for the current user               |
| `make clean`   | remove build artifacts                              |

The panel indicator updates every 30 seconds; the popup also refreshes on
open. The extension holds no state between sessions and touches nothing
outside the Shell process.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
