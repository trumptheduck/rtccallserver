async function sleep(ms) {
return new Promise((r) => setTimeout(() => r(), ms));
}

class CallClient {
    constructor(socket) {
        this.socket = socket;
        this._callState = CallState.NONE;
        this._csEvents = new CallEventListener();
        this.mediaEvents = new CallEventListener();
        this.payloadEvents = new CallEventListener();
        this.isLoggedIn = false;
        this.user = null;
        this.activePayload = null;
        this.videoStatus = true;
        this.audioStatus = true;
        this.incomingCallAccepted = false;
        this.keepAliveTimer = null;

        this.sendTransport = null;
        this.recvTransport = null;

        this.isReadyToConsume = false;

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

    emitAsync(event, ...args) {
        console.log("Emitted:", event, args);
        if (args.length == 0) args = [{}];
        return new Promise((resolve) => {
            this.socket.emit(event, ...args, function(...data) {
                console.log("Callback:", event, data);
                resolve(...data);
            })
        })
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
        this.socket.on(SocketEvents.SFU_NEW_PRODUCER, this.onNewProducer);
    }

    onCallIncoming = (payload) => {
        this.callState = CallState.RINGING;
        let _payload = new CallPayload(payload);
        this.activePayload = _payload;
        this.payloadEvents.invoke(this.activePayload);
        if (this.incomingCallAccepted) {
            this.acceptCall();
            this.incomingCallAccepted = false;
        }
    }

    onCallAccepted = () => {
        this.callState = CallState.CONNECTING;
        this.socket.emit(SocketEvents.CALL_CHANGE_MEDIA_DEVICES, {
            userId: this.user.userId,
            audio: this.audioStatus,
            video: this.videoStatus
        });
        if (this.activePayload.callProtocol == CallProtocol.PEERS) {
            this.app.createOffer().then(offer => {
                this.sendOffer(offer);
            })
        } else if (this.activePayload.callProtocol == CallProtocol.SFU) {
            this.connectSFUCall();
        }

    }

    onCallRejected = () => {
        this.callState = CallState.REJECTED;
        this.activePayload = null;
        this.stopKeepalive();
    }

    onCallTimedOut = () => {
        this.callState = CallState.TIMEDOUT;
        this.activePayload = null;
        this.stopKeepalive();
    }

    onCallBusy = () => {
        this.callState = CallState.BUSY;
        this.activePayload = null;
        this.stopKeepalive();
    }

    onCallOngoing = () => {
        this.callState = CallState.ONGOING;
        this.activePayload = null;
        this.stopKeepalive();
    }

    onCallEnded = () => {
        this.callState = CallState.ENDED;
        this.activePayload = null;
        this.app.remoteVideoStream = null;
        this.stopKeepalive();
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

    login = (user, callback) => {
        this.user = user;
        this.socket.emit(SocketEvents.USER_LOGIN, user.userId);
        this.socket.once(SocketEvents.USER_LOGGEDIN, callback);
    }

    createCall = (callee, callType, protocol = CallProtocol.PEERS) => {
        let _callee = new User(callee);
        let _caller = new User(this.user);
        let payload = new CallPayload({
            roomId: _caller.userId,
            callerId: _caller.userId,
            callerName: _caller.userName,
            callerAvatar: _caller.userAvatar,
            calleeId: _callee.userId,
            calleeName: _callee.userName,
            calleeAvatar: _callee.userAvatar,
            callType: callType,
            callProtocol: protocol
        });
        console.log(payload);
        this.socket.emit(SocketEvents.CALL_START, payload);
        this.activePayload = payload;
        this.payloadEvents.invoke(this.activePayload);
        this.callState = CallState.RINGING;
        this.setCallType(callType);
        this.startKeepalive();
    }

    acceptCall = () => {
        if (this.activePayload) {
            this.socket.emit(SocketEvents.CALL_ACCEPT, this.activePayload);
            this.callState = CallState.CONNECTING;
            console.log(this.activePayload);
            this.setCallType(this.activePayload.callType);
            this.startKeepalive();

            if (this.activePayload.callProtocol == CallProtocol.SFU) {
                this.connectSFUCall();
            }
        }
    }

    getRouterCapabilities = async () => {
        return this.emitAsync(SocketEvents.SFU_GET_RTP_CAPABILITIES);
    }

    connectSFUCall = async () => {
        while (!this.app.sfu.device) {
            await sleep(100);
        }
        if (!this.sendTransport)
            this.sendTransport = await this.createSendTransport(this.app.sfu.device.rtpCapabilities);
        this.app.sfu.publish(this.sendTransport, this.app.localVideoStream);
    }

    createSendTransport = async (rtpCapabilities) => {
        let pTransportData = await this.emitAsync(SocketEvents.SFU_PTRANSPORT_CREATE, {
            forceTcp: false,
            rtpCapabilities: rtpCapabilities,
        })
        let sendTransport = await this.app.sfu.createSendTransport(pTransportData.params);

        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            await this.emitAsync(SocketEvents.SFU_PTRANSPORT_CONNECT, { dtlsParameters });
            callback();
        });
        sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            const pcdata = await this.emitAsync(SocketEvents.SFU_PRODUCE, {
                transportId: sendTransport.id,
                kind,
                rtpParameters,
            });
           callback({id: pcdata.id});
        });
        sendTransport.on('connectionstatechange', (state) => {
            console.log("sendTransport", state);
            switch (state) {
                case 'connecting':
                    break;
            
                case 'connected':
                    break;
            
                case 'failed':
                    sendTransport.close();
                    break;

                default: return;
            }
        });
        return sendTransport;
    }

    createRecvTransport = async () => {
        let cTransportData = await this.emitAsync(SocketEvents.SFU_CTRANSPORT_CREATE);
        let recvTransport = await this.app.sfu.createRecvTransport(cTransportData.params);
        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log("recvTransportConnected");
            await this.emitAsync(SocketEvents.SFU_CTRANSPORT_CONNECT, {
              transportId: recvTransport.id,
              dtlsParameters
            });
            callback();
        });
        recvTransport.on('connectionstatechange', async (state) => {
            console.log("recvTransport", state);
            switch (state) {
              case 'connecting':
                break;
        
              case 'connected':
                break;
        
              case 'failed':
                recvTransport.close();
                break;
              default: return;
            }
        });
        return recvTransport;
    }

    onNewProducer = async (data) => {
        while (!this.app.sfu.device) {
            await sleep(100);
        }
        if (!this.recvTransport)
            this.recvTransport = await this.createRecvTransport();

        let userId = data.id;
        let kind = data.kind;
        const rtpCapabilities = this.app.sfu.device.rtpCapabilities;
        const params = await this.emitAsync(SocketEvents.SFU_CONSUME, { rtpCapabilities, userId, kind });
        let track = await this.app.sfu.subscribe(this.recvTransport, params);
        while (this.recvTransport.connectionState !== 'connected') {
            await sleep(100);
            console.log("Waiting for connection", this.recvTransport.connectionState);
        }
        this.socket.emit(SocketEvents.SFU_RESUME, kind);
        this.app.setRemoteStream(track);
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
        this.stopKeepalive();
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

    startKeepalive = () => {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(()=>{
            this.socket.emit(SocketEvents.CALL_KEEPALIVE);
        }, 2000);
    }

    stopKeepalive = () => {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
    }

}

try {if (module) module.exports = CallClient} catch (err) {}