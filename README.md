# Wireshark plugin for Bluetooth HCI monitor over RTT

This plugin connects [Wireshark](https://www.wireshark.org/) with [Bluetooth HCI monitor available in Zephyr](https://docs.zephyrproject.org/latest/kconfig.html#CONFIG_BT_DEBUG_MONITOR_RTT).
It allows real-time HCI packet capturing.

It was designed with Zephyr in mind, but it can be used also with other devices with Linux Bluetooth Monitor protocol over RTT.

## Requirements

* Python, version 3.8 or newer,

* [Segger J-Link Software](https://www.segger.com/downloads/jlink/),

* [Wireshark](https://www.wireshark.org/) version 3.6 or newer,\
  *(if you want to see correctly formatted Zephyr's logs, you need at least 4.2)*.

## Installation

1. Place the **`hci_monitor_rtt.py`** file in the Wireshark's extcap plugins directory.\
   If you don't know where is it, run Wireshark, click `Help` → `About Wireshark` → `Folders` → `Personal Extcap path`.

2. Run `hci_monitor_rtt.py` from the extcap plugins directory to do first-time configuration.
   ```sh
   python3 hci_monitor_rtt.py
   ```
   It may take a few minutes in Windows.

3. Restart Wireshark or refresh interfaces with `Capture` → `Refresh Interfaces F5`.

## Running

After installation, you will see a new capturing interface: **`Bluetooth HCI monitor over RTT`**.

Click interface options (**`⚙`** small gear icon near the interface name) and fill up the RTT options.

Click **`Help`** to see:
 * description of options,
 * list of available devices,
 * tips on how to use the plugin,
 * plugin updates.

The help page will automatically detect if you should update the plugin, so you can click **`Help`** periodically.

Now, you can save the options, connect your device, and start the capturing.
