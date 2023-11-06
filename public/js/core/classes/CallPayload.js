try {const CallType = require("../../common/constants/CallType");} catch (err) {}

class CallPayload {
    constructor(config) {
        this.roomId = config.roomId?config.roomId:-1;
        this.roomCode = config.roomCode?config.roomCode:"";
        this.roomUrl = config.roomUrl?config.roomUrl:"";
        this.callerId = config.callerId?config.callerId:"";
        this.callerName = config.callerName?config.callerName:"";
        this.calleeId = config.calleeId?config.calleeId:"";
        this.calleeName = config.calleeName?config.calleeName:"";
        this.calleeAvatar = config.calleeAvatar?config.calleeAvatar:"";
        this.callType = config.callType?config.callType: CallType.NONE;
    }
}

try {if (module) module.exports = CallPayload;} catch (err) {}