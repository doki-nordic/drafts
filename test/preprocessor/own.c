
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
// expect error: unexpected '}', expecting ')'
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

// --------------------- counter multiple times
// expect: 0 0 4 1 1 2 2 3 3
#define C __COUNTER__
#define F(x, y, z, w) x x C y y z z w w
F(__COUNTER__, __COUNTER__, C, C)

// --------------------- line number
// expect: 5 6 7
__LINE__
__LINE__
__LINE__

// --------------------- line number in args
// expect: xxx 5 yyy xxx 6 yyy xxx 7 yyy
FOO(__LINE__)
FOO(__LINE__)
FOO(__LINE__)

// --------------------- line number in macro
// expect: a 6 b 7 c 8
#define BAR(x) x __LINE__
BAR(a)
BAR(b)
BAR(c)

// --------------------- line number in include
// expect: 1 1 1
#include "helper/line.h"
#include "helper/line.h"
#include "helper/line.h"

// --------------------- unterminated macro arguments
// expect error: unterminated argument list invoking macro "FOO"
FOO(1, 2, 3

// ====================== unterminated macro parameters
// expect error: expecting ')' in macro parameter list
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

// ======================
#define STR1(x) #x
#define STR2(x) STR1(x)
#define STRV1(...) #__VA_ARGS__
#define STRV2(...) STRV1(__VA_ARGS__)
#define A a
#define X x
#define Y y
#define Z z

// ---------------------- stringify argument name
// expect: "A"
STR1(A)
// expect: "X, Y, Z"
STRV1(X, Y, Z)
// expect: ""
STRV1()

// ---------------------- stringify argument value
// expect: "a"
STR2(A)
// expect: "x, y, z"
STRV2(X, Y, Z)
// expect: ""
STRV2()

// ---------------------- stringify multiline
// expect: "a"
STR2(
    A)
// expect: "x, y, z"
STRV2(
    X,
    Y,
    Z)
// expect: ""
STRV2(
)

// ---------------------- stringify with escape sequences
STR2(\)    // expect: "\\"
STR2(1\2)  // expect: "1\\2"
STR2(3\n)  // expect: "1\\n"
STR2("4\n")// expect: "\"test\\n\""

// ----------------------- token joining in string
// expect: "--" "+-"
#define a1(x) -x-
#define a2(x) +x-
STR2(a1())
STR2(a2())

// ----------------------- token joining without string
// expect: - - +-
#define a1(x) -x-
#define a2(x) +x-
a1()
a2()

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
