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