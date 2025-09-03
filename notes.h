#ifndef __HEAP_H
#define __HEAP_H

#include <config.h>

#define CONFIG_MODULE_HEAP TRUE

void *malloc(size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);

/** @brief Heap memory size */
#ifndef CONFIG_HEAP_SIZE
#define CONFIG_HEAP_SIZE 4 * 1024
#endif

ENSURE_CONFIG(CONFIG_HEAP_SIZE >= 1024, "Minimum heap size is 1024 bytes.");
ENSURE_CONFIG(CONFIG_HEAP_SIZE % 8 == 0, "Heap size must be aligned to 8 bytes.");


#endif // __HEAP_H


// config --image APP --load path/to/sdk/config_args.txt --source './**/*.c' -I. -DCOMMON_CONFIG_CHIP_NRF54H20=1 -DCOMMON_CONFIG_BOARD_PCA10156=TRUE

/*
--image APP is set by default. "--image" option is required for RAD as a main image.
*/

/*

REG:
    - load: path/to/sdk/reg/config_args.txt

RAD:
    - load: path/to/sdk/images/ipc_radio/config_args.txt

BOOT:
    - load: path/to/sdk/images/bootloader/config_args.txt

PPR:
    - if: defined(WITH_PPR)
    - load: path/to/sdk/config_args.txt
    - source: src/ppr/main.c

APP:
    - load: path/to/sdk/config_args.txt
    - source: src/app/main.c

*/

// reg.c file

#if CONFIG_REGISTERS_UICR_GENERATION

#include <stdint.h>

SECTION(".uicr")
uint32_t UICR[8] = {
    (COMMON_CONFIG_UART0_CORE == CORE_APP ? (0 << 12) : 0) |
    (COMMON_CONFIG_UART0_CORE == CORE_RAD ? (1 << 12) : 0) |
    (COMMON_CONFIG_UART0_CORE == CORE_PPR ? (2 << 12) : 0) |
    0
};

#endif // CONFIG_REGISTERS_UICR_GENERATION

// The UICR and sections can be in all images since they all should be the same.
// Image tool should check if they are the same. If not, ask user to rebuild all images.
// There should be an option to disable UICR generation for specific image (useful in bootloader), e.g.:

/** @brief Enable UICR generation in this image.
 *
 * The final image binary will contain the UICR value configured
 * according to the current core configuration. The image merge tool
 * will check if all images contain the same UICR value.
 *
 * Disable it if you want to create image independent from UICR value.
 */
#ifndef CONFIG_REGISTERS_UICR_GENERATION
#define CONFIG_REGISTERS_UICR_GENERATION TRUE
#endif

// OR instead of image configuration file, use C-like file:

#include "config.h"

IMAGE_DEF(RAD) {
    IMAGE_LOAD("path/to/sdk/images/ipc_radio/config_args.txt");
}

IMAGE(BOOT) {
    LOAD("path/to/sdk/images/bootloader/config_args.txt");
}

#if IS_ENABLED(WITH_PPR)
IMAGE(PPR) {
    LOAD("path/to/sdk/config_args.txt");
    SOURCE("src/ppr/main.c");
}
#endif // IS_ENABLED(WITH_PPR)

IMAGE(APP) {
    LOAD("path/to/sdk/config_args.txt");
    SOURCE("src/app/main.c");
}

// OR if it can be inside actual source file:
// If some image was enabled (or disabled), entire configuration tool is rerun forgetting about any previous errors.
// If some image was disabled (or enabled) during rerun caused by the same image, the tool reports fatal error.

#if CONFIG_IC_CORE_RAD_AVAILABLE

#ifndef COMMON_CONFIG_IPC_RADIO_ENABLED
#define COMMON_CONFIG_IPC_RADIO_ENABLED 0
#endif

#if COMMON_CONFIG_IPC_RADIO_ENABLED

ENSURE_CONFIG(COMMON_CONFIG_IMAGE_RADIO_EMPTY == 0, "Empty radio image must be disabled when IPC Radio image is enabled.");

IMAGE_ADD(RAD)
// #include "images/ipc_radio.h" OR even directly:
IMAGE_SOURCE("../../../modules/**/*.c");
IMAGE_SOURCE("../../../images/ipc_radio/*.c"); // Some of those files also sets CONFIG_CORE_RAD=TRUE, so it is double-checked
ENSURE_CONFIG(RAD_CONFIG_CORE_RAD == TRUE);

#endif

#endif

