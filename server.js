const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const path = require('path');

var privateKey  = fs.readFileSync('./sslcert/key.pem', 'utf8');
var certificate = fs.readFileSync('./sslcert/cert.pem', 'utf8');
var credentials = {key: privateKey, cert: certificate};

const server = https.createServer(credentials, app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, "./index.html"));
});

const Constants = {
    CALL_TIMEOUT_VALUE: 30000
}

const CallState = {
    NONE: -1,
    RINGING: 0,
    CONNECTING: 1,
    CALLING: 2,
    ENDED: 3,
    REJECTED: 4,
    TIMEDOUT: 5,
    BUSY: 6,
    ONGOING: 7
}

const SocketEvents = {
    SOCKET_DISCONNECTED: "callserver:disconnect",
    USER_LOGIN: "callserver:user_login",
    USER_LOGOUT: "callserver:user_logout",
    USER_CONNECTED: "callserver:user_connected",
    USER_DISCONNETED: "callserver:user_disconnected",
    CALL_START: "callserver:call_start",
    CALL_TIMEDOUT: "callserver:call_timeout",
    CALL_INCOMING: "callserver:call_incoming",
    CALL_ACCEPT: "callserver:call_accept",
    CALL_ACCEPTED: "callserver:call_accept",
    CALL_REJECT: "callserver:call_reject",
    CALL_REJECTED: "callserver:call_reject",
    CALL_SEND_OFFER: "callserver:call_send_offer",
    CALL_RECEIVE_OFFER: "callserver:call_receive_offer",
    CALL_SEND_ANSWER: "callserver:call_send_answer",
    CALL_RECEIVE_ANSWER: "callserver:call_receive_answer",
    CALL_SEND_CANDIDATE:"callserver:call_send_candidate",
    CALL_RECEIVE_CANDIDATE:"callserver:call_receive_candidate",
    CALL_CLIENT_READY: "callserver:call_client_ready",
    CALL_WEBRTC_READY: "callserver:call_ready",
    CALL_TOGGLE_MEDIA_DEVICES: "callserver:call_toggle_media_devices",
    CALL_UPDATE_MEDIA_DEVICES_STATUS: "callserver:call_update_media_devices_status",
    CALL_SWITCH_TO_VIDEO: "callserver:call_switch_to_video",
    CALL_SWITCH_TO_VIDEO_ACCEPT: "callserver:call_switch_to_video_accept",
    CALL_SWITCH_TO_VIDEO_ACCEPTED: "callserver:call_switch_to_video_accepted",
    CALL_SWITCH_TO_VIDEO_REJECT: "callserver:call_switch_to_video_reject",
    CALL_SWITCH_TO_VIDEO_REJECTED: "callserver:call_switch_to_video_rejected",
    CALL_BUSY: "callserver:call_busy",
    CALL_CHECK_BUSY: "callserver:call_check_busy",
    CALL_ONGOING: "callserver:call_ongoing",
    CALL_END: "callserver:call_end",
    CALL_ENDED: "callserver:call_ended"
}

const CallType = {
    VIDEO: 1,
    AUDIO: 0,
    NONE: -1
}

class CallServer {
    static instance = null;
    static getInstance() {
        if (!this.instance) this.instance = new CallServer();
        return this.instance;
    }
    constructor() {
        if (this.instance) throw Error("Can't create more than one instance of CallServer");
        this.rooms = new Map();
        this.users = new Map();
    }

    init = (io) => {
        this.io = io;
        this.io.on("connection", (socket) => this.registerEvents(socket));
    }

    registerEvents(socket) {
        socket.on(SocketEvents.USER_LOGIN, this.loginHandler(socket));
        socket.on(SocketEvents.SOCKET_DISCONNECTED, this.logoutHandler(socket));
        socket.on("test:users", () => {
            socket.emit("userdata",(()=>{
                let userData = [];
                this.users.forEach((v, k) => {
                    userData.push(v.getStatus());
                });
                return userData;
            })());
        })
        socket.on("test:rooms", () => {
            socket.emit("roomdata", (()=>{
                let roomData = [];
                this.rooms.forEach((v, k) => {
                    roomData.push(v.getStatus());
                });
                return roomData;
            })());
        })
    }

    addUser(userId, socket) {
        try {
            const _user = new User(socket, userId);
            this.users.set(userId, _user);
            return _user;
        } catch (error) {
            console.log(error);
        }
    }

    getUser(userId) {
        return this.users.get(userId);
    }

    addSocket(userId, socket) {
        const _user = this.users.get(userId);
        if (_user) {
            _user.addSocket(socket.id);
        }
    }

