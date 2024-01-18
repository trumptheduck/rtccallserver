const CallServer = require("./CallServer");
const CallState = require("../../common/constants/CallState");

class Room {
    constructor(callerId, calleeId, host, allowedIds) {
        this.users = new Map();
        this.bots = new Map();
        this.host = host;
        this.allowedIds = allowedIds;
        this.id = callerId;
        this.code = calleeId;
        this.users.set(host.id, host);

        this.callerId = callerId;
        this.calleeId = calleeId;

        this.callServer = CallServer.getInstance();

        this.callState = CallState.RINGING;
        this.isCallConnected = false;
        this.callStart = 0;
        this.callEnd = 0;
        this.callType = 0;
    }

    log(...args) {
        console.log(`[ROOM: ${this.id}]`, ...args);
    }

    logError(...args) {
        console.log(`[ROOM ERROR: ${this.id}]`, ...args);
    }

    getStatus = () => {
        try {
            return {
                users: this.users.size,
                host: this.host.id,
                allowedIds: this.allowedIds,
                id: this.id,
                code: this.code,
            }
        } catch (err) {
            this.logError("getStatus", err);
        }
    }
    setCallType = (callType) => {
        try {
            this.callType = callType;
            this.log("Call type", callType);
        } catch (err) {
            this.logError("setCallType", err);
        }
    }
    join = (user) => {
        try {
            this.users.set(user.id, user);
            this.log("User joined:", user.id);
        } catch (err) {
            this.logError("join", err);
        }
    }

    joinAsBot = (bot) => {
        this.bots.set(bot.id, bot);
    }

    leave = (userId) => {
        try {
            let _user = this.getUser(userId);
            if (_user) {
                this.users.delete(userId);
                this.log("User left:", userId);
                if (this.users.size == 0) {
                    if (this.isCallConnected) {
                        this.callEnd = Date.now();
                        const _duration = this.callEnd - this.callStart;
                        this.callServer.sendCallEndedMessage(this.callerId, this.calleeId, _duration, this.callType);
                        this.log("Call time: ", _duration);
                    }
                    this.log("Room disposed:", this.id);
                    this.callServer.deleteRoom(this.id)
                };
            }
        } catch (err) {
            this.logError("leave", err);
        }
    }

    hasUser = (userId) => {
        try {
            return this.users.has(String(userId));
        } catch (err) {
            this.logError("hasUser", err);
        }
    }

    getUser = (userId) => {
        try {
            return this.users.get(String(userId));
        } catch (err) {
            this.logError("getUser", err);
        }
    }

    onDisconnect = (userId) => {
        try {
            this.log("User disconnected:", userId);
            this.users.forEach((user, uid) => {
                if (userId == uid) return;
                user.onRoomMemberDisconnect();
            })
        } catch (err) {
            this.logError("onDisconnect", err);
        }
    }

    onCallAccepted = (userId) => {
        try {
            this.log("Call accepted:", userId);
            this.callState = CallState.CALLING;
            this.callStart = Date.now();
            this.users.forEach((user, uid) => {
                if (userId == uid) return;
                user.onCallAccepted();
                this.callServer.cancelCallNotification(uid);
            })
            this.bots.forEach((bot, id) => {
                bot.onCallAccepted();
            })
        } catch (err) {
            this.logError("onCallAccepted", err);
        }
    }

    onCallRejected(userId) {
        try {
            this.log("Call rejected:", userId);
            this.callState = CallState.REJECTED;
            this.users.forEach((user, uid) => {
                user.onCallRejected();
            });
            this.bots.forEach((bot, id) => {
                bot.onCallRejected();
            })
        } catch (err) {
            this.logError("onCallRejected", err);
        }
    }

    onCallBusy() {
        try {
            this.log("Call busy");
            this.callState = CallState.BUSY;
        } catch (err) {
            this.logError("onCallBusy", err);
        }
    }

    onCallTimedOut() {
        try {
            this.log("Call timed out");
            this.callState = CallState.TIMEDOUT;
            this.users.forEach((user, uid) => {
                user.onCallTimedOut();
            });
            this.bots.forEach((bot, id) => {
                bot.onCallTimedOut();
            })
        } catch (err) {
            this.logError("onCallTimedOut", err);
        }
    }

    onCallEnded() {
        try {
            this.log("Call ended");
            this.callState = CallState.ENDED;
            this.callEnd = new Date().getTime();
            this.log("Call time", this.callStart - this.callEnd);
            this.users.forEach((user, uid) => {
                user.onCallEnded();
            })
            this.bots.forEach((bot, id) => {
                bot.onCallEnded();
            })
        } catch (err) {
            this.logError("onCallEnded", err);
        }
    }

    onMemberCallReady() {
        try {
            let isEveryoneReady = true;
            this.users.forEach(user => {
                if (!user.isCallReady) isEveryoneReady = false;
            })
            if (isEveryoneReady) {
                this.isCallConnected = true;
                this.callStart = new Date().getTime();
                this.callState = CallState.CALLING;
                this.users.forEach((user, uid) => {
                    user.onCallReady();
                })
                this.bots.forEach((bot, id) => {
                    bot.onCallReady();
                })
            }
            this.log("Call ready");

        } catch (err) {
            this.logError("onMemberCallReady", err);
        }
    }
}

try {if (module) module.exports = Room;} catch (err) {}