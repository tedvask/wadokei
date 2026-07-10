UUID = wadokei@tianci.vilnius

.PHONY: all pack install clean

all: pack

pack:
	gnome-extensions pack src --extra-source=assets --force -o .

install: pack
	gnome-extensions install --force $(UUID).shell-extension.zip
	@echo "Re-login to load the new version."

clean:
	rm -f $(UUID).shell-extension.zip