    removeSocket(socketId) {
        const removeArray = [];
        this.users.forEach((user, userId) => {
            if (user.hasSocket(socketId)) {
                user.removeSocket(socketId)
                if (user.isSocketsEmpty()) removeArray.push(userId);
            };
        });
        removeArray.forEach(key => this.users.delete(key));
    }

    loginHandler(socket) {
        return (userId) => {
            let user = this.users.get(userId);
            if (!user) {
                user = this.addUser(userId, socket);
            } else {
                user.addSocket(socket);
            }
        }
        
    }

    logoutHandler(socket) {
        return () => {
            this.removeSocket(socket.id);
        }
    }

    createOneOnOneCallRoom(caller, calleeId) {
        const allowedIds = new Map();
        allowedIds.set(caller.id, true);
        allowedIds.set(calleeId, true);
        const _room = new Room(caller.id, calleeId, caller, allowedIds);
        this.rooms.set(_room.id, _room);
        return _room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }

    emitToUser(socket, userId, event, ...payload) {
        const user = this.users.get(userId);
        if (user) user.traverseSockets((_, sid) => {socket.to(sid).emit(event, ...payload)});
    }

    checkBusy(userId) {
        return this.users.get(userId) ? this.users.get(userId).inCall : false;
    }
}

class User {
    constructor(socket, userId) {
        this.callServer = CallServer.getInstance();

        this.id = userId;
        this.sockets = new Map();

        this.room = null;
        this.waitingTimer = null;
        this.sdp = null;

        this.inCall = false;
        this.activeSocket = null;
        this.callType = CallType.NONE;
        this.videoState = true;
        this.audioState = true;

        this.addSocket(socket);
    }

    getStatus = () => {
        return {
            id: this.id, 
            sdp: this.sdp, 
            inCall: this.inCall, 
            callType: this.callType,
            videoState: this.videoState, 
            audioState: this.audioState,
            sockets: Array.from(this.sockets.keys())
        }
    }

    hasSocket = (socketId) => {
        return this.sockets.has(socketId)
    }

    isSocketsEmpty = () => {
        return this.sockets.size == 0;
    }

    traverseSockets = (callback) => {
        this.sockets.forEach((callSocket, sid) => callback(callSocket, sid));
    }

    addSocket = (socket) => {
        if (this.hasSocket(socket.id)) return;
        const _callSocket = new CallSocket(socket, this);
        this.sockets.set(socket.id, _callSocket);
        _callSocket.init();
    }

    removeSocket = (socketId) => {
        if (this.hasSocket(socketId)) {
            const _callSocket = this.sockets.get(socketId);
            _callSocket.dispose();
            this.sockets.delete(socketId);
            return true;
        }
        return false;
    }

    startTimer = (callback) => {
        if (!this.waitingTimer) {
            this.waitingTimer = setTimeout(() => {
                callback();
                this.waitingTimer = null;
            }, Constants.CALL_TIMEOUT_VALUE);
        }
    }

    onCallAccepted = () => {
        this.inCall = true;
        clearTimeout(this.waitingTimer);
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
    }

    onCallRejected = () => {
        this.inCall = false;
        clearTimeout(this.waitingTimer);
        if (this.activeSocket) {
            const _callSocket = this.sockets.get(this.activeSocket);
            if (_callSocket) {
                _callSocket.socket.emit(SocketEvents.CALL_REJECTED);
            }
        } else {
            this.sockets.forEach(_callSocket => {
                _callSocket.socket.emit(SocketEvents.CALL_REJECTED);
            })
        }
        this.leaveCurrentRoom();
    }

    onCallEnded = () => {
        this.inCall = false;
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
    }

    onCallTimedOut = () =>  {
        this.inCall = false;
        clearTimeout(this.waitingTimer);
        if (this.activeSocket) {
            const _callSocket = this.sockets.get(this.activeSocket);
            if (_callSocket) {
                _callSocket.socket.emit(SocketEvents.CALL_TIMEDOUT);
            }
        } else {
            this.sockets.forEach(_callSocket => {
                _callSocket.socket.emit(SocketEvents.CALL_TIMEDOUT);
            })
        }
        
        this.leaveCurrentRoom();
    }

    leaveCurrentRoom() {
        if (this.room) {
            this.room.leave(this.room.id);
            this.sockets.forEach((_callSocket) => {
                _callSocket.socket.leave(this.room.id);
            })
            this.room = null;
        }
    }

    setActiveSocket(socketId) {
        this.activeSocket = socketId;
    }

}

class CallSocket {
    roomEmit(event, ...args) {
        if (this.user.room) return this.socket.to(this.user.room.id).emit(event, ...args);
        return this.socket.emit(event, ...args);
    }

    constructor(socket, user) {
        this.socket = socket;
        this.user = user;
        this.callServer = CallServer.getInstance();
    }

    init = () => {
        this.socket.join(this.socket.id);
        this.registerEvents();
        this.onConnect();
    }

