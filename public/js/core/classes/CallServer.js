const CallUser = require("./CallUser");
const Room = require("./Room");
const SocketEvents = require("../../common/constants/SocketEvents");
const { default: axios } = require("axios");
const Constants = require("../../common/constants/Constants");
const CallPayload = require("./CallPayload");
const SFUService = require("./SFUService");

function millisecondToTime(duration) {
    var milliseconds = Math.floor((duration % 1000) / 100),
      seconds = Math.floor((duration / 1000) % 60),
      minutes = Math.floor((duration / (1000 * 60)) % 60),
      hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    
    if (hours > 0) {
        hours = (hours < 10) ? "0" + hours : hours;
        hours = hours + ":"
    } else {
        hours = ""
    }
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;
  
    return hours + minutes + ":" + seconds;
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
        this.sfu = SFUService.getInstance();
    }

    log(...args) {
        console.log(`[SERVER]`, ...args);
    }

    logError(...args) {
        console.log(`[SERVER ERROR]`, ...args)
    }

    init = (io) => {
        this.io = io;
        this.io.on("connection", (socket) => this.registerEvents(socket));
        this.log("SERVER STARTED!")
        this.sfu.init().then(()=>{this.log("SFU INITIALIZED!")})
    }

    registerEvents(socket) {
        try {
            socket.on(SocketEvents.USER_LOGIN, this.loginHandler(socket));
            socket.on(SocketEvents.SOCKET_DISCONNECTED, this.logoutHandler(socket));
            socket.on(SocketEvents.SERVICE_STATUS, (data, callback) => {
                callback({
                    sfuAvailable: !this.sfu.isOverloaded,
                    sfuLoad: this.sfu.activeConsumers + "/" + this.sfu.consumerLimit
                })
            })
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
        } catch (err) {
            this.logError("registerEvents", err);
        }
    }

    addUser = (userId, socket) => {
        try {
            userId = String(userId);
            const _user = new CallUser(socket, userId);
            this.users.set(userId, _user);
            this.log("Add user:", userId);
            return _user;
        } catch (err) {
            this.logError("addUser", err);
        }
    }

    getUser = (userId) => {
        try {
            return this.users.get(String(userId));
        } catch (err) {
            this.logError("getUser", err);
        }
    }

    addSocket = (userId, socket) => {
        try {
            const _user = this.getUser(userId);
            if (_user) {
                _user.addSocket(socket.id);
                this.log("Add socket:", userId);
            }
        } catch (err) {
            this.logError("addSocket", err);
        }
    }

    removeUser = (key) => {
        try {
            this.users.delete(key);
            this.log("Remove user:", key);
        } catch (err) {
            this.logError("removeUser", err);
        }
    }

    loginHandler = (socket) => {
        try {
            return (userId) => {
                this.log("User logged in:", userId);
                let user = this.getUser(userId);
                if (!user) {
                    user = this.addUser(userId, socket);
                    user.onLogin(socket.id);
                } else {
                    user.addSocket(socket);
                    user.onLogin(socket.id);
                }
                this.log(this.users.size);
            }
        } catch (err) {
            this.logError("loginHandler", err);
        }     
    }

    logoutHandler = (socket) => {
        try {
            return () => {
                this.log("User logged out:", socket.id);
                this.users.forEach((user, userId) => {
                    user.removeSocket(socket.id);
                });
            }
        } catch (err) {
            this.logError("logoutHandler", err);
        }
    }

    createOneOnOneCallRoom = (caller, calleeId, callType) => {
        try {
            const allowedIds = new Map();
            allowedIds.set(caller.id, true);
            allowedIds.set(calleeId, true);
            const _room = new Room(caller.id, calleeId, caller, allowedIds);
            _room.setCallType(callType);
            this.rooms.set(_room.id, _room);
            this.log("Created 1-1 call room for:", caller.id, " | ", calleeId, " | ROOMID:", _room.id);
            return _room;
        } catch (err) {
            this.logError("createOneOnOneCallRoom", err);
        }
    }

    getRoom = (roomId) => {
        try {
            return this.rooms.get(roomId);
        } catch (err) {
            this.logError("getRoom", err);
        }
    }

    deleteRoom = (roomId) => {
        try {
            this.rooms.delete(roomId);
            this.log("Deleted room:", roomId)
        } catch (err) {
            this.logError("deleteRoom", err);
        }
    }

    emitToUser = (socket, userId, event, ...payload) => {
        try {
            const user = this.getUser(userId);
            if (user) user.traverseSockets((_, sid) => {
                this.log("Receiver", sid, event);
                socket.to(sid).emit(event, ...payload)
            });
            this.log("Emitted:", event, " | ", socket.id, " | ", userId);
        } catch (err) {
            this.logError("emitToUser", err);
        }
    }

    checkBusy = (userId) => {
        try {
            let _user = this.getUser(userId);
            if (_user) {
                if (!_user.inCall) return false;
                if (!_user.lastKeptaliveTimestamp) return false;
                if (Date.now() - _user.lastKeptaliveTimestamp > Constants.CALL_TIMEOUT_VALUE) return false;
                return true;
            }
            return false;
        } catch (err) {
            this.logError("checkBusy", err);
        }
    }
    
    sendCallNotification = async (sendTo, payload) => {
        try {
            this.log("Send notification to: ", sendTo);
            if (payload.calleeAvatar.toString().length > 300) payload.calleeAvatar = "";
            if (payload.callerAvatar.toString().length > 300) payload.callerAvatar = "";
            let res = await axios.post("http://43.239.223.157:8000/api/V2/Notification/SendCallNotification", {
                sendTo: [sendTo],
                payload: payload
            })
            this.log(res.data);
        } catch (err) {
            this.logError("checkBusy", err);
        }
    }
    cancelCallNotification = async (sendTo) => {
        try {
            this.log("Cancel notification: ", sendTo);
            let res = await axios.post("http://43.239.223.157:8000/api/V2/Notification/CancelCallNotification", {
                sendTo: [sendTo]
            })
            this.log(res.data);
        } catch (err) {
            this.logError("cancelCallNotification", err);
        }
    }

    sendMissedCallMessage = async (sendFrom, sendTo, callType) => {
        try {
            this.log("Send missed call message:", sendFrom, sendTo, callType);
            let convId = await this.getConversationId(sendFrom, sendTo);
            if (convId == -1) return;
            let _callTypeMessage = callType == 1? "Cuộc gọi video nhỡ": "Cuộc gọi thoại nhỡ";
            let res = await axios({
                method: "post",
                url: "http://210.245.108.202:9000/api/message/SendMessage",
                data: {
                  MessageID: '',
                  ConversationID: convId,
                  SenderID: Number(sendFrom),
                  MessageType: "missVideoCall",
                  Message: _callTypeMessage,
                  Emotion: 1,
                  Quote: "",
                  Profile: "",
                  ListTag: "",
                  File: "",
                  ListMember: "",
                  IsOnline: [],
                  IsGroup: 0,
                  ConversationName: '',
                  DeleteTime: 0,
                  DeleteType: 0,
                },
                headers: { "Content-Type": "multipart/form-data" }
            });
            this.log(res.data);
        } catch (err) {
            this.logError("sendMissedCallMessage", err);
        }
    }

    sendCallEndedMessage = async (sendFrom, sendTo, duration, callType) => {
        this.log("Send call ended message:", sendFrom, sendTo, duration, callType);

        let _callTypeMessage = callType == 1? "Cuộc gọi video": "Cuộc gọi thoại";
        let convId = await this.getConversationId(sendFrom, sendTo);
        if (convId == -1) return;
        let res = await axios({
            method: "post",
            url: "http://210.245.108.202:9000/api/message/SendMessage",
            data: {
              MessageID: '',
              ConversationID: convId,
              SenderID: Number(sendFrom),
              MessageType: "mettingVideoCall",
              Message: `${_callTypeMessage}: ${millisecondToTime(duration)}`,
              Emotion: 1,
              Quote: "",
              Profile: "",
              ListTag: "",
              File: "",
              ListMember: "",
              IsOnline: [],
              IsGroup: 0,
              ConversationName: '',
              DeleteTime: 0,
              DeleteType: 0,
            },
            headers: { "Content-Type": "multipart/form-data" }
        });
        this.log(res.data);
    }

    getConversationId = async (userId, contactId) => {
        let res = await axios({
            method: "post",
            url: "http://43.239.223.142:9000/api/conversations/CreateNewConversation",
            data: {
            userId:Number(userId),
            contactId:Number(contactId),
            },
            headers: { "Content-Type": "multipart/form-data" }
        });
        if (res.data.data&&res.data.data.conversationId) {
            return res.data.data.conversationId;
        }
        return -1;
    }

    rejectCallEndpoint = async (req, res) => {
        try {
            const { payload } = req.body;
            if (!payload||!payload.calleeId||!payload.calleeId) return res.status(400).json({msg: "Thiếu dữ liệu truyền lên!"});
            
            const _callee = this.getUser(payload.calleeId);
            const _caller = this.getUser(payload.callerId);
            if (!_callee||!_caller) return res.status(400).json({msg: "Không có người dùng này!"});

            if (!_callee.inCall) return res.status(400).json({msg: "Không tồn tại cuộc gọi!"});

            let _payload = new CallPayload(payload);
            let roomId = _payload.roomId;
            this.sendMissedCallMessage(_payload.callerId, _payload.calleeId, _payload.callType);
            const _room = this.getRoom(roomId)
            if (_room) _room.onCallRejected(_payload.callerId);
            _callee.resetCallInfo();

            this.log("Reject call:", _payload.calleeId, _payload.callerId);
            return res.status(200).json({msg: "Từ chối cuộc gọi thành công"});
        } catch (err) {
            this.logError("rejectCallEndpoint", err);
            return res.status(500).json({msg: "Internal server error"});
        }
    }

    resendCallNotificationEndpoint = async (req, res) => {
        try {
            const {sendTo, payload} = req.body;
            if (!sendTo || !payload) return res.status(400).json({msg: "Thiếu dữ liệu truyền lên!"});
            await this.sendCallNotification(sendTo, payload);
            this.log("Resend call noti: ", sendTo);
            return res.status(200).json({msg: "Gửi thông báo thành công"});
        } catch (err) {
            this.logError("resendCallNotificationEndpoint", err);
            return res.status(500).json({msg: "Internal server error"});
        }
    }

    confirmNotificationEndpoint = async (req, res) => {
        try {
            const {callerId} = req.body;
            if (!callerId) return res.status(400).json({msg: "Thiếu dữ liệu truyền lên!"});
            const _user = this.getUser(callerId);
            if (!_user) return res.status(400).json({msg: "Không có người dùng này!"});
            _user.confirmNotificationReceived();
            return res.status(200).json({msg: "Thành công"});
        } catch (err) {
            this.logError("confirmNotificationEndpoint", err);
            return res.status(500).json({msg: "Internal server error"});
        }
    }

    getServiceStatusEndpoint = async (req, res) => {
        try {
            return res.status(200).json({
                sfuAvailable: !this.sfu.isOverloaded,
                sfuLoad: this.sfu.activeConsumers + "/" + this.sfu.consumerLimit
            });
        } catch (err) {
            this.logError("getServiceStatusEndpoint", err);
            return res.status(500).json({msg: "Internal server error"});
        }
    }
}

const _callServerInstance = new CallServer();

try {if (exports) exports.getInstance = () => _callServerInstance;} catch (err) {}