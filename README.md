# Wireshark plugin for Bluetooth HCI monitor over RTT

This plugin connects [Wireshark](https://www.wireshark.org/) with [Bluetooth HCI monitor available in Zephyr](https://docs.zephyrproject.org/latest/kconfig.html#CONFIG_BT_DEBUG_MONITOR_RTT).
It allows a real-time HCI packet capturing.

## Requirements

The plugin requires:
* Python, version 3.8 or newer,
* [Segger J-Link Software](https://www.segger.com/downloads/jlink/),
* [Wireshark](https://www.wireshark.org/) version 3.6 or newer,\
  *(if you want to see correctly formatted Zephyr's logs, you need at least 4.2)*.

## Installation

1. Place the `hci_monitor_rtt.py` file in the Wireshark's extcap plugins directory.\
   If you don't know where is the directory, run Wireshark, select `Help` → `About Wireshark` → `Folders` → `Personal Extcap path` or `Global Extcap path`.
   `Global` is for all users, `Personal` is just for you.
2. **Windows only:** Do automatic plugin configuration.
   Run `hci_monitor_rtt.py` from the extcap plugins directory.
   It will create a Python's virtual environment and install neccessary packages in it.
   It may take few minutes.
3. Restart Wireshark or refresh interfaces with `Capture` → `Refresh Interfaces F5`.

## Running

After installation, you will see a new capturing interface: **`Bluetooth HCI monitor over RTT`**.

Click interface options (**`⚙`** small gear icon near the interface name) and fill up some RTT options:
* *Main* tab
  * *Device* name - click `Help` to see list of devices,
  * *Interface*,
  * *Speed*,
  * *RTT Channel* - `BT_DEBUG_MONITOR_RTT_BUFFER` Kconfig option, `1` by default,
* *Optional* tab
  * *Serial Number* - fill if you have more J-Link devices connected,
  * *RTT Address*,
  * *JLinkRTTLogger Executable* - fill if you don't have JLinkRTTLogger on your `PATH` or default location,
* *Debug* tab - output log files for plugin trubleshotting and debugging.

Now, you can save and start the capture.

## Logging

Except normal HCI packets, the capture can contain log messages.
They are shown as `HCI_MON` protocol.

The following paragraphs apply to Wireshark version 4.2 and above. If you have older version, you can only see the hex dump of the message.

You can show the log messages in the packet list by adding new columns.
Rigth click on columns → `Column Preferences...` and add new `Custom` column with field `hci_mon.message`.
If you want also add a log level, use `hci_mon.priority` field.

You can colorize log messages.
Go to log message packet. In packet details, rigth click `Priority` → `Colorize with Filter` and select a color.
You can repeat it for each message priority (log level) with different color.

If you want to have permanent log colorization click `View` → `Coloring Rules...`.
Add new rules with `Filter` set to `hci_mon.priority == N`, where `N` is the Linux kernel log priority: 0 - EMERG, 1 - ALERT, 2 - CRIT, 3 - ERR, 4 - WARNING, 5 - NOTICE, 6 - INFO, 7 - DEBUG.
Zephyr uses just some of them.

