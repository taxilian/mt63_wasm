# Written to work with cmake 3.0
cmake_minimum_required (VERSION 3.0)
set (CMAKE_BACKWARDS_COMPATIBILITY 3.0)
SET(CMAKE_EXECUTABLE_SUFFIX ".js")

project(mt63Wasm)

set(HAVE_STDLIB_H 1 cache)
set(HAVE_STDDEF_H 1 cache)

set(LIB_EXPORTS "_getSampleRate,_encodeString,_getBuffer,_initRx,_processAudio,_processAudioResample,_crc16,_lzmaEncode,_lzmaDecode,_getLzmaOutput,_malloc,_free")
# if (NOT BUILD_ASMJS)
    # set (SOURCE_MAP_PARAM "-gsource-map --source-map-base 'http://localhost:8080/'")
    set (SOURCE_MAP_PARAM "")

    set (CFLAGS_COMMON "-Wno-deprecated-register -Wno-warn-absolute-paths -flto -ftree-vectorize")
    set (CFLAGS_RELEASE "-O3")
    set (CFLAGS_DEBUG "-Og -g --minify 0")
    set (DEFAULT_CFLAGS "${CFLAGS_COMMON} ${CFLAGS_RELEASE}")
    set (DEBUG_CFLAGS "${CFLAGS_COMMON} ${CFLAGS_DEBUG}")

    set (LINK_COMMON_FLAGS "-s MODULARIZE=1 -s -s FILESYSTEM=0 -Wno-deprecated-register -sASSERTIONS=1 -Wno-warn-absolute-paths -s DISABLE_EXCEPTION_CATCHING=0 -flto -ftree-vectorize -s NO_EXIT_RUNTIME=1 -s ALLOW_MEMORY_GROWTH=1 -s PRECISE_F32=1 -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s EXPORTED_RUNTIME_METHODS=\"['ccall', 'cwrap']\"")
    set (LINK_RELEASE_FLAGS "-O3")
    set (LINK_DEBUG_FLAGS "-Og --minify 0 --profiling-funcs -s DISABLE_EXCEPTION_CATCHING=0 -g -Wlimited-postlink-optimizations")
    set (LINK_FLAGS       "${LINK_COMMON_FLAGS} ${LINK_RELEASE_FLAGS}")
    set (LINK_FLAGS_DEBUG "${LINK_COMMON_FLAGS} ${LINK_DEBUG_FLAGS}")
    set(LIBNAME mt63Wasm)
# else()
#     set (DEFAULT_CFLAGS "-s \"BINARYEN_METHOD='asmjs'\" -O3 -s MODULARIZE=1 -Wno-deprecated-register -Wno-warn-absolute-paths -s NO_EXIT_RUNTIME=1 -s ENVIRONMENT=web -flto -ftree-vectorize -s TOTAL_MEMORY=67108864 -s PRECISE_F32=1 --emit-symbol-map -Werror -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s 'EXPORTED_RUNTIME_METHODS=ccall, cwrap'")
#     set (DEBUG_CFLAGS "-s \"BINARYEN_METHOD='asmjs'\" -O3 --minify 0 -s MODULARIZE=1 -Wno-deprecated-register -Wno-warn-absolute-paths -s NO_EXIT_RUNTIME=1 -s ENVIRONMENT=web -flto -ftree-vectorize -s TOTAL_MEMORY=67108864 -s PRECISE_F32=1 --emit-symbol-map -Werror -s EXPORTED_FUNCTIONS=\"${LIB_EXPORTS}\" -s 'EXPORTED_RUNTIME_METHODS=ccall, cwrap'")
#     set(LIBNAME mt63Wasm)
# endif()


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

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/mt63 ${CMAKE_CURRENT_BINARY_DIR}/fldigi_mt63)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/lzma ${CMAKE_CURRENT_BINARY_DIR}/fldigi_lzma)

SET( SOURCES
    ${GENERAL}
    )

add_executable(${LIBNAME} ${SOURCES})
message("Using ${SOURCES}")

target_link_libraries(${LIBNAME} fldigi_mt63 fldigi_lzma)

set_target_properties(${LIBNAME} PROPERTIES
    SUFFIX .js
    LINK_FLAGS ${LINK_FLAGS})

include_directories(
    .
    )


