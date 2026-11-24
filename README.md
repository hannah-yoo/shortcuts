# knob.

A small browser-based configuration editor for a 6-key, 1-knob controller with three layers.

## Run

No build step or package installation is required. Preview `index.html` directly; for reliable browser storage and Bluetooth discovery, serve the site over HTTPS or `localhost` in a browser that supports Web Bluetooth, such as Chrome.

## Features

- Configure six keys per layer with shortcuts, text, media actions, or no action.
- Set each layer's knob direction actions, press action, and per-detent movement amount.
- Save the profile in the current browser and import/export it as JSON.
- Optionally check whether a Bluetooth GATT device can be selected and connected.

The controller's model and communication protocol are not known. Bluetooth is only used to check a connection; this editor does not write settings to the physical device. The exported JSON is a backup, not a device firmware profile.
