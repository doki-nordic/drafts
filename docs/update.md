
<% if (userVersion && latestVerInfo.version.number > userVersion.number) { %>

!!! info New update available!

    ### Version <%= latestVerInfo.version.str %>

    Use the following command to update your plugin from version
    **<%= userVersion.str %>** to version **<%= latestVerInfo.version.str %>**:

    ```
    <%= updateCommand %>
    ```

    See [Update Release Notes](#release-notes-<%= userVersion.str %>--<%= latestVerInfo.version.str %>) for details.

<% } %>


<% if (wiresharkVersion && wiresharkVersion.number < 40200) { %>

!!! warning <span id="version-4.2">Wireshark version compatibility</span>
    Your Wireshark version <%= wiresharkVersion.str %> does not show logs correctly.
    Update to version **4.2** or newer to see correctly formatted logs.

    Go to [Wireshark's download page](https://www.wireshark.org/download.html) to get
    the latest version.

<% } %>
