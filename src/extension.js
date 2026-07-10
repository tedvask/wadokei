// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wadokei 和時計 — Japanese temporal hours (不定時法) in the GNOME top bar.
//
// Day (dawn → dusk) and night (dusk → dawn) are each divided into six toki
// of equal but seasonally varying length. Bells strike at 正刻 — the CENTER
// of each toki: solar noon is the middle of 午 (正午), solar midnight the
// middle of 子 (正子). Toki boundaries lie halfway between adjacent bells;
// the seam hours 卯 and 酉 are stitched from night and day halves of
// different rates. Panel shows the bare kanji; the popup lists all twelve
// hours. All options live in GSettings (see prefs.js). No notifications
// are ever emitted.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UPDATE_SECONDS = 30;
const STRIKE_INTERVAL_MS = 3000;   // pause between bell strikes
const CHIME_TOLERANCE_MS = 90000;  // skip a strike this stale (e.g. after suspend)
const PANEL_SUFFIX = '';        // bare kanji in the panel (午)

// ── Tables ──────────────────────────────────────────────────────────
const DAY_BRANCHES = ['卯', '辰', '巳', '午', '未', '申'];
const NIGHT_BRANCHES = ['酉', '戌', '亥', '子', '丑', '寅'];
const BELL_COUNT = {
    '卯': 6, '辰': 5, '巳': 4, '午': 9, '未': 8, '申': 7,
    '酉': 6, '戌': 5, '亥': 4, '子': 9, '丑': 8, '寅': 7,
};

