const CallSocket = require("./CallSocket");
const CallServer = require("./CallServer");
const SFUService = require("./SFUService");
const CallType = require("../../common/constants/CallType");
const SocketEvents = require("../../common/constants/SocketEvents");
const Constants = require("../../common/constants/Constants");
const CallProtocol = require("../../common/constants/CallProtocol");

class CallUser {
    constructor(socket, userId) {
        this.callServer = CallServer.getInstance();
        this.sfuService = SFUService.getInstance();

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

        this.lastKeptaliveTimestamp = null;
        this.resendNotificationTimer = null;
        this.resendNotificationTimeout = null;

        this.consumerTransport = null;
        this.producerTransport = null;
        this.videoProducer = null;
        this.audioProducer = null;
        this.videoConsumer = null;
        this.audioConsumer = null;
        this.callProtocol = CallProtocol.PEERS;

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
        console.log(`[USER ERROR: ${this.id}]`, ...args);
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
                if (this.inCall) {
                    this.onCallSocketDisconnected(socketId);
                }
                this.sockets.delete(socketId);
                if (this.sockets.size == 0) {
                    this.onAllSocketsDisconnected();
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
            this.waitingTimer = setTimeout(() => {
                callback();
                this.waitingTimer = null;
            }, Constants.CALL_TIMEOUT_VALUE);
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
            clearTimeout(this.waitingTimer);
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
            this.log("Call timed out", this.sockets.size);
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
            this.sockets.forEach(_callSocket => {
                _callSocket.socket.emit(SocketEvents.CALL_ENDED);
            })
            this.leaveCurrentRoom();
            this.resetCallInfo();
        } catch (err) {
            this.logError("onRoomMemberDisconnect", err);
        }
    }

    onCallSocketDisconnected = (socketId) => {
        try {
            if (socketId == this.activeSocket) {
                const _activeCS = this.sockets.get(this.activeSocket);
                clearTimeout(_activeCS.keepaliveTimeout);
                _activeCS.keepaliveTimeout = null;
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
            this.sfuService.removeConsumerByUserId(this.id);
            
            if (this.producerTransport) {
                this.producerTransport.close();
            }
            if (this.consumerTransport) {
                this.consumerTransport.close();
            }

            this.room = null;
    
            this.inCall = false;
            this.isCallReady = false;
            this.activeSocket = null;
            this.callType = CallType.NONE;
            this.incomingCall = null;
            this.waitingTimer = null;

            this.consumerTransport = null;
            this.producerTransport = null;
            this.audioConsumer = null;
            this.videoConsumer = null;
            this.consumer = null;
            this.callProtocol = CallProtocol.PEERS;

            this.stopResendNotification("Resetted");

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
                this.resetCallInfo();
                this.callServer.removeUser(this.id);
                this.log(`User removed`);
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

    getActiveSocket() {
        try {
            return this.sockets.get(this.activeSocket);
        } catch (error) {
            this.logError("getActiveSocket", err);
        }
    }

    attemptToSendCallNotification(calleeId, payload) {
        try {
            this.callServer.sendCallNotification(calleeId, payload);
            clearInterval(this.resendNotificationTimer);
            clearTimeout(this.resendNotificationTimeout);
            let count = 0;
            this.resendNotificationTimer = setInterval(() => {
                // if (count >= 2) {
                //     this.stopResendNotification("Limit exceeded")
                // } else {
                //     this.log("Resend call notification | Count: ", count, " | Send to: ", calleeId);
                //     this.callServer.sendCallNotification(calleeId, payload);
                // }
                // count++;
            }, Constants.RESEND_NOTIFICATION_INTERVAL);
            const _interval = this.resendNotificationTimer;
            this.resendNotificationTimeout = setTimeout(()=>{
                this.stopResendNotification("Timed out");
            }, Constants.CALL_TIMEOUT_VALUE);
        } catch (err) {
            this.logError("attemptToSendCallNotification", err);
        }
    }

    confirmNotificationReceived = () => {
        try {
            this.stopResendNotification("Received");
        } catch (err) {
            this.logError("confirmNotificationReceived", err);
        }
    }

    stopResendNotification = (reason = "") => {
        clearInterval(this.resendNotificationTimer);
        clearTimeout(this.resendNotificationTimeout);
        this.log(`Stopped resend notification (${reason})`);
    };


}

try {if (module) module.exports = CallUser;} catch (err) {}