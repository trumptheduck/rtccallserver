const { default: axios } = require("axios");
const CallPayload = require("./CallPayload");
const CallServer = require("./CallServer");
const CallType = require("../../common/constants/CallType");
const SocketEvents = require("../../common/constants/SocketEvents");
const Constants = require("../../common/constants/Constants");

class BotClient {
    constructor(userId) {
        this.id = "bot_" + userId;
        this.userId = userId;
        this.callServer = CallServer.getInstance();
        this.room = null;
    }

    log(...args) {
        console.log(`[BOT | ${this.id}]`, ...args);
    }

    logError(...args) {
        console.log(`[BOT ERROR | ${this.id}]`, ...args)
    }

    
    startTimer = (callback) => {
        try {
            this.waitingTimer = setTimeout(() => {
                callback();
                this.waitingTimer = null;
            }, Constants.CALL_TIMEOUT_VALUE);
        } catch (err) {
            this.logError("startTimer", err);
        }
    }

    callTimeoutCallback = (calleeId, callType) => {
        try {
            return () => {
                if (this.room)
                    this.room.onCallTimedOut(this.id);
                this.callServer.emitToUser(this.socket, calleeId, SocketEvents.CALL_TIMEDOUT);
                this.callServer.cancelCallNotification(calleeId);
                let callee = this.callServer.getUser(calleeId);
                if (callee) callee.onCallTimedOut();
                // this.stopKeepalive();
                this.log("Call timed out");
            }
        } catch (err) {
            this.logError("callTimeoutCallback", err);
        }
    }

    startCall = async () => {
        try {
            const res = await axios.post("https://skvideocall.timviec365.vn/api/getCallUser", {userId: this.userId})
            const _calleeInfo = res.data;
            let _callee = this.callServer.getUser(this.userId);
            if (!_callee) {
                _callee = this.callServer.addUser(this.userId, null);
            };
            let _payload = new CallPayload({
                roomId: this.id,
                roomCode: this.id,
                roomUrl: "",
                callerId: this.id,
                callerName: "CHĂM SÓC KHÁCH HÀNG",
                callerAvatar: "",
                calleeId: this.userId,
                calleeName: _calleeInfo.userName,
                calleeAvatar: _calleeInfo.userAvatar,
                callType: CallType.AUDIO,
                callProtocol: "sfu"
            });
            //Check if callee is busy or caller is in another call
            if (this.callServer.checkBusy(_callee.id)) {
                return;
            };
            //Start timeout timer
            this.startTimer(this.callTimeoutCallback(this.userId, _payload.callType));
            //Create and join call room
            const _room = this.callServer.createOneOnOneCallRoom(_callee, this.id, _payload.callType);
            _room.joinAsBot(this);
            this.room = _room;
            //Emit incoming call event to callee
            this.callServer.emitToUser(this.socket, this.userId, SocketEvents.CALL_INCOMING, _payload);
            _callee.inCall = true;
            _callee.lastKeptaliveTimestamp = Date.now();
            _callee.incomingCall = _payload;
            this.log("Calling user:", this.userId);
            this.callServer.sendCallNotification(this.userId, _payload);
            return true;
        } catch (err) {
            this.logError("createCall", err);
        }
    }

    onCallAccepted() {
        console.log("Call accepted");
    }

    onCallRejected() {
        console.log("Call rejected");
    }

    onCallEnded() {
        console.log("Call ended");
    }

    onCallTimedOut() {
        console.log("Call timed out");
    }

    onCallReady() {
        console.log("Call ready");
    }
}

module.exports = BotClient;