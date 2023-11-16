class CallClient {
    constructor(socket) {
        this.socket = socket;
        this._callState = CallState.NONE;
        this._csEvents = new CallEventListener();
        this.mediaEvents = new CallEventListener();
        this.isLoggedIn = false;
        this.user = null;
        this.activePayload = null;
        this.videoStatus = true;
        this.audioStatus = true;
        this.incomingCallAccepted = false;

        this.registerEvents();
    }

    get app() {
        return Application.getInstance();
    }

    get callState() {
        return this._callState;
    }

    set callState(state) {
        this._callState = state;
        this._csEvents.invoke(state);
    }

    addCallStateListener(callback) {
        this._csEvents.addListener(callback);
    }

    removeCallStateListener(callback) {
        this._csEvents.removeListener(callback);
    }

    registerEvents = () => {
        this.socket.on(SocketEvents.CALL_INCOMING, this.onCallIncoming);
        this.socket.on(SocketEvents.CALL_ACCEPTED, this.onCallAccepted);
        this.socket.on(SocketEvents.CALL_REJECTED, this.onCallRejected);
        this.socket.on(SocketEvents.CALL_TIMEDOUT, this.onCallTimedOut);
        this.socket.on(SocketEvents.CALL_BUSY, this.onCallBusy);
        this.socket.on(SocketEvents.CALL_ONGOING, this.onCallOngoing);
        this.socket.on(SocketEvents.CALL_ENDED, this.onCallEnded);
        this.socket.on(SocketEvents.CALL_RECEIVE_OFFER, this.onReceiveOffer);
        this.socket.on(SocketEvents.CALL_RECEIVE_ANSWER, this.onReceiveAnswer);
        this.socket.on(SocketEvents.CALL_WEBRTC_READY, this.onCallReady);
        this.socket.on(SocketEvents.CALL_RECEIVE_CANDIDATE, this.onReceiveCandidate);
        this.socket.on(SocketEvents.SOCKET_RECONNECTED, this.onReconnect);
        this.socket.on(SocketEvents.CALL_UPDATE_MEDIA_DEVICES_STATUS, this.onMediaStatusChange);
    }

    onCallIncoming = (payload) => {
        this.callState = CallState.RINGING;
        let _payload = new CallPayload(payload);
        this.activePayload = _payload;
        if (this.incomingCallAccepted) {
            this.acceptCall();
            this.incomingCallAccepted = false;
        } else {
            setTimeout(()=>{
                if (confirm("You have an incoming call. Do you want to accept?")) {
                    this.acceptCall();
                } else {
                    this.rejectCall();
                }
            });
        }
    }

    onCallAccepted = () => {
        this.callState = CallState.CONNECTING;
        this.app.createOffer().then(offer => {
            this.sendOffer(offer);
        })
    }

    onCallRejected = () => {
        this.callState = CallState.REJECTED;
        this.activePayload = null;
    }

    onCallTimedOut = () => {
        this.callState = CallState.TIMEDOUT;
        this.activePayload = null;
    }

    onCallBusy = () => {
        this.callState = CallState.BUSY;
        this.activePayload = null;
    }

    onCallOngoing = () => {
        this.callState = CallState.ONGOING;
        this.activePayload = null;
    }

    onCallEnded = () => {
        this.callState = CallState.ENDED;
        this.activePayload = null;
        this.app.resetCall();
    }

    onReceiveOffer = (webrtcOffer) => {
        this.app.createAnswer(webrtcOffer).then(answer => {
            this.sendAnswer(answer);
        })
    }

    onReceiveAnswer = (webrtcAnswer) => {
        this.app.onReceiveAnswer(webrtcAnswer);
    }

    onReceiveCandidate = (iceCandidate) => {
        this.app.addIceCandidate(iceCandidate);
    }

    onCallReady = () => {
        this.callState = CallState.CALLING;
    }

    onReconnect = () => {
        if (this.user)
            this.login(this.user.userId);
    }

    onMediaStatusChange = (data) => {
        console.log(data);
        this.mediaEvents.invoke(data);
    }

    login = (userId) => {
        this.user = {
            userId: userId,
            userName: "Nguyen Van B",
            userAvatar: "1231323"
        }
        this.socket.emit(SocketEvents.USER_LOGIN, userId);
    }

    createCall = (callee, callType) => {
        let _callee = new User(callee);
        let _caller = new User(this.user);
        let payload = new CallPayload({
            roomId: _caller.userId,
            callerId: _caller.userId,
            callerName: _caller.userName,
            calleeId: _callee.userId,
            calleeName: _callee.userName,
            calleeAvatar: _callee.userAvatar,
            callType: callType
        });
        this.socket.emit(SocketEvents.CALL_START, payload);
        this.activePayload = payload;
        this.callState = CallState.RINGING;
        this.setCallType(callType);
    }

    acceptCall = () => {
        if (this.activePayload) {
            this.socket.emit(SocketEvents.CALL_ACCEPT, this.activePayload);
            this.callState = CallState.CONNECTING;
            console.log(this.activePayload);
            this.setCallType(this.activePayload.callType);
        }
    }

    acceptNextCall = () => {
        this.incomingCallAccepted = true;
    }

    rejectCall = () => {
        if (this.activePayload) {
            this.socket.emit(SocketEvents.CALL_REJECT, this.activePayload);
            this.callState = CallState.REJECTED;
        }
        this.activePayload = null;
    }

    endCall = () => {
        if (this.activePayload) {
            this.socket.emit(SocketEvents.CALL_END, this.activePayload);
            this.callState = CallState.ENDED;
        }
        this.activePayload = null;
    }

    sendOffer = (webrtcOffer) => {
        this.socket.emit(SocketEvents.CALL_SEND_OFFER, webrtcOffer);
    }

    sendAnswer = (webrtcAnswer) => {
        this.socket.emit(SocketEvents.CALL_SEND_ANSWER, webrtcAnswer);
    }

    sendCandidate = (iceCandidate) => {
        this.socket.emit(SocketEvents.CALL_SEND_CANDIDATE, iceCandidate);
    }

    markCallAsReady = () => {
        console.log("ready");
        this.socket.emit(SocketEvents.CALL_CLIENT_READY);
    }

    changeMicStatus(audioStatus) {
        this.audioStatus = audioStatus;
        this.app.changeMicStatus(audioStatus);
        this.socket.emit(SocketEvents.CALL_CHANGE_MEDIA_DEVICES, {
            userId: this.user.userId,
            audio: this.audioStatus,
            video: this.videoStatus
        });
    }

    changeCameraStatus(videoStatus) {
        this.videoStatus = videoStatus;
        this.app.changeCameraStatus(videoStatus);
        this.socket.emit(SocketEvents.CALL_CHANGE_MEDIA_DEVICES, {
            userId: this.user.userId,
            audio: this.audioStatus,
            video: this.videoStatus
        });
    }

    setCallType(type) {
        console.log("calltype", type);
        if (type == CallType.VIDEO) {
            this.changeCameraStatus(true);
        } else if (type == CallType.AUDIO) {
            this.changeCameraStatus(false);
        }
    }

}

try {if (module) module.exports = CallClient} catch (err) {}