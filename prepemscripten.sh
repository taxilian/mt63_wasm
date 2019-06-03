#!/bin/bash

# set up a symlink for python2 if not in path
path_to_python2=$(which python2)
if [ ! -x "$path_to_python2" ] ; then
    path_to_python2=$(which python2.7)
    if [ ! -x "$path_to_python2" ]; then
        echo "Could not find python 2.7"
        exit 1
    else
        echo "Creating python2 symlink in /usr/local/bin"
        ln -s "$path_to_python2" /usr/local/bin/python2
    fi
fi

LLVM_LINK=`find $(pwd)/emsdk_portable -name llvm-link`
LLVM_ROOT="${LLVM_LINK%/*}"
LLVM=${LLVM_ROOT}
echo "LLVM path: $LLVM_ROOT"
EMSDK_CONFIG=`find $(pwd)/emsdk_portable -name emconfigure`
EMSDK_ROOT="${EMSDK_CONFIG%/*}"

NODE_PATH=$(which node)

EMSCRIPTEN_CONFIG="
import os

# this helps projects using emscripten find it
EMSCRIPTEN_ROOT = os.path.expanduser(os.getenv('EMSCRIPTEN') or '$EMSDK_ROOT') # directory
LLVM_ROOT = os.path.expanduser(os.getenv('LLVM') or '$LLVM_ROOT') # directory
PYTHON = os.path.expanduser(os.getenv('PYTHON') or '$path_to_python2') # executable

# See below for notes on which JS engine(s) you need
NODE_JS = os.path.expanduser(os.getenv('NODE') or '${NODE_PATH}') # executable

JAVA = 'java' # executable

TEMP_DIR = '/tmp'

CRUNCH = os.path.expanduser(os.getenv('CRUNCH') or 'crunch') # executable

COMPILER_ENGINE = NODE_JS
JS_ENGINES = [NODE_JS] # add this if you have spidermonkey installed too, SPIDERMONKEY_ENGINE]
"

if [ ! -x "~/.emscripten" ]; then
    echo "Generating .emscripten thingy"
    eval "echo \"$EMSCRIPTEN_CONFIG\"" > ~/.emscripten
fi

GEN='Unix Makefiles'
BUILDDIR=native_build
BUILD_TYPE=Release
TOOLCHAIN_FILE=`find $(pwd)/emsdk_portable -name 'Emscripten.cmake'`
echo Using Toolchain: $TOOLCHAIN_FILE
mkdir -p "$BUILDDIR"
pushd "$BUILDDIR"
cmake -G "$GEN" -DCMAKE_TOOLCHAIN_FILE=$TOOLCHAIN_FILE -DCMAKE_BUILD_TYPE=$BUILD_TYPE "$@" ../native_src
if [ "$?" -ne 0 ]; then
    echo "CMake failed. Please check error messages"
    popd > /dev/null
    exit 1
else
    popd
fi
