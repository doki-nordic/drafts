
#if CONFIG_MODULE_FOO

#if CONFIG_BAR > 3
#define MAX_FOO 100
#elif CONFIG_BAR == 2
#define MAX_FOO 10
#else
#define MAX_FOO 1
#endif

/*

MAX_FOO value is now a tree:

if CONFIG_MODULE_FOO
    if CONFIG_BAR > 3
        100
    else
        if CONFIG_BAR == 2
            10
        else
            1
else
    [undefined]

*/

// The assert is simple when MAX_FOO can be evaluated without cycle back to CONFIG_FOO
ENSURE_CONFIG(CONFIG_FOO <= MAX_FOO, "Foo is too small.");
/*
When MAX_FOO was used CONFIG_MODULE_FOO was true, so the tree can be reduced to:

    if CONFIG_BAR > 3
        100
    else
        if CONFIG_BAR == 2
            10
        else
            1
*/

#if CONFIG_BAZ
#define MAX_FOO + 100
#else
#define MAX_FOO + 20
#endif
/*

The tree will be:

if CONFIG_MODULE_FOO
    if CONFIG_BAZ
        *** + 100
    else
        *** + 20
else
    [undefined]

Where *** is (top level "if" was reduced, because it was already satisfied):

    if CONFIG_BAR > 3
        100
    else
        if CONFIG_BAR == 2
            10
        else
            1

*/

#endif
