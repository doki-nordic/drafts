


### Declare configuration option


```c
/** @brief The "foo" configuration option
 *
 * More information about the configuration of "foo".
 */
#ifndef CONFIG_FOO
#define CONFIG_FOO 1
#endif
```

The syntax:

```text
/** @brief Name of the option
 *
 * Help for the option.
 * @config_type{optional_type__retrieved_from_default_value_if_not_provided}
 */
#ifndef prefix_name
#define prefix_name default_value
#endif
```

Available prefixes:
* `CONFIG_` - configuration bounded to the current image
  * `CONFIG_MODULE_` prefix is reserved for module enable/disable
* `COMMON_CONFIG_` - configuration shared between all images
* `[image name]_CONFIG_` - configuration bounded to specific image

Available types:
* `bool` - TRUE or FALSE,
* `int` - integer,
* `string` - string,
* `float` - float,
* `name` - a name of some identifier (or part of it),
* `enum [name]` - enumerations,
* `SOME_TYPE` - enumeration made of defines

If configuration option depends on something:

```c
#if CONFIG_MODULE_HEAP
/** @brief Configures heap size. */
#ifndef CONFIG_HEAP_MAX_SIZE
#define CONFIG_HEAP_MAX_SIZE 4 * 1024
#endif
#endif // CONFIG_MODULE_HEAP
```

### Config assertions

`ENSURE_CONFIG(condition, optional_message)`

Ensures that the configuration option satisfies the specified condition.
If condition is simple, the configuration tool may adjust
the value (if not set by user), so it will satisfy the condition.
It can also narrow range of allowed values (useful for GUI tools).

```c
#define MAX_FOO 100
#define ALIGN_FOO 8
// example of simple assertion:
ENSURE_CONFIG(CONFIG_FOO <= MAX_FOO, "Foo is too small.");
// example of complex assertion:
ENSURE_CONFIG(CONFIG_FOO % ALIGN_FOO == 0, "Foo must be aligned to 8.");
```

Setting values with `ENSURE_CONFIG`.

```c
#ifdef FIXED_FOO
ENSURE_CONFIG(CONFIG_FOO == FIXED_FOO, "Foo must be {FIXED_FOO}.");
#endif
```

Setting values with `#define`.
It will create a new configuration option if it doesn't exist
and set a specified value. If new configuration option is created
the type is determined based on the value.

```c
#ifdef FIXED_FOO
#define CONFIG_FOO FIXED_FOO
#endif
```

User level configuration have higher precedence. It should be
only set on top level application, not in the modules.

```c
SET_CONFIG(CONFIG_HEAP_SIZE = 16 * 1024);
SET_CONFIG(CONFIG_BLE_MAX_CONNECTIONS = 10);
```

### Configuration templates

Normally, configuration options are uppercase. If you use specific lowercase letters
the configuration options become templates. For example

```c
#ifndef COMMON_CONFIG_UARTn_ENABLED
#define COMMON_CONFIG_UARTn_ENABLED 0
#endif

#if COMMON_CONFIG_UARTn_ENABLED

#ifndef COMMON_CONFIG_UARTn_BAUDRATE
#define COMMON_CONFIG_UARTn_BAUDRATE 115200
#endif

#ifndef COMMON_CONFIG_UARTn_CORE
#define COMMON_CONFIG_UARTn_CORE CORE_APP
#endif

#endif
```

To make actual configuration options from the template, use the following macro:

```c
TEMPLATE_CONFIG(CONFIG_UART0, CONFIG_UARTn);
TEMPLATE_CONFIG(CONFIG_UART1, CONFIG_UARTn);
TEMPLATE_CONFIG(CONFIG_UART2, CONFIG_UARTn);
ENSURE_CONFIG(CONFIG_UART2_LIMITED_FUNCTIONALITY == 1, "The UART2 on nRF... chip does not support ....");
```

### Enumerating configuration options

```c
#define MY_MACRO(pin_config_name, pin_number) \
    uint8_t led##pin_number##_pin = GPIO_PIN(pin_config_name);
ENUMERATE_CONFIG("(CONFIG_LED([0-9]+)_PIN)", MY_MACRO, ENUMERATOR_ALL_CONFIG_LEDS);
```

The syntax:

```c
ENUMERATE_CONFIG("regexp pattern", macro, unique_enumeration_name);
```

* regexp pattern is Python-compatible
* macro is executed for each match, parameters are capturing groups of regexp pattern.
* `config.h` file will contain `unique_enumeration_name` definition with
  all matching configurations. You can use the same name if the pattern is the same.

Filtering the list:

```c
ENUMERATE_CONFIG_F("regexp pattern", condition, macro, unique_enumeration_name);
```

The list item will be removed if the condition returns false.
The condition is evaluated in the `config.h` file, so you cannot use
values or macros not available in it. Only command line definitions,
configuration and macros from `macros.h` file.

