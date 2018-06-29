"use strict";
//JavaScript Amateur Multicast Protocol AMP-2 Version 3
//Implemented from specification document
//http://www.w1hkj.com/files/flamp/Amp-2.V3.0.Protocol.pdf
//• Version 1.0.0 - W5ALT, Walt Fair, Jr. (Derived From)
//• Version 2.0.0 - W1HKJ, Dave Freese, w1hkj@w1hkj.com
//• Version 2.0.1 - W1HKJ, Dave Freese, w1hkj@w1hkj.com, 5 Oct 2012
//• Version 3.0.0 - KK5VD, Robert Stiles, kk5vd@yahoo.com, 21 April 2013
//• Javascript Implementation by KV9G, Michael Stufflebeam cpuchip@gmail.com, 29 June 2018
//
// This file requires that the FL-Amp crc16 function exists on window.crc16

function amp(fromCallsign, toCallSign, filename, inputBuffer, blkSize) {
    if (!window.crc16) {
        throw(new Error("crc16 does not exist on window, please provide an implementation of crc16."));
    }
    if (!window.moment) {
        throw(new Error("moment is require on the window object for date time formatting"));
    }
    this.fromCallsign = fromCallsign;
    this.toCallSign = toCallSign;
    this.filename = filename;
    this.blkSize = blkSize;
    /*
    //Type checking the input buffer:
    if (typeof inputBuffer != "object") {
        throw(new Error("inputBuffer is not an object."));
    }
    if (!(inputBuffer instanceof Array) && !(inputBuffer instanceof Uint8Array)) {
        throw(new Error("inputBuffer is not an array or an Uint8Array."));
    }
    */
    this.inputBuffer = inputBuffer;
    //Initialize the resampler:
    this.initialize();
}
amp.prototype.PROGRAM = "JSAMP";
amp.prototype.VERSION = "0.0.1";
amp.prototype.ltypes = [
	"<FILE ", "<ID ", "<DTTM ", "<SIZE ", "<DESC ", "<DATA ", "<PROG ", "<CNTL "
];
amp.prototype.htypes = [
	"", "EOF", "EOT"
];
amp.prototype.initialize = function () {
    var _this = this;
    _this.base = "";
    _this.compression;
    _this.blocks = [];
    _this.packagedBlocks = [];
    _this.headerString = _this.buildHeaderStr();
    _this.headerStringHash = window.crc16(_this.headerString); // this goes in the {} after each < > tag
}
amp.prototype.getBlocks = function (whichChunks) {
    var _this = this;
    var result = "";
    _this.numbOfBlocks = _this.quantizeMessage();
    _this.packagedBlocks.push(_this.toCallSign + " DE " + _this.fromCallsign + "\n\n");
    _this.buildHeaderBlocks();
    _this.buildIDBlock();
    _this.buildBlocks();
    _this.buildFooterBlocks();
    _this.packagedBlocks.push("\n\n" + _this.toCallSign + " DE " + _this.fromCallsign + "\n\n");
    return _this.packagedBlocks.join('');
}
//| DTS : FN |C| B |BS|
// DTS = Date/Time Stamp
// FN = File Name
// C = Compression 1=ON,0=OFF
// B = Base Conversion (base64, base128, or base256)
// BS = Block Size, 1 or more characters
// | = Field separator.

amp.prototype.buildHeaderStr = function () {
    var headerStr = this.getCurrentDate() + ":" + this.filename;
    if(this.compression) {
        headerStr += "1";
    } else if (this.compression === false) {
        headerStr += "0";
    }
    if (this.base) {
        headerStr += this.base; //base64 or base128 or base256
    }
    headerStr += this.blkSize;

    return headerStr;
}

amp.prototype.getCurrentDate = function() {
    return window.moment().format("YYYYMMDDHHmmss"); 
}

amp.prototype.buildHashString = function(blkNumber) {
    var _this = this;
    var hash = _this.headerStringHash
    if(blkNumber && blkNumber > 0) {
        hash += ":" + blkNumber;
    } else if (blkNumber && blkNumber < 0) {
        hash += ":" + _this.htypes[Math.abs(blkNumber)];
    }
    return "{" + hash + "}";
}

amp.prototype.quantizeMessage = function() {
    var _this = this;
    var numbOfBlocks = Math.floor(_this.inputBuffer.length / _this.blkSize);
    if (_this.inputBuffer.length % _this.blkSize > 0) {
        numbOfBlocks++;
    }
    _this.blocks = [];
    var start = 0;
    while (start < _this.inputBuffer.length) {
        _this.blocks.push(_this.inputBuffer.slice(start, start + _this.blkSize));
        start += _this.blkSize;
    }

    return numbOfBlocks;
}

amp.prototype.buildBlocks = function( ) {
    var _this = this;
    _this.blocks.forEach((blk, idx) => {
        var pBlock = String(_this.ltypes[5]);
        var blockText = _this.buildHashString(idx + 1);
        blockText += blk;
        pBlock += blockText.length;
        pBlock += " " + window.crc16(blockText) + ">";
        pBlock += blockText + "\n";
        _this.packagedBlocks.push(pBlock);
    })
}

amp.prototype.buildHeaderBlocks = function( ) {
    var _this = this;

    //PROGRAM BLOCK
    var pBlock = String(_this.ltypes[6]);
    var blockText = _this.buildHashString();
    blockText += _this.PROGRAM + " " + _this.VERSION;
    pBlock += blockText.length;
    pBlock += " " + window.crc16(blockText) + ">";
    pBlock += blockText + "\n";
    _this.packagedBlocks.push(pBlock);

    //FILE BLOCK
    pBlock = String(_this.ltypes[0]);
    blockText = _this.buildHashString();
    blockText += _this.getCurrentDate() + ":" + _this.filename;
    pBlock += blockText.length;
    pBlock += " " + window.crc16(blockText) + ">";
    pBlock += blockText + "\n";
    _this.packagedBlocks.push(pBlock);

    //SIZE BLOCK
    var sizeString = "" + _this.blocks.join('').length + " " + _this.numbOfBlocks + " " + _this.blkSize
    pBlock = String(_this.ltypes[3]);
    blockText = _this.buildHashString();
    blockText += sizeString;
    pBlock += blockText.length;
    pBlock += " " + window.crc16(blockText) + ">";
    pBlock += blockText + "\n";
    _this.packagedBlocks.push(pBlock);
}

amp.prototype.buildIDBlock = function( ) {
    var _this = this;

    //ID BLOCK
    var pBlock = String(_this.ltypes[1]);
    var blockText = _this.buildHashString();
    blockText += _this.fromCallsign;
    pBlock += blockText.length;
    pBlock += " " + window.crc16(blockText) + ">";
    pBlock += blockText + "\n";
    _this.packagedBlocks.push(pBlock);
}

amp.prototype.buildFooterBlocks = function( ) {
    var _this = this;

    //CONTROL EOF
    var pBlock = String(_this.ltypes[7]);
    var blockText = _this.buildHashString(-1);
    pBlock += blockText.length;
    pBlock += " " + window.crc16(blockText) + ">";
    pBlock += blockText + "\n";
    _this.packagedBlocks.push(pBlock);

    //CONTROL EOT
    pBlock = String(_this.ltypes[7]);
    blockText = _this.buildHashString(-2);
    pBlock += blockText.length;
    pBlock += " " + window.crc16(blockText) + ">";
    pBlock += blockText + "\n";
    _this.packagedBlocks.push(pBlock);
}