const CallSocket = require("./CallSocket");
const CallServer = require("./CallServer");
const CallType = require("../../common/constants/CallType");
const SocketEvents = require("../../common/constants/SocketEvents");
const Constants = require("../../common/constants/Constants");

class CallUser {
    constructor(socket, userId) {
        this.callServer = CallServer.getInstance();

        this.id = userId;
        this.sockets = new Map();

        this.room = null;
        this.waitingTimer = null;
        this.disconnectTimer = null;
        this.disposeTimer = null;

        this.inCall = false;
        this.isCallReady = false;
        this.incomingCall = null;
        this.isOnline = true;
        this.activeSocket = null;
        this.callType = CallType.NONE;

        if (socket) {
            this.addSocket(socket);
        } else {
            this.onAllSocketsDisconnected();
        }
    }

    log(...args) {
        console.log(`[USER: ${this.id}]`, ...args);
    }

    logError(...args) {
        console.log(`[USER ERROR: ${this.socket.id}|${this.user.id}]`, ...args);
    }

    getStatus = () => {
        try {
            return {
                id: this.id, 
                inCall: this.inCall, 
                callType: this.callType,
                sockets: Array.from(this.sockets.keys())
            }
        } catch (err) {
            this.logError("getStatus", err);
        }
    }

    hasSocket = (socketId) => {
        try {
            return this.sockets.has(socketId)
        } catch (err) {
            this.logError("hasSocket", err);
        }
    }

    isSocketsEmpty = () => {
        try {
            return this.sockets.size == 0;
        } catch (err) {
            this.logError("isSocketEmpty", err);
        }
    }

    traverseSockets = (callback) => {
        try {
            this.sockets.forEach((callSocket, sid) => callback(callSocket, sid));
        } catch (err) {
            this.logError("traverseSockets", err);
        }
    }

    addSocket = (socket) => {
        try {
            if (this.hasSocket(socket.id)) return;
            const _callSocket = new CallSocket(socket, this);
            this.sockets.set(socket.id, _callSocket);
            _callSocket.init();
        } catch (err) {
            this.logError("addSocket", err);
        }
    }

    removeSocket = (socketId) => {
        try {
            if (this.hasSocket(socketId)) {
                const _callSocket = this.sockets.get(socketId);
                _callSocket.onDisconnect();
                this.sockets.delete(socketId);
                if (this.sockets.size == 0) {
                    this.onAllSocketsDisconnected();
                }
                if (this.inCall) {
                    this.onCallSocketDisconnected(socketId);
                }
                return true;
            }
            return false;
        } catch (err) {
            this.logError("removeSocket", err);
        }
    }

    startTimer = (callback) => {
        try {
            if (!this.waitingTimer) {
                this.waitingTimer = setTimeout(() => {
                    callback();
                    this.waitingTimer = null;
                }, Constants.CALL_TIMEOUT_VALUE);
            }
        } catch (err) {
            this.logError("startTimer", err);
        }
    }

    onLogin = (socketId) => {
        try {
            console.log(this.sockets.size);
            const _callSocket = this.sockets.get(socketId);
            clearInterval(this.disposeTimer);
            if (this.disposeTimer) {
                this.log(`Reconnected with sid: ${socketId}`);
                this.disposeTimer = null;
            } else {
                this.log(`Logged in with sid: ${socketId}`);
            }
            if (this.incomingCall) {
                this.sockets.forEach(_cs => _cs.socket.emit(SocketEvents.CALL_INCOMING, this.incomingCall));
            }
            _callSocket.onLogin();
            // if (this.inCall&&this.activeSocket == null) {
            //     this.onCallReconnect(socketId);
            // }
        } catch (err) {
            this.logError("onLogin", err);
        }
    }

    onCallAccepted = () => {
        try {
            this.inCall = true;
            this.incomingCall = null;
            clearTimeout(this.waitingTimer);
            this.log("Call accepted")
            if (this.activeSocket) {
                const _callSocket = this.sockets.get(this.activeSocket);
                if (_callSocket) {
                    _callSocket.socket.emit(SocketEvents.CALL_ACCEPTED);
                }
            } else {
                this.sockets.forEach(_callSocket => {
                    _callSocket.socket.emit(SocketEvents.CALL_ACCEPTED);
                })
            }
        } catch (err) {
            this.logError("onCallAccepted", err);
        }
    }

    onCallRejected = () => {
        try {
            clearTimeout(this.waitingTimer);
            this.log("Call rejected")
            this.sockets.forEach(_callSocket => {
                _callSocket.socket.emit(SocketEvents.CALL_REJECTED);
            }) 
            this.leaveCurrentRoom();
            this.resetCallInfo();
        } catch (err) {
            this.logError("onCallRejected", err);
        }
    }

