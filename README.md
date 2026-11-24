# Dial Studio

A simple, local shortcut editor for a Bluetooth knob. Open `index.html` in a
modern browser, or serve this directory with `python3 -m http.server`.

Choose a knob action and press a key combination to change it. Your mappings
are saved in your browser and can be exported as JSON. Reset restores the
default mappings.

Bluetooth knobs use different protocols. This editor does not connect to a
device or send mappings to it; use your knob's supported software to apply
the exported settings.
