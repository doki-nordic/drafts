

Create `.c` file containing SPDX tag string that will go to the library and
will not go into hex file. There are few options:

```c
char spdx_license_identifier[] __attribute__((__section__(".comment"))) =
    " SPDX-License-Identifier: LicenseRef-Nordic-5-Clause ";
```

```c
char spdx_license_identifier[] =
    " SPDX-License-Identifier: LicenseRef-Nordic-5-Clause ";
```

```c
#ident " SPDX-License-Identifier: LicenseRef-Nordic-5-Clause "
```

WARNING: It is not standard, see https://gcc.gnu.org/onlinedocs/cpp/Other-Directives.html.

Separate `.c` file:
```c
__attribute__((naked))
void spdx_license_identifier() {
    __asm__ volatile (".section .comment\n"
        ".string \" SPDX-License-Identifier: LicenseRef-Nordic-5-Clause \"\n"
        ".section .text\n");
}
```

Separate `.S` file:

```c
.section .comment
.string " SPDX-License-Identifier: LicenseRef-Nordic-5-Clause "
```
