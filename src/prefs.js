// SPDX-License-Identifier: GPL-3.0-or-later

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LANG_CODES = ['auto', 'en', 'ru', 'lt', 'be'];
const LANG_NAMES = ['System / Системный', 'English', 'Русский', 'Lietuvių', 'Беларуская'];

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
