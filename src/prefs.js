// SPDX-License-Identifier: GPL-3.0-or-later

import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LANG_CODES = ['auto', 'en', 'ru', 'lt', 'be', 'zh', 'ja'];
const LANG_NAMES = ['System / Системный', 'English', 'Русский', 'Lietuvių', 'Беларуская', '中文', '日本語'];

export default class WadokeiPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        // ── Interface ────────────────────────────────────────────
        const ui = new Adw.PreferencesGroup({title: 'Interface'});
        page.add(ui);

        const langRow = new Adw.ComboRow({
            title: 'Language',
            subtitle: 'The twelve branch characters are never translated',
            model: Gtk.StringList.new(LANG_NAMES),
        });
        const current = LANG_CODES.indexOf(settings.get_string('language'));
        langRow.selected = current >= 0 ? current : 0;
        langRow.connect('notify::selected', () => {
            settings.set_string('language', LANG_CODES[langRow.selected]);
        });
        ui.add(langRow);

        // ── Timekeeping ──────────────────────────────────────────
        const time = new Adw.PreferencesGroup({title: 'Timekeeping'});
        page.add(time);

        const TF_CODES = ['system', '12h', '24h'];
        const tfRow = new Adw.ComboRow({
            title: 'Time format',
            model: Gtk.StringList.new(['System', '12-hour', '24-hour']),
        });
        const tfCurrent = TF_CODES.indexOf(settings.get_string('time-format'));
        tfRow.selected = tfCurrent >= 0 ? tfCurrent : 0;
        tfRow.connect('notify::selected', () => {
            settings.set_string('time-format', TF_CODES[tfRow.selected]);
        });
        time.add(tfRow);

        const offsetRow = new Adw.SpinRow({
            title: 'Dawn/dusk offset (minutes)',
            subtitle: 'Edo convention ≈ 36 min before sunrise / after sunset; 0 = astronomical sunrise/sunset',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 90, step_increment: 1, page_increment: 5,
            }),
        });
        settings.bind('dawn-dusk-offset', offsetRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        time.add(offsetRow);

        // ── Chimes ───────────────────────────────────────────────
        const chimes = new Adw.PreferencesGroup({title: 'Chimes'});
        page.add(chimes);

        const chimeRow = new Adw.SwitchRow({
            title: 'Hourly bell',
            subtitle: 'Strike the bell count of each hour at its center (shoukoku)',
        });
        settings.bind('chime-enabled', chimeRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        chimes.add(chimeRow);

        const soundRow = new Adw.ActionRow({title: 'Sound'});
        const updateSoundSubtitle = () => {
            const path = settings.get_string('chime-sound');
            soundRow.subtitle = path
                ? GLib.path_get_basename(path)
                : 'Built-in temple bell (CC0)';
        };
        const chooseBtn = new Gtk.Button({
            label: 'Choose…',
            valign: Gtk.Align.CENTER,
        });
        chooseBtn.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({title: 'Select chime sound'});
            const filter = new Gtk.FileFilter();
            filter.set_name('Audio files');
            filter.add_mime_type('audio/*');
            const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
            filters.append(filter);
            dialog.set_filters(filters);
            dialog.open(window, null, (d, res) => {
                try {
                    const f = d.open_finish(res);
                    if (f)
                        settings.set_string('chime-sound', f.get_path());
                } catch (e) {
                    // dialog dismissed
                }
                updateSoundSubtitle();
            });
        });
        const resetBtn = new Gtk.Button({
            label: 'Default',
            valign: Gtk.Align.CENTER,
        });
        resetBtn.connect('clicked', () => {
            settings.reset('chime-sound');
            updateSoundSubtitle();
        });
        soundRow.add_suffix(chooseBtn);
        soundRow.add_suffix(resetBtn);
        settings.bind('chime-enabled', soundRow, 'sensitive',
            Gio.SettingsBindFlags.GET);
        chimes.add(soundRow);
        updateSoundSubtitle();

        // ── Location ─────────────────────────────────────────────
        const loc = new Adw.PreferencesGroup({title: 'Location'});
        page.add(loc);

        const geoRow = new Adw.SwitchRow({
            title: 'Use geolocation (GeoClue)',
            subtitle: 'Requires location services enabled in Settings → Privacy',
        });
        settings.bind('use-geolocation', geoRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        loc.add(geoRow);

        const latRow = new Adw.SpinRow({
            title: 'Latitude',
            digits: 4,
            adjustment: new Gtk.Adjustment({
                lower: -90, upper: 90, step_increment: 0.01, page_increment: 1,
            }),
        });
        settings.bind('latitude', latRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        loc.add(latRow);

        const lonRow = new Adw.SpinRow({
            title: 'Longitude',
            digits: 4,
            adjustment: new Gtk.Adjustment({
                lower: -180, upper: 180, step_increment: 0.01, page_increment: 1,
            }),
        });
        settings.bind('longitude', lonRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        loc.add(lonRow);

        // Manual coordinates matter only when geolocation is off
        const syncSensitive = () => {
            const manual = !settings.get_boolean('use-geolocation');
            latRow.sensitive = manual;
            lonRow.sensitive = manual;
        };
        const sid = settings.connect('changed::use-geolocation', syncSensitive);
        syncSensitive();
        window.connect('close-request', () => settings.disconnect(sid));
    }
}
