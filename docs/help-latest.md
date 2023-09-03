
# Wireshark plugin for Bluetooth HCI monitor over RTT

This plugin connects [Wireshark](https://www.wireshark.org/) with [Bluetooth HCI monitor available in Zephyr](https://docs.zephyrproject.org/latest/kconfig.html#CONFIG_BT_DEBUG_MONITOR_RTT).
It allows real-time HCI packet capturing.

It was designed with Zephyr in mind,
but both RTT and  Bluetooth HCI monitor protocol are not Zephyr-specific,
so it can be used also with other devices.

# Installation

1. Requirements:

    * Python, version 3.8 or newer,
    
    * [Segger J-Link Software](https://www.segger.com/downloads/jlink/),
    
    * [Wireshark](https://www.wireshark.org/) version 3.6 or newer.<br>
        *(if you want to see correctly formatted Zephyr's logs, you need at least 4.2)*.
    

1. Place the **[`hci_monitor_rtt.py`](https://github.com/org/repo/releases/latest/download/hci_monitor_rtt.py)**
    file in the Wireshark's extcap plugins directory.<br>
    If you don't know where is it, run Wireshark, click `Help` → `About Wireshark` → `Folders` → `Personal Extcap path`.

1. Run `hci_monitor_rtt.py` from the extcap plugins directory to do first-time configuration.

    ```
    python3 hci_monitor_rtt.py
    ```

    It may take a few minutes in Windows.

1. Restart Wireshark or refresh interfaces with `Capture` → `Refresh Interfaces F5`.
    You should see a new capturing interface: **`Bluetooth HCI monitor over RTT`**.

# Capturing

Prepare and connect your device for capturing. For Zephyr devices, see [Using Zephyr](#using-zephyr).

Before you start capturing, click the interface options (**⚙** small gear icon near the interface name).
Fill standard RTT options.
For more details, see [Interface Options](#interface-options).
Use device name from links at the top this page.

Start capturing by double clicking the interface name `Bluetooth HCI monitor over RTT`.

# Updates

You can check for newest plugin updates by clicking "Help" button in the **⚙** interface options.
You will be redirected to a help page that will tell you if you need an update and how to do it.

# Interface Options

# Making logs more visible

<% if (wiresharkVersion && wiresharkVersion.number < 40200) { %>
!!! warning Wireshark version compatibility
    This chapter contains information for newer version of the Wireshark.
    See details [above](#version-4.2).
<% } %>


# Using Zephyr
