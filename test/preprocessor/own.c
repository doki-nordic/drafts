
// ===================== include
// expect: foo
#include "helper/foo.h"

// ===================== include empty
// expect:
#include "helper/empty.h"

// ===================== __FILE__
// expect: "own.c"
__FILE__

// ===================== __FILE__ in include
// expect: "helper/file.h"
#include "helper/file.h"

// =====================
#define FOO(...) xxx __VA_ARGS__ yyy

// --------------------- __FILE__ as argument
// expect: xxx "own.c" yyy
FOO(__FILE__)

// --------------------- unexpected "}"
// expect error: Expecting "(" but found "{".
int bar() {
    FOO(
    return 0;
})

// --------------------- directive before macro parameters
// expect: xxx zzz yyy
FOO
#define Z zzz
(Z)

// --------------------- include in args
// expect: xxx foo yyy
FOO(
#include "helper/foo.h" // unlike other compilers embedding a #include directive within macro arguments is allowed
)

// --------------------- counter
// expect: 0 1 2
__COUNTER__
__COUNTER__
__COUNTER__

// --------------------- counter in args
// expect: xxx 0 yyy xxx 1 yyy xxx 2 yyy
FOO(__COUNTER__)
FOO(__COUNTER__)
FOO(__COUNTER__)

// --------------------- counter in macro
// expect: a 0 b 1 c 2
#define BAR(x) x __COUNTER__
BAR(a)
BAR(b)
BAR(c)

// --------------------- unterminated macro arguments
// expect error: Unterminated macro arguments.
FOO(1, 2, 3

// ====================== unterminated macro parameters
// expect error: Invalid macro parameters.
#define X(a, b, c, ...

// ====================== line break before macro parameters
// expect: - 1 -
#define X\
\
(a) - a -
X(1)

// ====================== nesting scope
// expect: 2*9*g
#define f(a) a*g
#define g(a) f(a)
f(2)(9)

// ====================== map enumerator
// expect: {Lorem} {ipsum} {dolor} {sit} {amet} {consectetur} {adipiscing} {elit} {Curabitur} {ac} {lobortis} {tortor}
#define EVAL0(...) __VA_ARGS__
#define EVAL1(...) EVAL0(EVAL0(EVAL0(__VA_ARGS__)))
#define EVAL2(...) EVAL1(EVAL1(EVAL1(__VA_ARGS__)))
#define EVAL3(...) EVAL2(EVAL2(EVAL2(__VA_ARGS__)))
#define EVAL4(...) EVAL3(EVAL3(EVAL3(__VA_ARGS__)))
#define EVAL(...)  EVAL4(EVAL4(EVAL4(__VA_ARGS__)))
#define MAP_END(...)
#define MAP_OUT
#define MAP_COMMA ,
#define MAP_GET_END2() 0, MAP_END
#define MAP_GET_END1(...) MAP_GET_END2
#define MAP_GET_END(...) MAP_GET_END1
#define MAP_NEXT0(test, next, ...) next MAP_OUT
#define MAP_NEXT1(test, next) MAP_NEXT0(test, next, 0)
#define MAP_NEXT(test, next)  MAP_NEXT1(MAP_GET_END test, next)
#define MAP0(f, x, peek, ...) f (x) MAP_NEXT(peek, MAP1)(f, peek, __VA_ARGS__)
#define MAP1(f, x, peek, ...) f (x) MAP_NEXT(peek, MAP0)(f, peek, __VA_ARGS__)
#define MAP(f, ...) EVAL(MAP1(f, __VA_ARGS__, ()()(), ()()(), ()()(), 0))
#define ENUMERATOR Lorem, ipsum, dolor, sit, amet, consectetur, adipiscing, elit, Curabitur, ac, lobortis, tortor
#define STRING(x) {x}
MAP(STRING, ENUMERATOR)