// Slavic three-form plural selector.
const plural3 = (n, one, few, many) => {
    if (n % 10 === 1 && n % 100 !== 11)
        return one;
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20))
        return few;
    return many;
};
const CJK_NUM = {4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九'};

const pluralLt = (n, one, few, many) => {
    if (n % 10 === 1 && n % 100 !== 11)
        return one;
    if (n % 10 >= 2 && (n % 100 < 10 || n % 100 >= 20))
        return few;
    return many;
};

// Animal names are given in the grammatical case that fits the
// "hour of the X" frame of each language.
const L10N = {
    en: {
        animals: {
            '子': 'Rat', '丑': 'Ox', '寅': 'Tiger', '卯': 'Rabbit',
            '辰': 'Dragon', '巳': 'Snake', '午': 'Horse', '未': 'Goat',
            '申': 'Monkey', '酉': 'Rooster', '戌': 'Dog', '亥': 'Pig',
        },
        hourOf: (_b, a) => `hour of the ${a}`,
        strikes: n => `${n} ${n === 1 ? 'strike' : 'strikes'}`,
        bell: t => `bell ${t}`,
        min: n => `${n} min`,
        dawnDusk: (a, b) => `Dawn ${a} · Dusk ${b}`,
        geo: 'geolocation',
        manual: 'manual',
        polar: 'Polar day/night: the day cannot be divided',
    },
    ru: {
        animals: {
            '子': 'Крысы', '丑': 'Быка', '寅': 'Тигра', '卯': 'Кролика',
            '辰': 'Дракона', '巳': 'Змеи', '午': 'Лошади', '未': 'Козы',
            '申': 'Обезьяны', '酉': 'Петуха', '戌': 'Собаки', '亥': 'Свиньи',
        },
        hourOf: (_b, a) => `час ${a}`,
        strikes: n => `${n} ${plural3(n, 'удар', 'удара', 'ударов')}`,
        bell: t => `колокол ${t}`,
        min: n => `${n} мин`,
        dawnDusk: (a, b) => `Рассвет ${a} · Закат ${b}`,
        geo: 'геолокация',
        manual: 'вручную',
        polar: 'Полярный день/ночь: сутки неделимы',
    },
    lt: {
        animals: {
            '子': 'Žiurkės', '丑': 'Jaučio', '寅': 'Tigro', '卯': 'Triušio',
            '辰': 'Drakono', '巳': 'Gyvatės', '午': 'Arklio', '未': 'Ožkos',
            '申': 'Beždžionės', '酉': 'Gaidžio', '戌': 'Šuns', '亥': 'Kiaulės',
        },
        hourOf: (_b, a) => `${a} valanda`,
        strikes: n => `${n} ${pluralLt(n, 'dūžis', 'dūžiai', 'dūžių')}`,
        bell: t => `varpas ${t}`,
        min: n => `${n} min`,
        dawnDusk: (a, b) => `Aušra ${a} · Sutemos ${b}`,
        geo: 'geolokacija',
        manual: 'rankinis',
        polar: 'Poliarinė diena/naktis: paros padalyti neįmanoma',
    },
    be: {
        animals: {
            '子': 'Пацука', '丑': 'Быка', '寅': 'Тыгра', '卯': 'Труса',
            '辰': 'Цмока', '巳': 'Змяі', '午': 'Каня', '未': 'Казы',
            '申': 'Малпы', '酉': 'Пеўня', '戌': 'Сабакі', '亥': 'Свінні',
        },
        hourOf: (_b, a) => `гадзіна ${a}`,
        strikes: n => `${n} ${plural3(n, 'удар', 'удары', 'удараў')}`,
        bell: t => `звон ${t}`,
        min: n => `${n} хв`,
        dawnDusk: (a, b) => `Світанак ${a} · Змярканне ${b}`,
        geo: 'геалакацыя',
        manual: 'уручную',
        polar: 'Палярны дзень/ноч: суткі непадзельныя',
    },
    zh: {
        animals: {
            '子': '鼠', '丑': '牛', '寅': '虎', '卯': '兔',
            '辰': '龙', '巳': '蛇', '午': '马', '未': '羊',
            '申': '猴', '酉': '鸡', '戌': '狗', '亥': '猪',
        },
        hourOf: (b, a) => `${b}时（${a}）`,
        strikes: n => `${CJK_NUM[n] ?? n}响`,
        bell: t => `正刻 ${t}`,
        min: n => `${n}分钟`,
        dawnDusk: (a, b) => `天明 ${a} · 黄昏 ${b}`,
        geo: '定位',
        manual: '手动',
        polar: '极昼/极夜：无法划分昼夜',
    },
    ja: {
        animals: {
            '子': 'ね', '丑': 'うし', '寅': 'とら', '卯': 'う',
            '辰': 'たつ', '巳': 'み', '午': 'うま', '未': 'ひつじ',
            '申': 'さる', '酉': 'とり', '戌': 'いぬ', '亥': 'い',
        },
        hourOf: (b, a) => `${b}の刻（${a}）`,
        strikes: n => `${CJK_NUM[n] ?? n}つ`,
        bell: t => `正刻 ${t}`,
        min: n => `${n}分`,
        dawnDusk: (a, b) => `明け六つ ${a} · 暮れ六つ ${b}`,
        geo: '位置情報',
        manual: '手動',
        polar: '極昼・極夜のため昼夜を分割できません',
    },
};

function pickLocale(pref) {
    if (pref !== 'auto')
        return L10N[pref] ? pref : 'en';
    for (const name of GLib.get_language_names()) {
        const code = name.split(/[._@]/)[0].toLowerCase().split('-')[0];
        if (L10N[code])
            return code;
    }
    return 'en';
}

// ── Solar calculations (SunCalc algorithm, BSD) ─────────────────────
const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588, J2000 = 2451545;
const E_OBL = RAD * 23.4397;

const toJulian = d => d.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = j => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = d => toJulian(d) - J2000;

function sunTimes(date, lat, lng) {
    const lw = RAD * -lng;
    const phi = RAD * lat;
    const d = toDays(date);
    const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
    const ds = 0.0009 + lw / (2 * Math.PI) + n;
    const M = RAD * (357.5291 + 0.98560028 * ds);
    const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) +
        0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(0) * Math.cos(E_OBL) +
        Math.cos(0) * Math.sin(E_OBL) * Math.sin(L));
    const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const h0 = RAD * -0.833;
    const cosH = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) /
        (Math.cos(phi) * Math.cos(dec));
    if (cosH < -1 || cosH > 1)
        return null; // polar day/night
    const w = Math.acos(cosH);
    const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
    const Jset = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return {sunrise: fromJulian(Jrise), sunset: fromJulian(Jset)};
}

// ── Toki computation ────────────────────────────────────────────────
function dawnDusk(date, lat, lon, offsetMin) {
    const t = sunTimes(date, lat, lon);
    if (!t)
        return null;
    const off = offsetMin * 60000;
    return {
        dawn: new Date(t.sunrise.getTime() - off),
        dusk: new Date(t.sunset.getTime() + off),
    };
}

