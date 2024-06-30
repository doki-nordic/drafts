
#define MODULE SHELL
#if CAT(MODULE_, MODULE)



#endif


/** @brief Enable UART{x}
 *
 * This option will enable the UART{x}.
 */
#ifndef CONFIG_UARTn_ENABLED
#define CONFIG_UARTn_ENABLED CORE_APP
#endif

CONFIG_UARTn_ENABLED

/*
n - at least one digit, e.g. 0, 1, 2, 99, 001
a - at least one upper case alphabetic character, e.g. A, B, UART
x - at least one digit or upper case alphabetic character, e.g. P1, UART0, 99X
nn - at least one underscore or digit, e.g. 0_0, _9
aa - at least one underscore or upper case alphabetic character, e.g. UNUSED_VALUE
xx - at least one underscore, digit or upper case alphabetic character, e.g. BAUND_115200

*/

#if CONFIG_UARTn_ENABLED

/** @brief UART{x} baud rate
 *
 * This option will enable the UART{x}.
 *
 * @config_type{bool}
 */
#ifndef CONFIG_UARTn_BAUDRATE
#define CONFIG_UARTn_BAUDRATE 115200
#endif

/** @brief UART{x} parity bit configuration.
 *
 * Can be values of @ref{enum uart_parity}.
 * @config_type{uart_parity}
 */
#ifndef CONFIG_UARTn_PARITY
#define CONFIG_UARTn_PARITY UART_PARITY_NONE
#endif

enum uart_parity {
    UART_PARITY_NONE = 0,
    UART_PARITY_ODD = 1,
    UART_PARITY_EVEN = 2,
};

#define CONFIG_UARTn_FLOW_CONTROL

/** @brief Which core is using UART{x}.
 *
 * Can be values of @ref{enum core_type}. You can also use special defines:
 * - CORE_CURRENT - core that this source code is compiled to,
 * - CORE_DEFAULT - default core for this MCU, which is CORE_APP for now.
 * @config_type{enum core_type}
 */
#ifndef CONFIG_UARTn_CORE
#define COMMON_CONFIG_UARTn_CORE CORE_DEFAULT
#endif

/** @brief Owner of UART{n}.
 *
 * @config_type{any}
 */
#ifndef CONFIG_UARTn_USED_BY
#define CONFIG_UARTn_USED_BY no_one
#endif

#endif

#if CONFIG_MCU_FAMILY == MCU_FAMILY_NRF52
TEMPLATE_CONFIG(CONFIG_UART0, CONFIG_UARTn)
TEMPLATE_CONFIG(CONFIG_UART1, CONFIG_UARTn)
TEMPLATE_CONFIG(CONFIG_UART2, CONFIG_UARTn)
#elif CONFIG_MCU_FAMILY == MCU_FAMILY_NRF53

#ifndef CONFIG_UART1_ENABLED
#define CONFIG_UART1_ENABLED
#endif

#define COMMON_CONFIG_UART0 COMMON_CONFIG_UART0
#define COMMON_CONFIG_UART1 COMMON_CONFIG_UART1
#define COMMON_CONFIG_UART2 COMMON_CONFIG_UART2
#define COMMON_CONFIG_UART3 COMMON_CONFIG_UART3

/** @brief Port P0.12
 */
#define GPIO_P0_12 0, 12


/** @config_enum{UART_TX_PINS} */
#define GPIO_P0_12 0, 12


#ifndef CONFIG_LED0_PIN
#define CONFIG_LED0_PIN
#endif


ENSURE_CONFIG(
    CONFIG_LED0_PIN == GPIO_P0_12 &&
    CONFIG_LED1_PIN == GPIO_P0_13 &&
    CONFIG_LED2_PIN == GPIO_P0_14 &&
    CONFIG_LED3_PIN == GPIO_P0_15
);


static const uint8_t led_pins[] = {
    #define MY_MACRO(LED_PIN) GPIO_GET_PIN(LED_PIN)
    ENUMERATE_CONFIG("(CONFIG_LED[0-9]+_PIN)", MY_MACRO, ENUMERATOR_LEDx_PIN)
    #undef MY_MACRO
}

