# mt63_wasm

This is very much a work in progress; the idea is to compile a mt63 library to wasm
using emscripten to allow encoding MT63 messages and "sending" them from an HTML5 audio
web application; this could be used to reliably transmit data from a smartphone app
across Amateur Radio FM signals on VHF/UHF.

# Preparing to build

Currently we have it set up to build on linux or macOS.

First you need to have cmake installed. Next, check to see what versions :

    cd emsdk_portable
    ./emsdk list

Install the correct sdk version for your platform. We're building on macOS successfully using:

    ./emsdk install sdk-1.38.31-64bit

# Building

Once that's done, building is a simple two-step process:

    ./prepemscripten.sh
    cmake --build build/

You should now have a build/ directory.  Copy index.html into the build/ directory and run some sort of static web server there.  I use node-static: `npm install -g node-static`. If you have node-static installed you can start a server like so:

    cd build/
    static .

Open http://localhost:8080 in your browser, open a console, and run `sendMessage("This is a test message");` You should hear the mt63 come through.

# Status

Currently sound is being generated and can be de-encoded in FLDIGI! For mobile browsers that cannot play at a sample rate of 8000 Hz we've played a 3 to 1 trick telling AudioContext that the buffer is at 24KHz but to play it back at 1/3 speed.

# Shameless plugs

This project relies heavily on the fldigi MT63 code and was put together by Richard Bateman, founder of HamStudy.org. To support our efforts, check out https://signalstuff.com/antennas (our main source of funding) and https://hamstudy.org/appstore for well engineered study apps for only $3.99. HamStudy.org is sponsored by Icom, which means that in a round-about sort of way Icom also sponsors this project =] They really
do a lot to build the ham radio community in the US so support them in whatever ways you can!

# License

mt63-wasm is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

mt63-wasm is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this project.  If not, see <http://www.gnu.org/licenses/>.
