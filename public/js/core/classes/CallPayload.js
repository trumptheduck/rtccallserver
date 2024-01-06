try {const CallType = require("../../common/constants/CallType");} catch (err) {}

class CallPayload {
    constructor(config) {
        this.roomId = config.roomId?String(config.roomId):-1;
        this.roomCode = config.roomCode?String(config.roomCode):"";
        this.roomUrl = config.roomUrl?String(config.roomUrl):"";
        this.callerId = config.callerId?String(config.callerId):"";
        this.callerName = config.callerName?String(config.callerName):"";
        this.callerAvatar = config.callerAvatar?String(config.callerAvatar):"";
        this.calleeId = config.calleeId?String(config.calleeId):"";
        this.calleeName = config.calleeName?String(config.calleeName):"";
        this.calleeAvatar = config.calleeAvatar?String(config.calleeAvatar):"";
        this.callType = config.callType?config.callType: CallType.NONE;
        this.callProtocol = config.callProtocol?config.callProtocol: "peers"
    }
}

try {if (module) module.exports = CallPayload;} catch (err) {}