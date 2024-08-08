
// =============================================== include
// expect: foo
#include "helper/foo.h"

// =============================================== include empty
// expect:
#include "helper/empty.h"

// =============================================== __FILE__
// expect: "simple.c"
__FILE__

// =============================================== __FILE__ in include
// expect: "helper/file.h"
#include "helper/file.h"

// ===============================================
#define FOO(...) xxx __VA_ARGS__ yyy

// ----------------------------------------------- __FILE__ as argument
// expect: xxx "simple.c" yyy
FOO(__FILE__)

// ----------------------------------------------- unexpected "}"
// expect error: unexpected '}', expecting ')'
int bar() {
    FOO(
    return 0;
})

// ----------------------------------------------- directive before macro parameters
// expect: xxx zzz yyy
FOO
#define Z zzz
(Z)

// ----------------------------------------------- include in args
// expect: xxx foo yyy
FOO(
#include "helper/foo.h" // unlike other compilers embedding a #include directive within macro arguments is allowed
)

// ----------------------------------------------- counter
// expect: 0 1 2
__COUNTER__
__COUNTER__
__COUNTER__

// ----------------------------------------------- counter in args
// expect: xxx 0 yyy xxx 1 yyy xxx 2 yyy
FOO(__COUNTER__)
FOO(__COUNTER__)
FOO(__COUNTER__)

// ----------------------------------------------- counter in macro
// expect: a 0 b 1 c 2
#define BAR(x) x __COUNTER__
BAR(a)
BAR(b)
BAR(c)

// ----------------------------------------------- counter multiple times
// expect: 0 0 4 1 1 2 2 3 3
#define C __COUNTER__
#define F(x, y, z, w) x x C y y z z w w
F(__COUNTER__, __COUNTER__, C, C)

// ----------------------------------------------- line number
// expect: 5 6 7
__LINE__
__LINE__
__LINE__

// ----------------------------------------------- line number in args
// expect: xxx 5 yyy xxx 6 yyy xxx 7 yyy
FOO(__LINE__)
FOO(__LINE__)
FOO(__LINE__)

// ----------------------------------------------- line number in macro
// expect: a 6 b 7 c 8
#define BAR(x) x __LINE__
BAR(a)
BAR(b)
BAR(c)

// ----------------------------------------------- line number in include
// expect: 1 1 1
#include "helper/line.h"
#include "helper/line.h"
#include "helper/line.h"

// ----------------------------------------------- unterminated macro arguments
// expect error: unterminated argument list invoking macro "FOO"
FOO(1, 2, 3

// =============================================== unterminated macro parameters
// expect error: expecting ')' in macro parameter list
#define X(a, b, c, ...

// =============================================== line break before macro parameters
// expect: - 1 -
#define X\
\
(a) - a -
X(1)

// =============================================== nesting scope
// expect: 2*9*g
#define f(a) a*g
#define g(a) f(a)
f(2)(9)

// ===============================================
#define STR1(x) #x
#define STR2(x) STR1(x)
#define STRV1(...) #__VA_ARGS__
#define STRV2(...) STRV1(__VA_ARGS__)
#define A a
#define X x
#define Y y
#define Z z

// ----------------------------------------------- stringify argument name
// expect: "A"
STR1(A)
// expect: "X, Y, Z"
STRV1(X, Y, Z)
// expect: ""
STRV1()

// ----------------------------------------------- stringify argument value
// expect: "a"
STR2(A)
// expect: "x, y, z"
STRV2(X, Y, Z)
// expect: ""
STRV2()

// ----------------------------------------------- stringify multiline
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

// ----------------------------------------------- stringify with escape sequences
STR2(\)    // expect: "\\"
STR2(1\2)  // expect: "1\\2"
STR2(3\n)  // expect: "1\\n"
STR2("4\n")// expect: "\"test\\n\""

// ----------------------------------------------- token joining in string
// expect: "--" "+-"
#define a1(x) -x-
#define a2(x) +x-
STR2(a1())
STR2(a2())

// ----------------------------------------------- token joining without string
// expect: - - +-
#define a1(x) -x-
#define a2(x) +x-
a1()
a2()

// =============================================== include using macros
// expect: { foo } { foo }
#define first <helper
#define second(X) foo.X>
{
    #include first/second(h) 
}
#define STR1(x) #x
#define STR2(x) STR1(x)
{
    #include STR2(helper/foo.h)
}

// =============================================== directive indentation
// expect: - foo bar
-
    #define FOO foo
#   define BAR bar
FOO BAR

// =============================================== comments before directive name
// expect: foo bar
/* before hash */#define FOO foo
#/* after hash */define BAR bar
FOO BAR

// =============================================== comments and indentation before directive name
// expect: foo bar
    /* before hash */    #    define FOO foo
    #    /* after hash */   define BAR bar
FOO BAR

// =============================================== multiline comments before directive name
// expect: foo bar
    /*
     * before hash
     */    #    define FOO foo
    #    /*
          *after hash
          */   define BAR bar
FOO BAR

// =============================================== comments around hash
// expect:
# // This is a comment
# /* This is a multi-line
#  * comment.
#  */
#
  /* No hash
   * yet.
   */ # /* and after hash*/

// =============================================== ## at the beginning of macro
// expect error: '##' cannot appear at either end of a macro expansion
#define FOO(X) ## ABC
FOO(Y)

// =============================================== ## at the end of macro
// expect error: '##' cannot appear at either end of a macro expansion
#define FOO(X) ABC ##
FOO(Y)

// =============================================== ## at the either end of macro after replacement
// expect: ABC XABC ABCY XABCY
#define FOO(x, y) x ## ABC ## y
FOO(,)
FOO(X,)
FOO(,Y)
FOO(X,Y)

// =============================================== paste only tokens around ##
// expect: A D A C
#define FOO(a, b, c, d) a ## b c ## d
FOO(A, , , D)
#define BAR(a, b) a ## b C
BAR(A,)

// =============================================== do not replace before pasting
// expect: OK OK OK
#define AX OK
#define YC OK
#define AC OK
#define FOO(a, b) a ## b ## C
FOO(A, X Y)
FOO(A,)

// =============================================== hash hash in string
// expect: "x ## y"
#define hash_hash # ## #
#define mkstr(a) # a
#define in_between(a) mkstr(a)
#define join(c, d) in_between(c hash_hash d)
join(x, y)

// =============================================== pasting in object-like macro
// expect: OK
#define AB OK
#define A a
#define B b
#define FOO A ## B
FOO

// =============================================== keep ## in argument
// expect: a ## b
#define FOO(x) a x b
FOO(##)

// =============================================== multiple ##
// expect: ABC ABC
#define FOO \
    A ## ## B ## ## ## C \
    A ## /* comment */ ## B /* comment */ ## ## ## /* comment */ C
FOO