function computeToki(now, lat, lon, offsetMin) {
    const t = now.getTime();
    const today = dawnDusk(now, lat, lon, offsetMin);
    const yest = dawnDusk(new Date(t - DAY_MS), lat, lon, offsetMin);
    const tom = dawnDusk(new Date(t + DAY_MS), lat, lon, offsetMin);
    if (!today || !yest || !tom)
        return null;

    const dYest = (yest.dusk - yest.dawn) / 6;
    const nPrev = (today.dawn - yest.dusk) / 6;
    const dDay = (today.dusk - today.dawn) / 6;
    const nNext = (tom.dawn - today.dusk) / 6;
    const dTom = (tom.dusk - tom.dawn) / 6;
    if (dYest <= 0 || nPrev <= 0 || dDay <= 0 || nNext <= 0 || dTom <= 0)
        return null; // twilight ate the night: treat as polar

    const segs = [];
    const addRun = (bell0, unit, branches, halfBefore0, isDayRun) => {
        for (let k = 0; k < 6; k++) {
            const bell = bell0 + k * unit;
            const start = bell - (k === 0 ? halfBefore0 : unit / 2);
            const end = bell + unit / 2;
            segs.push({branch: branches[k], start, end, bell, isDay: isDayRun});
        }
    };
    addRun(yest.dusk.getTime(), nPrev, NIGHT_BRANCHES, dYest / 2, false);
    addRun(today.dawn.getTime(), dDay, DAY_BRANCHES, nPrev / 2, true);
    addRun(today.dusk.getTime(), nNext, NIGHT_BRANCHES, dDay / 2, false);
    addRun(tom.dawn.getTime(), dTom, DAY_BRANCHES, nNext / 2, true);

    const idx = segs.findIndex(s => t >= s.start && t < s.end);
    if (idx < 0)
        return null;
    const seg = segs[idx];

    // Schedule: 12 hours — the run containing "now" plus the next one.
    const runStart = Math.floor(idx / 6) * 6;
    const schedule = segs.slice(runStart, runStart + 12);

    const wrap = s => ({
        branch: s.branch,
        start: new Date(s.start),
        end: new Date(s.end),
        bell: new Date(s.bell),
        spanMin: Math.round((s.end - s.start) / 60000),
        isDay: s.isDay,
        current: s === seg,
    });
    return {toki: wrap(seg), schedule: schedule.map(wrap), today};
}

function hhmm(d, use12) {
    const h24 = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    if (!use12)
        return `${String(h24).padStart(2, '0')}:${m}`;
    let h = h24 % 12;
    if (h === 0)
        h = 12;
    return `${h}:${m}${h24 < 12 ? 'am' : 'pm'}`;
}

