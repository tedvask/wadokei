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
// hours. Location comes from GeoClue when available, otherwise from the
// static fallback below. No notifications are ever emitted.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

// ── Settings ────────────────────────────────────────────────────────
const FALLBACK_LAT = 35.6842;   // Nihonbashi, Tokyo — zero milestone of Edo
const FALLBACK_LON = 139.7745;  // (used until/unless GeoClue delivers)
// Edo convention: dawn/dusk is "when the lines of your palm become
// visible" — roughly 36 min before sunrise / after sunset.
// Set to 0 for plain sunrise/sunset.
const DAWN_DUSK_OFFSET_MIN = 36;
const UPDATE_SECONDS = 30;
const PANEL_SUFFIX = '';        // bare kanji in the panel (午)

// ── Tables ──────────────────────────────────────────────────────────
const DAY_BRANCHES = ['卯', '辰', '巳', '午', '未', '申'];
const NIGHT_BRANCHES = ['酉', '戌', '亥', '子', '丑', '寅'];
const BELL_COUNT = {
    '卯': 6, '辰': 5, '巳': 4, '午': 9, '未': 8, '申': 7,
    '酉': 6, '戌': 5, '亥': 4, '子': 9, '丑': 8, '寅': 7,
};
// Translators: animal names are used in the frame "hour of the %s";
// use the grammatical case that fits that frame in your language.
const ANIMAL = {
    '子': N_('Rat'), '丑': N_('Ox'), '寅': N_('Tiger'), '卯': N_('Rabbit'),
    '辰': N_('Dragon'), '巳': N_('Snake'), '午': N_('Horse'), '未': N_('Goat'),
    '申': N_('Monkey'), '酉': N_('Rooster'), '戌': N_('Dog'), '亥': N_('Pig'),
};

const N_ = s => s; // no-op marker for xgettext

// Tiny sprintf: sequential %s / %d.
const fmt = (s, ...args) => s.replace(/%[sd]/g, () => String(args.shift()));

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
function dawnDusk(date, lat, lon) {
    const t = sunTimes(date, lat, lon);
    if (!t)
        return null;
    const off = DAWN_DUSK_OFFSET_MIN * 60000;
    return {
        dawn: new Date(t.sunrise.getTime() - off),
        dusk: new Date(t.sunset.getTime() + off),
    };
}

function computeToki(now, lat, lon) {
    const t = now.getTime();
    const today = dawnDusk(now, lat, lon);
    const yest = dawnDusk(new Date(t - DAY_MS), lat, lon);
    const tom = dawnDusk(new Date(t + DAY_MS), lat, lon);
    if (!today || !yest || !tom)
        return null;

    const dYest = (yest.dusk - yest.dawn) / 6;
    const nPrev = (today.dawn - yest.dusk) / 6;
    const dDay = (today.dusk - today.dawn) / 6;
    const nNext = (tom.dawn - today.dusk) / 6;
    const dTom = (tom.dusk - tom.dawn) / 6;

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

function hhmm(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Extension ───────────────────────────────────────────────────────
export default class WadokeiExtension extends Extension {
    enable() {
        this._lat = FALLBACK_LAT;
        this._lon = FALLBACK_LON;
        this._geoActive = false;

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
            row.label.set_style('font-family: monospace;');
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
            return; // no typelib — stay on fallback coordinates
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
                    return; // cancelled, disabled in privacy settings, etc.
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
        this._lat = loc.latitude;
        this._lon = loc.longitude;
        this._geoActive = true;
        this._update();
    }

    _update() {
        const res = computeToki(new Date(), this._lat, this._lon);
        if (!res) {
            this._label.set_text('—');
            this._infoItem.label.set_text(
                _('Polar day/night: the day cannot be divided'));
            this._rangeItem.label.set_text('');
            this._sunItem.label.set_text('');
            this._locItem.label.set_text('');
            for (const row of this._rows)
                row.label.set_text('');
            return;
        }
        const {toki, schedule, today} = res;
        const strikes = n => fmt(ngettext('%d strike', '%d strikes', n), n);

        this._label.set_text(`${toki.branch}${PANEL_SUFFIX}`);
        this._infoItem.label.set_text(
            `${toki.branch} — ${fmt(_('hour of the %s'), _(ANIMAL[toki.branch]))}, ` +
            strikes(BELL_COUNT[toki.branch]));
        this._rangeItem.label.set_text(
            `${hhmm(toki.start)} – ${hhmm(toki.end)} · ` +
            `${fmt(_('bell %s'), hhmm(toki.bell))} · ` +
            fmt(_('%d min'), toki.spanMin));

        for (let i = 0; i < 12; i++) {
            const s = schedule[i];
            const row = this._rows[i];
            row.label.set_text(
                `${s.branch} ${BELL_COUNT[s.branch]} ` +
                `${hhmm(s.start)}–${hhmm(s.end)} ${_(ANIMAL[s.branch])}`);
            row.setOrnament(s.current
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }

        this._sunItem.label.set_text(
            fmt(_('Dawn %s · Dusk %s'), hhmm(today.dawn), hhmm(today.dusk)));
        this._locItem.label.set_text(
            `${this._lat.toFixed(3)}°, ${this._lon.toFixed(3)}° · ` +
            (this._geoActive ? _('geolocation') : _('preset')));
    }
}
