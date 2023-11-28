const CallPayload = require("./CallPayload");
const CallServer = require("./CallServer");
const SocketEvents = require("../../common/constants/SocketEvents");
const CallUser = require("./CallUser");
const Constants = require("../../common/constants/Constants");

class CallSocket {

    log = (...args) => {
        console.log(`[SOCKET: ${this.socket.id}|${this.user.id}]`, ...args);
    }

    logError = (...args) => {
        console.log(`[SOCKET ERROR: ${this.socket.id}|${this.user.id}]`, ...args);
    }

    roomEmit = (event, ...args) => {
        try {
            if (this.user.room) return this.socket.to(this.user.room.id).emit(event, ...args);
            return this.socket.emit(event, ...args);
        } catch (err) {
            this.logError("roomEmit", err);
        }
    }

    constructor(socket, user) {
        this.socket = socket;
        this.user = user;
        this.callServer = CallServer.getInstance();
        this.keepaliveTimeout = null;
    }

    init = () => {
        try {
            this.socket.join(this.socket.id);
            this.registerEvents();
            this.onConnect();
        } catch (err) {
            this.logError("init", err);
        }
    }

    registerEvents = () => {
        try {
            this.socket.on(SocketEvents.CALL_START, this.createCall);
            this.socket.on(SocketEvents.CALL_ACCEPT, this.acceptCall);
            this.socket.on(SocketEvents.CALL_REJECT, this.rejectCall);
            this.socket.on(SocketEvents.CALL_END, this.endCall);
            this.socket.on(SocketEvents.CALL_SEND_OFFER, this.sendOffer);
            this.socket.on(SocketEvents.CALL_SEND_ANSWER, this.sendAnswer);
            this.socket.on(SocketEvents.CALL_SEND_CANDIDATE, this.sendCandidate);
            this.socket.on(SocketEvents.CALL_CHANGE_MEDIA_DEVICES, this.changeMediaDevices);
            this.socket.on(SocketEvents.CALL_CLIENT_READY, this.onUserCallReady);
            this.socket.on(SocketEvents.CALL_CHECK_CALLEE_STATUS, this.checkCalleeStatus);
            this.socket.on(SocketEvents.CALL_SWITCH_TO_VIDEO, this.switchToVideo);
            this.socket.on(SocketEvents.CALL_SWITCH_TO_VIDEO_ACCEPT, this.acceptSwitchToVideo);
            this.socket.on(SocketEvents.CALL_SWITCH_TO_VIDEO_REJECT, this.rejectSwitchToVideo);
            this.socket.on(SocketEvents.CALL_KEEPALIVE, this.keepaliveCall);
        } catch (err) {
            this.logError("registerEvents", err);
        }
    }

    onLogin = (user) => {
        try {
            this.log("Logged in");
            this.socket.emit(SocketEvents.USER_LOGGEDIN, user);
        } catch (err) {
            this.logError("onLogin", err);
        }
    }

    onConnect = () => {
        try {
            this.roomEmit(SocketEvents.USER_CONNECTED);
        } catch (err) {
            this.logError("onConnect", err);
        }
    }

    onDisconnect = () => {
        try {
            
        } catch (err) {
            this.logError("onDisconnect", err);
        }
    }

    onCallReconnect = () => {
        try {
            this.socket.emit(SocketEvents.CALL_RECONNECTED);
        } catch (err) {
            this.logError("onCallReconnect", err);
        }
    }

    sendOffer = (data) => {
        try {
            this.log("Send offer");
            this.roomEmit(SocketEvents.CALL_RECEIVE_OFFER, data);
        } catch (err) {
            this.logError("sendOffer", err);
        }
    }

    sendAnswer = (data) => {
        try {
            this.log("Send answer");
            this.roomEmit(SocketEvents.CALL_RECEIVE_ANSWER, data);
        } catch (err) {
            this.logError("sendAnswer", err);
        }
    }

    sendCandidate = (data) => {
        try {
            this.log("Send candidate");
            this.roomEmit(SocketEvents.CALL_RECEIVE_CANDIDATE, data);
        } catch (err) {
            this.logError("sendCandidate", err);
        }
    }

    acceptCall = (payload) => {
        try {
            if (!this.user.inCall) return;
            if (this.user.activeSocket) {
                this.socket.emit(SocketEvents.CALL_ONGOING);
                return;
            }
            let _payload = new CallPayload(payload);
            let roomId = _payload.roomId;
            
            const _room = this.callServer.getRoom(roomId);
            if (_room) {
                this.user.incomingCall = null;
                const caller = this.callServer.getUser(_payload.callerId)
                clearTimeout(this.user.waitingTimer);
                clearTimeout(caller.waitingTimer);
                caller.inCall = true;
                this.user.inCall = true;
                //Add user to room and room socket
                _room.join(this.user);
                this.joinRoom(_room);
                //Notify all room members
                _room.onCallAccepted(this.user.id);
                this.user.setActiveSocket(this.socket.id);
                this.user.sockets.forEach(_cs => {
                    if (_cs.socket.id !== this.socket.id) {
                        _cs.socket.emit(SocketEvents.CALL_ONGOING);
                    }
                })
                this.log("Accept call from user:", _payload.callerId);
            }
        } catch (err) {
            this.logError("acceptCall", err);
        }
    }

    rejectCall = (payload) => {
        console.log(payload);
        try {
            if (!this.user.inCall) return;
            let _payload = new CallPayload(payload);
            let roomId = _payload.roomId;
    
            const _room = this.callServer.getRoom(roomId)
            if (_room) _room.onCallRejected();
            this.user.resetCallInfo();
            this.log("Reject call from user:", _payload.callerId);
        } catch (err) {
            this.logError("rejectCall", err);
        }
    }

