# Written to work with cmake 3.0
cmake_minimum_required (VERSION 3.0)
set (CMAKE_BACKWARDS_COMPATIBILITY 3.0)
SET(CMAKE_EXECUTABLE_SUFFIX ".js")

project(mt63Wasm)

set(HAVE_STDLIB_H 1 cache)
set(HAVE_STDDEF_H 1 cache)

set(LIB_EXPORTS "['_getSampleRate', '_encodeString', '_getBuffer']")
if (NOT BUILD_ASMJS)
    set (DEFAULT_CFLAGS "-s WASM=1 -s \"BINARYEN_METHOD='native-wasm'\" -O3 -s \"BINARYEN_TRAP_MODE='clamp'\" -s MODULARIZE=1 -Wno-deprecated-register -Wno-warn-absolute-paths -s NO_EXIT_RUNTIME=1 -flto -ftree-vectorize -s ALLOW_MEMORY_GROWTH=1 -s PRECISE_F32=1 --emit-symbol-map -Werror -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s 'EXTRA_EXPORTED_RUNTIME_METHODS=[\"ccall\", \"cwrap\"]'")
    set (DEBUG_CFLAGS "-s WASM=1 -s \"BINARYEN_METHOD='native-wasm'\" -O3 --minify 0 -s \"BINARYEN_TRAP_MODE='clamp'\" -s MODULARIZE=1 -Wno-deprecated-register -Wno-warn-absolute-paths -s NO_EXIT_RUNTIME=1 -flto -ftree-vectorize -s ALLOW_MEMORY_GROWTH=1 -s PRECISE_F32=1 --emit-symbol-map -Werror -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s 'EXTRA_EXPORTED_RUNTIME_METHODS=[\"ccall\", \"cwrap\"]'")
    set(LIBNAME mt63Wasm)
else()
    set (DEFAULT_CFLAGS "-s \"BINARYEN_METHOD='asmjs'\" -O3 -s \"BINARYEN_TRAP_MODE='clamp'\" -s MODULARIZE=1 -Wno-deprecated-register -Wno-warn-absolute-paths -s NO_EXIT_RUNTIME=1 -flto -ftree-vectorize -s TOTAL_MEMORY=67108864 -s PRECISE_F32=1 --emit-symbol-map -Werror -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s 'EXTRA_EXPORTED_RUNTIME_METHODS=[\"ccall\", \"cwrap\"]'")
    set (DEBUG_CFLAGS "-s \"BINARYEN_METHOD='asmjs'\" -O3 --minify 0 -s \"BINARYEN_TRAP_MODE='clamp'\" -s MODULARIZE=1 -Wno-deprecated-register -Wno-warn-absolute-paths -s NO_EXIT_RUNTIME=1 -flto -ftree-vectorize -s TOTAL_MEMORY=67108864 -s PRECISE_F32=1 --emit-symbol-map -Werror -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s 'EXTRA_EXPORTED_RUNTIME_METHODS=[\"ccall\", \"cwrap\"]'")
    set(LIBNAME mt63Wasm)
endif()


# set(EMCC_FLAGS  "${DEFAULT_CFLAGS}")
set(EMCC_FLAGS  "${DEBUG_CFLAGS}")
# set(EMCXX_FLAGS "-std=c++11 ${DEFAULT_CFLAGS}")
set(EMCXX_FLAGS "-std=c++11 ${DEBUG_CFLAGS}")

message("Using cflags: ${EMCC_FLAGS}")
message("Using system include dir(s): ${CMAKE_SYSTEM_INCLUDE_PATH}")

set(CMAKE_C_FLAGS ${EMCC_FLAGS})
set(CMAKE_CXX_FLAGS ${EMCXX_FLAGS})

file (GLOB GENERAL RELATIVE ${CMAKE_CURRENT_SOURCE_DIR}
    [^.]*.cxx
    [^.]*.h
    )

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../fldigi_mt63 ${CMAKE_CURRENT_BINARY_DIR}/fldigi_mt63)

SET( SOURCES
    ${GENERAL}
    )

add_library(${LIBNAME} SHARED ${SOURCES})
message("Using ${SOURCES}")

target_link_libraries(${LIBNAME} fldigi_mt63)

set_target_properties(${LIBNAME} PROPERTIES
    SUFFIX .js
    LINK_FLAGS ${EMCC_FLAGS})

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/../fldigi_mt63
    .
    )