// For user convenience, common image configuration can be moved to header file, e.g.

IMAGE_ADD(RAD);
IMAGE_SOURCE("../radio/**/*.c");
#include "image_def/radio.h" // It will set CONFIG_CORE_RAD=TRUE, add common sdk files, and maybe add some core-specific files.


// To build the same sources, but for other core
IMAGE_ADD(RAD);
IMAGE_SOURCE("./*.c");
#include "image_def/radio.h"

/* A way to add sources, include directories, defines, libraries, library directories, e.t.c to current image */
CURRENT_IMAGE_SOURCE("../src/*.c");
CURRENT_IMAGE_SOURCE_NO_CONFIG("../ext/lib/*.c", SOME_LIB_DEBUG=1, SOME_LIB_OPTION=CONFIG_SOME_LIB_OPTION); // defines just for group of files
CURRENT_IMAGE_DEFINE(MY_DEF=1);
CURRENT_IMAGE_LIBRARY("../lib/nfc/nfc.a");

// Maybe also pre-/post-build steps
CURRENT_IMAGE_PRE_BUILD("make -c ${SDK_PATH}/ext/some_lib");
// SDK should have a bash binary included and those commands will be executed from bash.
// This allows unified commands on all platforms.

// Maybe unify image and source/libs handling by providing image name for those macros, and current image is CURRENT
IMAGE_SOURCE(RAD, "../rad/src/*.c");
IMAGE_LIB(CURRENT, "../lib/some_lib.a");

/*

The linker script should be also preprocessed and can use configuration.
e.g.
    CONFIG_STACK_SIZE - set stack size
    CONFIG_IMAGE_OFFSET - where image starts

For other front-ends, some intermidiate file can be preprocessed and later
the front-end will use it to create final output.

Selecting front-ends and configuring them should be also done with use configuration, e.g.:
*/

/** @defgroup Supported project front-ends.
 * @config_enum
 * @{
 */

/** @brief No project files generation
 */
#define PROJECT_FRONTEND_NONE 0

/** @brief Makefile
 */
#define PROJECT_FRONTEND_MAKEFILE 1

/** @brief Ninja file
 */
#define PROJECT_FRONTEND_NINJA 2

/** @brief Kail project
 */
#define PROJECT_FRONTEND_KAIL 3

/** @brief IAR project
 */
#define PROJECT_FRONTEND_IAR 4

/** @brief Segger Embedded Studio project
 */
#define PROJECT_FRONTEND_SES 5

/** @brief Visual Studio Code workspace
 */
#define PROJECT_FRONTEND_VSCODE 6

/** @brief Eclipse project
 */
#define PROJECT_FRONTEND_ECLIPSE 7

/** @} */

/** @brief Project type to generate
 * 
 * This can be overridden for specific image by the
 * CONFIG_PROJECT_FRONTEND option.
 */
#ifndef COMMON_CONFIG_PROJECT_FRONTEND
#define COMMON_CONFIG_PROJECT_FRONTEND PROJECT_FRONTEND_MAKEFILE
#endif

/** @brief Project type to generate for this image
 * 
 * The default value is taken from the COMMON_CONFIG_PROJECT_FRONTEND
 * option.
 * 
 * @config_type{PROJECT_FRONTEND}
 */
#ifndef CONFIG_PROJECT_FRONTEND
#define CONFIG_PROJECT_FRONTEND COMMON_CONFIG_PROJECT_FRONTEND
#endif

/*

The generated Makefile should find sdk (both binaries and source files) in following order:
- NRF_SDK_ROOT environment variable,
- using command `nrf-sdk-config --version-sdk-path`
- absolute path of sdk when the Makefile was created or updated,
*/


// Resource manager examples

RESOURCE_DEFINE(UART_RESOURCE_MANAGER, UART0, UART1, UART2);
// OR:
RESOURCE_DEFINE(UART_RESOURCE_MANAGER);
RESOURCE_ADD(UART_RESOURCE_MANAGER, UART0);
RESOURCE_ADD(UART_RESOURCE_MANAGER, UART1);
RESOURCE_ADD(UART_RESOURCE_MANAGER, UART2);


#define MY_UART_CONDITION(name) MACRO_IN(GPIO_P0_1, MACRO_CAT(CONFIG_, name, _RX_PINS)) && \
	MACRO_IN(GPIO_P0_0, MACRO_CAT(CONFIG_, name, _TX_PINS))

