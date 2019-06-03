
# Written to work with cmake 3.0
cmake_minimum_required (VERSION 3.0)
set (CMAKE_BACKWARDS_COMPATIBILITY 3.0)
SET(CMAKE_EXECUTABLE_SUFFIX ".js")

project(fldigi_mt63)

file (GLOB GENERAL RELATIVE ${CMAKE_CURRENT_SOURCE_DIR}
    [^.]*.cxx
    [^.]*.dat
    [^.]*.h
    )

SET( SOURCES
    ${GENERAL}
    )

add_library(fldigi_mt63 STATIC ${SOURCES})
message("fldigi_mt63 lib using ${SOURCES}")