    dispose = () => {
        this.onDisconnect()
    }

    registerEvents = () => {
        this.socket.on(SocketEvents.CALL_START, this.createCall);
        this.socket.on(SocketEvents.CALL_ACCEPT, this.acceptCall);
        this.socket.on(SocketEvents.CALL_REJECT, this.rejectCall);
        this.socket.on(SocketEvents.CALL_SEND_OFFER, this.sendOffer);
        this.socket.on(SocketEvents.CALL_SEND_ANSWER, this.sendAnswer);
        this.socket.on(SocketEvents.CALL_SEND_CANDIDATE, this.sendCandidate);
    }

    onConnect = () => {
        this.roomEmit(SocketEvents.USER_CONNECTED);
    }

    onDisconnect = () => {
        this.roomEmit(SocketEvents.USER_DISCONNETED);
    }

    sendOffer = (data) => {
        this.user.sdp = data;
        this.roomEmit(SocketEvents.CALL_RECEIVE_OFFER, data);
    }

    sendAnswer = (data) => {
        this.user.sdp = data;
        this.roomEmit(SocketEvents.CALL_RECEIVE_ANSWER, data);
    }

    sendCandidate = (data) => {
        this.roomEmit(SocketEvents.CALL_RECEIVE_CANDIDATE, data);
    }

    acceptCall = (payload) => {
        let _payload = new CallPayload(payload);
        let roomId = _payload.roomId;

        console.log(this.user.id, "accept", roomId);
        
        const _room = this.callServer.getRoom(roomId);
        if (_room) {
            clearTimeout(this.user.waitingTimer);
            this.user.inCall = true;
            //Add user to room and room socket
            _room.join(this.user);
            this.joinRoom(_room);
            //Notify all room members
            _room.onCallAccepted(this.user.id);
            this.user.setActiveSocket(this.socket.id);
        }
    }

    rejectCall = (payload) => {
        let _payload = new CallPayload(payload);
        let roomId = _payload.roomId;

        const _room = this.callServer.getRoom(roomId)
        if (_room) _room.onCallRejected();
    }

    createCall = (payload) => {
        console.log(payload);
        let _payload = new CallPayload(payload);
        let callerId = _payload.callerId;
        let calleeId = _payload.calleeId;
        //Check if callee is busy or caller is in another call
        if (this.user.inCall) {
            this.socket.emit(SocketEvents.CALL_ONGOING);
            return;
        };
        if (this.callServer.checkBusy(callerId)) {
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
        if (callee) callee.inCall = true;
        //Set active call socket to this socket
        this.user.setActiveSocket(this.socket.id);
        return true;
    }

    callTimeoutCallback = (calleeId) => {
        return () => {
            this.user.inCall = false;
            this.user.room.onCallTimedOut(this.socket.id);
            this.callServer.emitToUser(this.socket, calleeId, SocketEvents.CALL_TIMEDOUT);
            let callee = this.callServer.getUser(calleeId);
            if (callee) callee.onCallTimedOut();
        }
    }

    joinRoom(room) {
        this.user.room = room;
        this.socket.join(room.id);
    }
}


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
    getStatus = () => {
        return {
            users: this.users.size,
            host: this.host.id,
            allowedIds: this.allowedIds,
            id: this.id,
            code: this.code,
        }
    }
    join = (user) => {
        this.users.set(user.id, user);
    }

    leave = (userId) => {
        let _user = this.users.get(userId);
        if (_user) {
            this.users.delete(userId);
            if (this.users.size == 0) this.callServer.deleteRoom(this.id);
        }

    }

    hasUser = (userId) => {
        return this.users.has(userId);
    }

    getUser = (userId) => {
        return this.users.get(userId);
    }

    onCallAccepted = (userId) => {
        this.callState = CallState.CALLING;
        this.callStart = new Date().getTime();
        this.users.forEach((user, uid) => {
            if (userId == uid) return;
            user.onCallAccepted();
        })
    }

    onCallRejected(userId) {
        this.callState = CallState.REJECTED;
        this.users.forEach((user, uid) => {
            if (userId == uid) return;
            user.onCallRejected();
        });
    }

    onCallBusy() {
        this.callState = CallState.BUSY;
    }

    onCallTimedOut() {
        this.callState = CallState.TIMEDOUT;
        this.users.forEach((user, uid) => {
            user.onCallTimedOut();
        });
    }

    onCallEnded() {
        this.callState = CallState.ENDED;
        this.callEnd = new Date().getTime();
        this.users.forEach((user, uid) => {
            user.onCallEnded();
        })
    }
}

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

const callServer = CallServer.getInstance();
callServer.init(io);

server.listen(443, () => {
  console.log('listening on *:443');
});