#define CONFIG_MY_UART RESOURCE_ALLOC(UART_RESOURCE_MANAGER, MY_UART_CONDITION);
// OR, since condition is evaluated in configuration stage:
#define CONFIG_MY_UART RESOURCE_ALLOC(UART_RESOURCE_MANAGER, "GPIO_P0_1 in CONFIG_{item}_RX_PINS && GPIO_P0_0 in CONFIG_{item}_TX_PINS");
// OR, if you want reserve specific item
RESOURCE_RESERVE(UART_RESOURCE_MANAGER, UART2);

SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_ENABLE = TRUE");
SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_BOUND_RATE = 9600");
SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_TX = GPIO_P0_0");
SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_RX = GPIO_P0_1");
SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_CONTROL_FLOW = TRUE");
SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_PARITY = UART_PARITY_NONE");

// OR

TEMPLATE_CONFIG(CONFIG_UART_DRIVER_MY, CONFIG_UART_DRIVER_a);
SET_CONFIG(CONFIG_UART_DRIVER_MY_UART_INSTANCE = RESOURCE_ALLOC(UART_RESOURCE_MANAGER, \
	"GPIO_P0_1 in CONFIG_{item}_RX_PINS && GPIO_P0_0 in CONFIG_{item}_TX_PINS"));
SET_CONFIG(CONFIG_UART_DRIVER_MY_BOUND_RATE = 9600);
SET_CONFIG(CONFIG_UART_DRIVER_MY_TX = GPIO_P0_0);
SET_CONFIG(CONFIG_UART_DRIVER_MY_RX = GPIO_P0_1);
SET_CONFIG(CONFIG_UART_DRIVER_MY_CONTROL_FLOW = TRUE);
SET_CONFIG(CONFIG_UART_DRIVER_MY_PARITY = UART_PARITY_NONE);


/* problematic think: */
#include CONFIG_XYZ

/*
possible solutions:
 - postpone parsing file containing those includes to the end, if that config will have just one possible value, e.g. with SET_CONFIG, parse and do #include as usual
 - if not, resolve all configuration ignoring #include, ignore all errors, redo resolving but with this CONFIG_ fixed to previous value, error if this CONFIG_ was changed during second rerun.
   repeat if new #include CONFIG_ were discovered.
 - on the first version return error:
   Evaluating header file from CONFIG_ option is not implemented.
   If you REALLY need this feature, see issue https://github.com/..../issues/1234.
   (the same pattern can be applyied to other not implemented, but possible functionalities)
*/

// The following will add CONFIG_XYZ dependency to everyting inside "xyz.h"
#if CONFIG_XYZ
#include "xyz.h"
#endif

// bool configs are aways defined, even they are disabled. They have FALSE value in that case

// Creating driver instance can be behind the macro, e.g.

UARTE_DRIVER(MY_IO);
SET_CONFIG(CONFIG_UARTE_DRV_MY_IO_BAUND = 115200);
SET_CONFIG(CONFIG_UARTE_DRV_MY_IO_HW_FLOW = FALSE);
SET_CONFIG(CONFIG_UARTE_DRV_MY_IO_PARITY = UARTE_PARITY_ODD);
SET_CONFIG(CONFIG_UARTE_DRV_MY_IO_RX = GPIO_P0_4);
SET_CONFIG(CONFIG_UARTE_DRV_MY_IO_TX = GPIO_P0_5);

