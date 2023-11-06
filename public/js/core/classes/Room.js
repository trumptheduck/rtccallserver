const CallServer = require("./CallServer");
const CallState = require("../../common/constants/CallState");

class Room {
    constructor(id, code, host, allowedIds) {
        this.users = new Map();
        this.host = host;
        this.allowedIds = allowedIds;
        this.id = id;
        this.code = code;
        this.users.set(host.id, host);

        this.callServer = CallServer.getInstance();

        this.callState = CallState.RINGING;
        this.callStart = 0;
        this.callEnd = 0;
    }

    log(...args) {
        console.log(`[ROOM: ${this.id}]`, ...args);
    }

    logError(...args) {
        console.log(`[USER ERROR: ${this.socket.id}|${this.user.id}]`, ...args);
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
    join = (user) => {
        try {
            this.users.set(user.id, user);
            this.log("User joined:", user.id);
        } catch (err) {
            this.logError("join", err);
        }
    }

    leave = (userId) => {
        try {
            let _user = this.users.get(userId);
            if (_user) {
                this.users.delete(userId);
                this.log("User left:", userId);
                if (this.users.size == 0) {
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
            return this.users.has(userId);
        } catch (err) {
            this.logError("hasUser", err);
        }
    }

    getUser = (userId) => {
        try {
            return this.users.get(userId);
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
            this.callStart = new Date().getTime();
            this.users.forEach((user, uid) => {
                if (userId == uid) return;
                user.onCallAccepted();
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
                if (userId == uid) return;
                user.onCallRejected();
            });
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
        } catch (err) {
            this.logError("onCallTimedOut", err);
        }
    }

    onCallEnded() {
        try {
            this.log("Call ended");
            this.callState = CallState.ENDED;
            this.callEnd = new Date().getTime();
            this.users.forEach((user, uid) => {
                user.onCallEnded();
            })
        } catch (err) {
            this.logError("onCallEnded", err);
        }
    }

    onMemberCallReady() {
        try {
            const isEveryoneReady = true;
            this.users.forEach(user => {
                if (!user.isCallReady) isEveryoneReady = false;
            })
            if (isEveryoneReady) {
                this.callStart = new Date().getTime();
                this.callState = CallState.CALLING;
                this.users.forEach((user, uid) => {
                    user.onCallReady();
                })
            }
            this.log("Call ready");

        } catch (err) {
            this.logError("onMemberCallReady", err);
        }
    }
}

try {if (module) module.exports = Room;} catch (err) {}