static const GPIO_PORT led_ports[] = {
    #define MY_MACRO(LED_PIN) GPIO_GET_PORT(LED_PIN)
    ENUMERATE_CONFIG("(CONFIG_LED[0-9]+_PIN)", MY_MACRO, ENUMERATOR_LEDx_PIN)
    #undef MY_MACRO
}

ENSURE_CONFIG(defined(CONFIG_LED0_PIN) || defined(CONFIG_BUTTON0_PIN),
    "At least LED0 or BUTTON0 is required for the LED_AND_BUTTONS module. "
    "If you have custom board, define CONFIG_LED0_PIN "
    );

ENUMERATE_CONFIG(ENUMERATOR_LEDx_PIN, "(CONFIG_LED[0-9]+_PIN)", GPIO_GET_PORT($1), );

#ifndef _ENUMERATOR_
#define _ENUMERATOR_
#endif





/** @config_type{UART_TX_PINS} */
#define CONFIG_UARTn_TX_PIN

#define SHELL_UART_INST CAT(CONFIG_SHELL_UART, _INSTANCE)


#define CONFIG_SHELL_UART COMMON_CONFIG_UART0

ENSURE_CONFIG('{CONFIG_SHELL_UART}_ENABLED' == 1);
ENSURE_CONFIG('{CONFIG_SHELL_UART}_CORE' == CORE_CURRENT);
ENSURE_CONFIG('{CONFIG_SHELL_UART}_BAUDRATE' >= 9600 && '{CONFIG_SHELL_UART}_BAUDRATE' <= 115200);
ENSURE_CONFIG('{CONFIG_SHELL_UART}_USED_BY' == shell);
ENSURE_CONFIG('{CONFIG_SHELL_UART}_RX_PIN' == GPIO_P0_12 && '{CONFIG_SHELL_UART}_BAUDRATE' > 115200,
    "Pin P0.12 supports at most 115200 bps")

ENSURE_CURRENT_CORE(CONFIG_SHELL_UART)


ENSURE_CONFIG(CONFIG_UART2_ENABLED == 1);
ENSURE_CONFIG(CONFIG_UART2_CORE == CORE_CURRENT);
ENSURE_CONFIG(CONFIG_UART2_BAUDRATE == 115200);
ENSURE_CONFIG(CONFIG_UART2_USED_BY == sample_nus_service);

ENSURE_CONFIG(
    CONFIG_USBD_VID == 0x776F &&
    CONFIG_USBD_PID == 0xA007 &&
    CONFIG_USBD_VENDOR_STRING == "Nordic Semiconductor" &&
    CONFIG_USBD_PRODUCT_STRING == "BLE NUS Sample"
);


 
#define CONFIG_MCU // The same on each core
#define CONFIG_HEAP_SIZE // Different on each core
#define CONFIG_APP_RAD_SHARED_BUFFER // The same on each core, but actually used only by radio, application core, and additionaly image manager.

#define MCU_FAMILY_NRF51 1 // nRF51
#define MCU_FAMILY_NRF52 2 // nRF52
#define MCU_FAMILY_NRF53 3 // nRF53
#define MCU_FAMILY_NRF54 4 // nRF54
#define MCU_FAMILY_NRF91 5 // nRF91
//...

#define MCU_NRF5232 1
#define MCU_NRF5240 2
// ...

#define CONFIG_MCU MCU_NRF5240
#define CONFIG_MCU_FAMILY MCU_FAMILY_NRF52

#include "uart1.h"


#include "shell.h"


ENSURE_CONFIG(PPR_CONFIG_HEAP_SIZE >= 4 * 1024);
ENSURE_CONFIG(CONFIG_APP_RAD_SHARED_BUFFER >= 1024);


int main() {
    while (1) {};
}

ENSURE_CONFIG(CONFIG_APP_RAD_SHARED_BUFFER >= 2 * 1024);

RAD_CONFIG_MODULE_SHELL
