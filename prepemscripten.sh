#!/bin/bash

showExec(){
    set -x
    "$@"
    { set +x; } 2>/dev/null
}

BUILDDIR=native_build
BUILD_TYPE=Release

mkdir -p "$BUILDDIR"
pushd "$BUILDDIR" || exit 1

showExec emcmake cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE "$@" ../native_src
if [ "$?" -ne 0 ]; then
    echo "CMake failed. Please check error messages"
    popd > /dev/null || exit 1
    exit 1
else
    popd || exit 1
fi