// ── Extension ───────────────────────────────────────────────────────
export default class WadokeiExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._geoLat = null;
        this._lastSchedule = null;
        this._schedKey = '';
        this._chimeTimer = null;
        this._strikeTimers = new Set();
        this._geoLon = null;

        this._indicator = new PanelMenu.Button(0.5, 'Wadokei', false);
        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._indicator.add_child(this._label);

        this._infoItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._rangeItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._indicator.menu.addMenuItem(this._infoItem);
        this._indicator.menu.addMenuItem(this._rangeItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._rows = [];
        for (let i = 0; i < 12; i++) {
            const row = new PopupMenu.PopupMenuItem('', {reactive: false});
            row.label.add_style_class_name('wadokei-row');
            this._indicator.menu.addMenuItem(row);
            this._rows.push(row);
        }

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._sunItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._locItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._indicator.menu.addMenuItem(this._sunItem);
        this._indicator.menu.addMenuItem(this._locItem);

        this._openId = this._indicator.menu.connect(
            'open-state-changed', (_menu, open) => {
                if (open)
                    this._update();
            });

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settingsId = this._settings.connect('changed', () => {
            this._update();
            this._armChime();
        });
        this._ifaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._ifaceId = this._ifaceSettings.connect(
            'changed::clock-format', () => this._update());

        this._update();
        this._timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, UPDATE_SECONDS, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });

        this._geoCancellable = new Gio.Cancellable();
        this._initGeoclue().catch(() => {});
    }

    disable() {
        if (this._chimeTimer) {
            GLib.source_remove(this._chimeTimer);
            this._chimeTimer = null;
        }
        this._stopStrikes();
        this._strikeTimers = null;
        this._lastSchedule = null;
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
        if (this._geoCancellable) {
            this._geoCancellable.cancel();
            this._geoCancellable = null;
        }
        if (this._geoId && this._geoclue) {
            this._geoclue.disconnect(this._geoId);
            this._geoId = null;
        }
        this._geoclue = null;
        if (this._settingsId && this._settings) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = null;
        }
        this._settings = null;
        if (this._ifaceId && this._ifaceSettings) {
            this._ifaceSettings.disconnect(this._ifaceId);
            this._ifaceId = null;
        }
        this._ifaceSettings = null;
        if (this._openId && this._indicator) {
            this._indicator.menu.disconnect(this._openId);
            this._openId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._label = null;
        this._infoItem = null;
        this._rangeItem = null;
        this._sunItem = null;
        this._locItem = null;
        this._rows = null;
    }

    async _initGeoclue() {
        let Geoclue;
        try {
            Geoclue = (await import('gi://Geoclue')).default;
        } catch (e) {
            return; // no typelib — manual coordinates only
        }
        Geoclue.Simple.new(
            'org.gnome.Shell',
            Geoclue.AccuracyLevel.CITY,
            this._geoCancellable,
            (_obj, res) => {
                let simple;
                try {
                    simple = Geoclue.Simple.new_finish(res);
                } catch (e) {
                    return; // cancelled, denied in privacy settings, etc.
                }
                if (!this._indicator)
                    return; // extension was disabled meanwhile
                this._geoclue = simple;
                this._geoId = simple.connect('notify::location',
                    () => this._applyLocation());
                this._applyLocation();
            });
    }

    _applyLocation() {
        const loc = this._geoclue?.get_location();
        if (!loc)
            return;
        this._geoLat = loc.latitude;
        this._geoLon = loc.longitude;
        this._update();
    }

    _update() {
        if (!this._settings)
            return;
        const T = L10N[pickLocale(this._settings.get_string('language'))];
        const useGeo = this._settings.get_boolean('use-geolocation');
        const geoActive = useGeo && this._geoLat !== null;
        const lat = geoActive ? this._geoLat : this._settings.get_double('latitude');
        const lon = geoActive ? this._geoLon : this._settings.get_double('longitude');
        const offset = this._settings.get_int('dawn-dusk-offset');
        const tf = this._settings.get_string('time-format');
        const use12 = tf === '12h' ||
            (tf === 'system' &&
             this._ifaceSettings.get_string('clock-format') === '12h');

        const res = computeToki(new Date(), lat, lon, offset);
        if (!res) {
            this._lastSchedule = null;
            this._schedKey = '';
            if (this._chimeTimer) {
                GLib.source_remove(this._chimeTimer);
                this._chimeTimer = null;
            }
            this._label.set_text('—');
            this._infoItem.label.set_text(T.polar);
            this._rangeItem.label.set_text('');
            this._sunItem.label.set_text('');
            this._locItem.label.set_text('');
            for (const row of this._rows)
                row.label.set_text('');
            return;
        }
        const {toki, schedule, today} = res;

        const key = schedule.map(x => `${x.branch}@${x.bell.getTime()}`).join(',');
        if (key !== this._schedKey) {
            this._schedKey = key;
            this._lastSchedule = schedule;
            this._armChime();
        }

        this._label.set_text(`${toki.branch}${PANEL_SUFFIX}`);
        this._infoItem.label.set_text(
            `${toki.branch} — ${T.hourOf(toki.branch, T.animals[toki.branch])}, ` +
            T.strikes(BELL_COUNT[toki.branch]));
        this._rangeItem.label.set_text(
            `${hhmm(toki.start, use12)} – ${hhmm(toki.end, use12)} · ` +
            `${T.bell(hhmm(toki.bell, use12))} · ${T.min(toki.spanMin)}`);

        for (let i = 0; i < 12; i++) {
            const s = schedule[i];
            const row = this._rows[i];
            row.label.set_text(
                `${s.branch} ${BELL_COUNT[s.branch]} ` +
                `${hhmm(s.start, use12)}–${hhmm(s.end, use12)} ${T.animals[s.branch]}`);
            row.setOrnament(s.current
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }

        this._sunItem.label.set_text(
            T.dawnDusk(hhmm(today.dawn, use12), hhmm(today.dusk, use12)));
        this._locItem.label.set_text(
            `${lat.toFixed(3)}°, ${lon.toFixed(3)}° · ` +
            (geoActive ? T.geo : T.manual));
    }

    _armChime() {
        if (this._chimeTimer) {
            GLib.source_remove(this._chimeTimer);
            this._chimeTimer = null;
        }
        if (!this._settings?.get_boolean('chime-enabled')) {
            this._stopStrikes();
            return;
        }
        const sched = this._lastSchedule;
        if (!sched)
            return;
        const now = Date.now();
        const next = sched.find(x => x.bell.getTime() > now + 1000);
        if (!next)
            return;
        this._chimeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            next.bell.getTime() - now, () => {
                this._chimeTimer = null;
                if (Math.abs(Date.now() - next.bell.getTime()) < CHIME_TOLERANCE_MS)
                    this._strike(BELL_COUNT[next.branch]);
                this._armChime();
                return GLib.SOURCE_REMOVE;
            });
    }

    _stopStrikes() {
        if (!this._strikeTimers)
            return;
        for (const id of this._strikeTimers)
            GLib.source_remove(id);
        this._strikeTimers.clear();
    }

    _strike(count) {
        const custom = this._settings.get_string('chime-sound');
        const file = Gio.File.new_for_path(
            custom || `${this.path}/assets/bell.oga`);
        const player = global.display.get_sound_player();
        for (let i = 0; i < count; i++) {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                i * STRIKE_INTERVAL_MS, () => {
                    this._strikeTimers.delete(id);
                    player.play_from_file(file, 'Wadokei bell', null);
                    return GLib.SOURCE_REMOVE;
                });
            this._strikeTimers.add(id);
        }
    }
}
