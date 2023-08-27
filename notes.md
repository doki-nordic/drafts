
Information:
 * https://gist.github.com/doki-nordic/d1a1ff7315e3aff1ddb88a467143297a
 * Jira task

Docs:
 * https://www.wireshark.org/docs/man-pages/extcap.html
 * https://wiki.wireshark.org/Development/Extcap
 * https://www.wireshark.org/docs/wsdg_html_chunked/ChCaptureExtcap.html
 * https://github.com/wireshark/wireshark/blob/master/doc/extcap_example.py
 * https://tshark.dev/capture/sources/extcap_interfaces/

# Ideas for help

## Logging

Except normal HCI packets, the capture can contain log messages.
They are shown as `HCI_MON` protocol.

The following paragraphs apply to Wireshark version 4.2 and above. If you have older version, you can only see the hex dump of the message.

You can show the log messages in the packet list by adding new columns.
Rigth click on column headers → `Column Preferences...` and add new `Custom` column with field `hci_mon.message`.
If you want also add a log level, use `hci_mon.priority` field.

You can colorize log messages. Click `View` → `Coloring Rules...`.
Add new rules with `Filter` set to `hci_mon.priority == N`, where `N` is the Linux kernel log priority: 0 - `EMERG`, 1 - `ALERT`, 2 - `CRIT`, 3 - `ERR`, 4 - `WARN`, 5 - `NOTICE`, 6 - `INFO`, 7 - `DEBUG`.

Zephyr uses `ERR`, `WARN`, `INFO`, `DEBUG`. If Zephyrs `printk` is captured, it uses `NOTICE`. Plugin may add its own `EMERG` log messages, for example when it gets corrupted data over RTT.

## Config

* Main tab
* Device name - click Help to see list of devices,
* Interface,
* Speed,
* RTT Channel - BT_DEBUG_MONITOR_RTT_BUFFER Kconfig option, 1 by default,
* Optional tab
* Serial Number - fill if you have more J-Link devices connected,
* RTT Address,
* JLinkRTTLogger Executable - fill if you don't have JLinkRTTLogger on your PATH or default location,
* Debug tab - output log files for plugin trubleshotting and debugging.
