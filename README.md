# Wadokei 和時計

**GNOME Shell extension: Japanese temporal hours (不定時法) in the top bar.**

Day (dawn → dusk) and night (dusk → dawn) are each divided into six *toki* of
equal but seasonally varying length. The panel shows the bare kanji of the
current hour (十二支); the popup lists all twelve hours of the current cycle,
bell counts, and dawn/dusk times. Bells strike at 正刻 — the *center* of each
toki: solar noon is the middle of 午 (hence 正午), solar midnight the middle
of 子 (正子). The seam hours 卯 and 酉 straddle dawn and dusk with halves of
different day/night rates. No notifications are ever emitted.

**Расширение GNOME Shell: японские временные часы (不定時法) в верхней
панели.** День и ночь делятся на шесть токи плавающей сезонной длины;
в панели — иероглиф текущего часа, в попапе — все двенадцать часов,
удары колокола, рассвет и закат. Колокол бьёт в 正刻, середине токи:
солнечный полдень — середина часа Лошади (正午). Уведомлений нет.

## Location / Местоположение

Coordinates come from **GeoClue** (city-level accuracy) when location
services are enabled in *Settings → Privacy → Location*. Otherwise the
static fallback in `src/extension.js` (`FALLBACK_LAT` / `FALLBACK_LON`)
is used. The popup's last line shows which source is active.

Координаты берутся из **GeoClue**, если геолокация включена в
*Настройки → Конфиденциальность*. Иначе используются статические
константы `FALLBACK_LAT` / `FALLBACK_LON`. Последняя строка попапа
показывает, какой источник активен.

## Languages / Языки

The interface follows the system locale via gettext: English (source),
Русский, Lietuvių, Беларуская. The twelve branch characters (子丑寅卯辰巳
午未申酉戌亥) are hanzi and are intentionally never translated.

To add a language: `make pot`, copy `po/wadokei.pot` to `po/<lang>.po`,
translate, `make install`.

## Install / Установка

```sh
git clone https://github.com/tedvask/wadokei.git
cd wadokei
make install     # builds translations, packs, installs
# re-login (Wayland), then:
gnome-extensions enable wadokei@tianci.vilnius
```

Requires `gettext` and `zip` to build: `sudo dnf install gettext zip`.

## Requirements

GNOME Shell 48–50. Tested on Fedora 44 / GNOME 50.

## License

GPL-3.0-or-later.