// in uarte_drv.h:
#define UARTE_DRIVER(name) \
	TEMPLATE_CONFIG(CONFIG_UARTE_DRV_ ## name, CONFIG_UARTE_DRV_name); \
	SET_CONFIG(CONFIG_UARTE_DRV_ ## name ## _PERIPHERIAL = RESOURCE_ALLOC(UARTE_RESOURCE_MANAGER));
#define UARTE_DRIVER_WITH_PERIPHERIAL(name, petipherial) \
	TEMPLATE_CONFIG(CONFIG_UARTE_DRV_ ## name, CONFIG_UARTE_DRV_name); \
	SET_CONFIG(CONFIG_UARTE_DRV_ ## name ## _PERIPHERIAL = petipherial);



// Another problem: cyclic dependency should be allowed since even include-based module enabling would not work properly
/*
Possible solution:
1. Travel dependency graph
2. Remove from it as much as possible (e.g. configs set with the SET_CONFIG())
3. Detect cycles and group them, each cycle contains exactly one path A -> B -> ... -> Z -> back to A
4. After grouping one-path cycle, another cycle may reamain that contains groups (they become sub-grops)
5. This way, from top level view, the graph does not contains cycles
6. And, each group contains exactly one cycle with single path.
7. First level of groups can be resolved independently

Resolving values inside a cycle (group):
0. Initial state: all values in parent group are resolved or has some temporary values
1. Start with some config (or group) and assign some acceptable value using default value (not the last resolve value) for unknown dependecies
2. Go over the dependency path backward inside current group and calculate values until we reach starting point
3. Check if starting point is valid, if yes, successfully resolve group with current values
4. Check if values from all configs (including sub-groups) were already examinated, if yes, fail
5. Check if interation counter reached specific value, if yes, fail
6. Continue walking the path
7. Before calculating new value, check if current value is valid, if yes, success
   (no need to go back to starting point, success can be reached at any point since unchaned value at any point of path
   indicates that the rest must be valid)
8. Increase interation counter on each full circle around the path, fail if it reached limit.

PROBLEMS:
  - SET_CONFIG("CONFIG_{CONFIG_MY_UART}_DRIVER_ENABLE = TRUE") - this kind of expression reorganizes the graph if CONFIG_MY_UART changes,
    this kind of cases in not ensured in algorithm above
  - Resource manager may also reorganize the graph and may causing cyclic dependencies
SOLUTION:
  - resolve all except unbounded constrains e.g. SET_CONFIG(CONFIG_{CONFIG_MY_UART}_DRIVER_ENABLE = TRUE)
  - add constrains
  - resolve all
  - repeat if cofigs used inside unbounded constrains are changed.

DIFFERENT APPROACH (much simpler, but not so fast):

0. Do normal preprocessing (don't even parse body of un-fullfilled #if)
   - assume last kown value for each configuration option (undefined if unknown)
   - keep config dependencies for a file (only those references that affects pre-build stage)
   - enumerator regexp must be also kept to test if specific option changes the enumerator
     (only if macro affects pre-build stage)
1. If some configuration option changes its value (or becomes defined) all files that reference this option are set as "dirty"
   - including current file if it was referenced before in the same file
   - the same file but from different image is threaded seperatly
   - each option has list of files that defines it, if it is empty, option becomes undefined.
2. "Dirty" files are pushed to a FIFO and then re-parsed
3. Prebuild parsing is done when there is nothing in the FIFO.
4. If file was parsed mutiple times, errors and warnings only from the last parse are shown.
5. Limit number of files pushed to FIFO relative to total files, i.e. trigger error if number_of_files_pushed > limit * number_of_files.

Pros:
  - no need for special way to parse #if
  - no graph building, resolving, e.t.c.
  - no need for complicated algorithms
Cons:
  - slower
  - undefined options are unknown (e.g. cannot be shown in the GUI)
  - maybe some problems in doxygen parsing
  - harder to findout which options caused infinite (or too long) cycle

With this approach, resource manager:
- RESOURCE_ALLOC evaluates condition on all items and selects first one
- keep list of allowed items associated with config option
- if RESOURCE_ALLOC fails to allocate:
  1) if there is not enough items: fail,
  2) otherwise, try to move other accosiation based on list of allowed items
     and make file that allocated it "dirty" to recheck the condition, list of allowed items is rotated to check different posibilities
- if RESOURCE_ALLOC re-evaluates, the list is updated, but not re-created to maitain order.

Optimizations:
     - Caching:
	 - Parsed file should be cached
	 - Cache key is hash with all used inputs (config options, defines), file modification time, size (and maybe some other file attributes)
	 - If file was parsed multiple times all parse results should be kept
     - Header files shouldn't be parsed separetly (only using #include)
     - If all content affecting pre-build in file is encosed in single #if, it becomes conditional file

*/

// example of heap resource manager
// in heap module
#if CONF_HEAP_SIZE_CHECK
RESOURCE_DEFINE_MEMORY(HEAP, CONF_HEAP_SIZE)
#else
RESOURCE_DEFINE_MEMORY(HEAP, 0x7FFFFFFF)
#endif
// in other modules
RESOURCE_ALLOC(HEAP, 4096)

/* Note on enumerator:
Enumerator should also be enumarated and evaluated in pre-build stage, so this should work:
*/

#define FOO_ENUM_MACRO(name) \
	DEFINE_CONFIG(CONFIG_BAR_{name} = CONFIG_FOO_{name})
	ENSURE_CONFIG(CONFIG_BAR_{name} > 0)

ENUMERATE_CONFIG("CONFIG_FOO_(.*)", FOO_ENUM_MACRO, foo_enumarator)

/*
It would be nice to have option to disable specific files from being parsed by config-tool.
* Inside source code: /* sdk-config-tool-ignore * /
* Inside directory: sdk-config-tool.yaml file: ignore: ./** /*
*/

/* For smiplycity, all configs are always defined, for example: */
#if 0
#ifndef CONFIG_FOO
#define CONFIG_FOO 123
#endif
ENSURE_CONFIG(CONFIG_FOO < 1000);
#endif

/* It will define CONFIG_FOO with value 123, but ENSURE_CONFIG is always disabled, so the config will not have a limit */
// ^^ this is dengerous, must be reconsidered

/* Allow defining some configuration targets, e.g. Debug, Release, Debug_nRF54, Variant1, Variant2:
  * for make: make Debug, if there are multiple configurations targets:
    * `make` without paramters will show possible targets and fail (for the first time) or use recently build configuration target
    * Makefile will just call another, e.g. conf/Debug.makefile
    * `make program Debug` or `make Debug program` should first do `Debug` and later `program` is such weak dependency is possible in Makefile
    * otherwise `make program_Debug`
  * for SES - configuration
  * for VSC without extension - task that shows menu in terminal or new window
  * for VSC with extension - button is status bar
*/

SET_CONFIG(CONFIG_IMAGE_IPC_RADIO = TRUE)
#if CONFIG(Debug)
	SET_CONFIG(CONFIG_DEBUG = TRUE)
	SET_CONFIG(CONFIG_OPTIMIZE = OPTIMIZE_NONE)
	SET_CONFIG(CONFIG_ASSERT = TRUE)
#elif CONFIG(Release)
	SET_CONFIG(CONFIG_DEBUG = FALSE)
	SET_CONFIG(CONFIG_OPTIMIZE = OPTIMIZE_SIZE)
	SET_CONFIG(CONFIG_ASSERT = FALSE)
#endif

/*
GUI configuration tool should allow to select where to set specific option value: in the source code or in current build directory.
Without GUI, in the source code: SET_CONFIG(...), in current build directory: config-tool --set "CONFIG_FOO=TRUE"
or config-tool --set "Debug:CONFIG_FOO=TRUE"
Config options in build directory have higher priority than SET_CONFIG() and overrides them without error.
In general. the priority should be:
1. Build value             - cannot be conflict
2. SET_CONFIG and #define  - error if conflict
3. ENSURE_CONFIG           - error if not met
4. PREFER_CONFIG           - no error if not met
5. DEFAULT_CONFIG          - override default from definition, error if multiple default values that mets all of above conditions
6. default from definition - error if multiple default values that mets all of above conditions and not overriden by DEFAULT_CONFIG
*/


// Example of device driver configuration

#define UARTE_DRIVER(prefix) \
	DEFINE_CONFIG({prefix}_DEVICE = RESOURCE_ALLOC(UARTE, {prefix}_RX_PIN in {i}_RX_PINS && {prefix}_TX_PIN in {i}_TX_PINS)) \
        DEFINE_CONFIG({prefix}_BAUDRATE, int) \
	ENSURE_CONFIG({{prefix}_DEVICE}_BAUDRATE = {prefix}_BAUDRATE)


UARTE_DRIVER(CONFIG_MY_PORT)
SET_CONFIG(CONFIG_MY_PORT_RX_PIN = GPIO_PIN_0_10)
SET_CONFIG(CONFIG_MY_PORT_TX_PIN = GPIO_PIN_0_12)
SET_CONFIG(CONFIG_MY_PORT_BAUDRATE = 115200)
SET_CONFIG(CONFIG_MY_PORT_DATA_BITS = 8)
SET_CONFIG(CONFIG_MY_PORT_PARITY = UARTE_PARITY_NONE)

// SET_CONFIG(CONFIG_MY_PORT_DEVICE = CONFIG_UARTE120) - optional if using specific
// RESOURCE_RESERVE(UARTE, CONFIG_UARTE120)              instance for this driver.

static const UarteInstance* my_port = CONFIG_MY_PORT_INSTANCE;


/*

API symbols summary:

CONF_*** - current image configurations options
***_CONF_*** - other image configuration options (image names cannot have undescore)
***_CONF() - special configuration macros
    TARGET_CONF(...) - target configuration
    SET_CONF(...) - set option
    ENSURE_CONF(...) - ensure configuration condition
    PREFFER_CONF(...) - preffered configuration condition
	DEFAULT_CONF(...) - set default configuration value
...

*/
