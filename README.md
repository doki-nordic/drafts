# List C preprocessor `#if`s

When the C source code gets biger with a lot of `#if`s, you can use this tool to see dependencies of each line.

Sample output (comments starting with `//` are added by this tool):

```c

#if defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
static ssize_t read_central_addr_res(struct bt_conn *conn,                                              // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
				     const struct bt_gatt_attr *attr, void *buf,                        // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
				     uint16_t len, uint16_t offset)                                     // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
{                                                                                                       // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
	uint8_t central_addr_res = BT_GATT_CENTRAL_ADDR_RES_SUPP;                                       // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)

	return bt_gatt_attr_read(conn, attr, buf, len, offset,                                          // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
				 &central_addr_res, sizeof(central_addr_res));                          // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
}                                                                                                       // defined(CONFIG_BT_CENTRAL) && defined(CONFIG_BT_PRIVACY)
#endif /* CONFIG_BT_CENTRAL && CONFIG_BT_PRIVACY */

```
