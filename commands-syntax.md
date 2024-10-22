
# Overall syntax

Command starts with a header:

```
>>> Clean and build
```

If it belongs to some category:

```
>>> Sample/Clean and build
```

The bash script that executes the command is below header:

```bash
cd /my/build/directory
make clean
make
```

# Templates

The file allows jinja-like templating, but with JavaScript.

## Interpolation

Interpolation `{{ }}` puts any JavaScript expression into the output:
```
cd {{buildDir}}
```

Interpolation with filters:
```
cd {{buildDir |a}}
```

Filters available:
* `t` - remove whitespace around the string.
* `a` - escape string into argument, adds quotes if necessary.
* `ap` - escape string into part of argument, it can be used only inside quotes, because it does not add quotes.
* `if` - if the left side of expression if falsy, entire command will be hidden.

## Evaluation

Evaluation `{% %}` executes JavaScript code:

```
{% if (test) { %}
    test available
{% } %}
```

# Fields

The template can use following fields:
* `root: string` - root directory.
* `sample: string` - sample directory, empty if not selected.
* `test: string` - selected sample test, empty if not selected.
* `board: string` - selected board, empty if not selected.
* `extraArgs: string` - extra build arguments.
* `buildDir: string` - build directory.
* `domains: Domain[]` - sysbuild domains, empty if no domain information available.
* `defaultDomain: Domain` - default domain for this sample, empty if no domain information available.
* `jlink: { id: string, name: string }[]` - connected J-Link boards, the name contains user defined name for this board or empty if not defined.
* `ports: { name: string, jlinkId: string, jlinkName: string }[]` - serial ports, contains J-Link information if available.
* `docsNrf: string` - nRF documentation directory, empty is not available.
* `docsZephyr: string` - Zephyr documentation directory, empty is not available.

`Domain`:
* `name: string` - domain name
* `dir: string` - domain build directory
* `elf: string` - ELF file path
* `jlinkDevice: string` - J-Link device name for this domain

// TODO: ./Ozone -device nRF5340_xxAA_APP -if SWD -speed 4000 -usb 1050079689 -programfile ...build/domain/zephyr/zephyr.elf