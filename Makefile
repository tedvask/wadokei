UUID   = wadokei@tianci.vilnius
DOMAIN = wadokei
BUILD  = build
POS    = $(wildcard po/*.po)

.PHONY: all pot mo pack install clean

all: pack

# Regenerate the translation template from source
pot:
	xgettext --from-code=UTF-8 --language=JavaScript \
	  --keyword=_ --keyword=N_ --keyword=ngettext:1,2 \
	  --package-name=$(DOMAIN) -o po/$(DOMAIN).pot src/extension.js

# Compile .po -> .mo into the build tree
mo:
	@for po in $(POS); do \
	  lang=$$(basename $$po .po); \
	  mkdir -p $(BUILD)/locale/$$lang/LC_MESSAGES; \
	  msgfmt -o $(BUILD)/locale/$$lang/LC_MESSAGES/$(DOMAIN).mo $$po; \
	  echo "  MO  $$lang"; \
	done

# Installable zip
pack: mo
	cp src/extension.js src/metadata.json $(BUILD)/
	cd $(BUILD) && zip -qr ../$(UUID).zip extension.js metadata.json locale
	@echo "  ZIP $(UUID).zip"

install: pack
	gnome-extensions install --force $(UUID).zip
	@echo "Re-login to load the new version."

clean:
	rm -rf $(BUILD) $(UUID).zip