    createCall = (payload) => {
        try {
            let _payload = new CallPayload(payload);
            let callerId = _payload.callerId;
            let calleeId = _payload.calleeId;
            if (calleeId.length == 0||callerId.length == 0) return;
            //Check if callee is busy or caller is in another call
            if (this.user.inCall) {
                this.socket.emit(SocketEvents.CALL_ONGOING);
                return;
            };
            if (this.callServer.checkBusy(calleeId)) {
                this.socket.emit(SocketEvents.CALL_BUSY);
                return;
            }
            //Make sure caller is marked as busy
            this.user.inCall = true;
            //Start timeout timer
            this.user.startTimer(this.callTimeoutCallback(calleeId));
            //Create and join call room
            const _room = this.callServer.createOneOnOneCallRoom(this.user, calleeId);
            this.joinRoom(_room);
            //Emit incoming call event to callee
            this.callServer.emitToUser(this.socket, calleeId, SocketEvents.CALL_INCOMING, _payload);
            let callee = this.callServer.getUser(calleeId);
            if (!callee) {
                callee = this.callServer.addUser(calleeId, null);
            }
            callee.inCall = true;
            callee.incomingCall = payload;
            //Set active call socket to this socket
            this.user.setActiveSocket(this.socket.id);
            this.log("Calling user:", calleeId);
            return true;
        } catch (err) {
            this.logError("createCall", err);
        }
    }

    endCall = (payload) => {
        try {
            let _payload = new CallPayload(payload);
            let calleeId = _payload.calleeId;
            let callerId = _payload.callerId;
            if (calleeId.length > 0) {
                let _callee = this.callServer.getUser(calleeId);
                let _caller = this.callServer.getUser(callerId);
                if (_callee) {
                    _callee.onCallEnded();
                }
                if (_caller) {
                    _caller.onCallEnded();
                }
            };
            if (this.user.room) {
                this.user.room.onCallEnded();
            }
            clearTimeout(this.keepaliveTimeout);
            this.keepaliveTimeout = null;
            this.log("End call");
        } catch (err) {
            this.logError("endCall", err);
        }
    }

    keepaliveCall = () => {
        try {
            if (this.keepaliveTimeout) {
                this.keepalive();
            }
        } catch (err) {
            this.logError(err);
        }
    }

    keepalive = () => {
        try {
            clearTimeout(this.keepaliveTimeout);
            this.keepaliveTimeout = setTimeout(() => {
                this.terminateCall();
                this.keepaliveTimeout = null;
                this.log("Call is terminated, keepalive failed");
            }, Constants.KEEPALIVE_TIMEOUT_VALUE);
        } catch (err) {
            this.logError(err);
        }
    }

    terminateCall = () => {
        try {
            if (this.user.room) {
                this.user.room.onCallEnded();
            }
        } catch (err) {
            this.logError(err);
        }
    }

    checkCalleeStatus = (calleeId) => {
        try {
            if (this.user) {
                const _isBusy = this.callServer.checkBusy(calleeId);
                console.log(_isBusy);
                this.socket.emit(SocketEvents.CALL_CALLEE_STATUS, {busy: _isBusy, ongoing: this.user.inCall});
            }
            console.log("checkCalleeStatus");
        } catch (err) {
            this.logError("checkCalleeStatus", err);
        }
    }

    switchToVideo = () => {
        try {
            this.log("Request switch to video call");
            this.roomEmit(SocketEvents.CALL_SWITCH_TO_VIDEO_REQUESTED);
        } catch (err) {
            this.logError("switchToVideo", err);
        }
    }

    acceptSwitchToVideo = () => {
        try {
            this.log("Accept switch to video call");
            this.roomEmit(SocketEvents.CALL_SWITCH_TO_VIDEO_ACCEPTED);
        } catch (err) {
            this.logError("acceptSwitchToVideo", err);
        }
    }

    rejectSwitchToVideo = () => {
        try {
            this.log("Reject switch to video call");
            this.roomEmit(SocketEvents.CALL_SWITCH_TO_VIDEO_REJECTED);
        } catch (err) {
            this.logError("rejectSwitchToVideo", err);
        }
    }

    changeMediaDevices = (payload) => {
        try {
            this.roomEmit(SocketEvents.CALL_UPDATE_MEDIA_DEVICES_STATUS, payload);
        } catch (err) {
            this.logError("changeMediaDevices", err);
        }
    }

    onUserCallReady = () => {
        try {
            if (this.user.room) {
                this.keepalive();
                this.user.isCallReady = true;
                this.user.room.onMemberCallReady();
            }
        } catch (err) {
            this.logError("onUserCallReady", err);
        }
    }

    callTimeoutCallback = (calleeId) => {
        try {
            return () => {
                if (this.user.room)
                    this.user.room.onCallTimedOut(this.socket.id);
                this.callServer.emitToUser(this.socket, calleeId, SocketEvents.CALL_TIMEDOUT);
                let callee = this.callServer.getUser(calleeId);
                if (callee) callee.onCallTimedOut();
                this.log("Call timed out");
            }
        } catch (err) {
            this.logError("callTimeoutCallback", err);
        }
    }

    joinRoom = (room) => {
        try {
            this.user.room = room;
            this.socket.join(room.id);
            this.log("Joined room:",  room.id);
        } catch (err) {
            this.logError("joinRoom", err);
        }
    }
}

try {if (module) module.exports = CallSocket;} catch (err) {}