    onCallEnded = () => {
        try {
            this.log("Call ended");
            this.sockets.forEach(_callSocket => {
                _callSocket.socket.emit(SocketEvents.CALL_ENDED);
            })
            this.leaveCurrentRoom();
            this.resetCallInfo();
        } catch (err) {
            this.logError("onCallEnded", err);
        }
    }

    onCallTimedOut = () => {
        try {
            clearTimeout(this.waitingTimer);
            this.log("Call timed out");
            this.sockets.forEach(_callSocket => {
                _callSocket.socket.emit(SocketEvents.CALL_TIMEDOUT);
            })
            this.leaveCurrentRoom();
            this.resetCallInfo();
        } catch (err) {
            this.logError("onCallTimedOut", err);
        }
    }

    onRoomMemberDisconnect = () => {
        try {
            if (this.activeSocket) {
                const _callSocket = this.sockets.get(this.activeSocket);
                if (_callSocket) {
                    _callSocket.socket.emit(SocketEvents.CALL_ENDED);
                }
            } else {
                this.sockets.forEach(_callSocket => {
                    _callSocket.socket.emit(SocketEvents.CALL_ENDED);
                })
            }
            this.leaveCurrentRoom();
            this.resetCallInfo();
        } catch (err) {
            this.logError("onRoomMemberDisconnect", err);
        }
    }

    onCallSocketDisconnected = (socketId) => {
        try {
            if (socketId == this.activeSocket) {
                if (this.inCall) {
                    this.activeSocket = null;
                    this.log(`Active socket disconnected, awaiting reconnection...`);
                    clearTimeout(this.disconnectTimer);
                    this.disconnectTimer = setTimeout(() => {
                        if (this.room) {
                            this.room.onDisconnect(this.id);
                        }
                        this.leaveCurrentRoom();
                        this.resetCallInfo();
                        this.log(`Active call disconnected`);
                    }, Constants.DISCONNECT_TIMEOUT_VALUE);
                }
            }
        } catch (err) {
            this.logError("onCallSocketDisconnected", err);
        }
    }

    onCallReconnect = (socketId) => {
        try {
            this.log(`Call reconnected: SID: ${socketId}`);
            clearTimeout(this.disconnectTimer);
            this.activeSocket = socketId;
            const _callSocket = this.sockets.get(socketId);
            if (_callSocket) _callSocket.onCallReconnect();
        } catch (err) {
            this.logError("onCallReconnect", err);
        }
    }
    onCallReady = () => {
        try {
            this.log(`Call ready`);
            if (this.activeSocket) {
                const _callSocket = this.sockets.get(this.activeSocket);
                if (_callSocket) {
                    _callSocket.socket.emit(SocketEvents.CALL_WEBRTC_READY);
                }
            } else {
                this.sockets.forEach(_callSocket => {
                    _callSocket.socket.emit(SocketEvents.CALL_WEBRTC_READY);
                })
            }
        } catch (err) {
            this.logError("onCallReady", err);
        }
    }

    resetCallInfo = () => {
        try {
            this.room = null;
    
            this.inCall = false;
            this.isCallReady = false;
            this.activeSocket = null;
            this.callType = CallType.NONE;
            this.incomingCall = null;

            this.log("Resetting call info...");
        } catch (err) {
            this.logError("resetCallInfo", err);
        }
    }

    onAllSocketsDisconnected = () => {
        try {
            this.isOnline = false;
            this.log(`All sockets disconnected, awaiting reconnection...`);
            clearTimeout(this.disposeTimer);
            this.disposeTimer = setTimeout(() => {
                this.callServer.removeUser(this.id);
                this.log(`User removed`);
                console.log(this.callServer.users.size);
            }, Constants.DISPOSE_TIMEOUT_VALUE);
        } catch (err) {
            this.logError("onAllSocketsDisconnected", err);
        }
    }

    leaveCurrentRoom() {
        try {
            if (this.room) {
                this.log("Leaving room:", this.room.id);
                this.room.leave(this.id);
                this.sockets.forEach((_callSocket) => {
                    _callSocket.socket.leave(this.room.id);
                })
                this.room = null;
            }
        } catch (err) {
            this.logError("leaveCurrentRoom", err);
        }
    }

    setActiveSocket(socketId) {
        try {
            this.activeSocket = socketId;
            this.log("Active socket:", socketId);
        } catch (err) {
            this.logError("setActiveSocket", err);
        }
    }

}

try {if (module) module.exports = CallUser;} catch (err) {}