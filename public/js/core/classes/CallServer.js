const CallUser = require("./CallUser");
const Room = require("./Room");
const SocketEvents = require("../../common/constants/SocketEvents");

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
    }

    registerEvents(socket) {
        try {
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
        } catch (err) {
            this.logError("registerEvents", err);
        }
    }

    addUser(userId, socket) {
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

    getUser(userId) {
        try {
            return this.users.get(userId);
        } catch (err) {
            this.logError("getUser", err);
        }
    }

    addSocket(userId, socket) {
        try {
            const _user = this.users.get(userId);
            if (_user) {
                _user.addSocket(socket.id);
                this.log("Add socket:", userId);
            }
        } catch (err) {
            this.logError("addSocket", err);
        }
    }

    removeUser(key) {
        try {
            this.users.delete(key);
            this.log("Remove user:", key);
        } catch (err) {
            this.logError("removeUser", err);
        }
    }

    loginHandler(socket) {
        try {
            return (userId) => {
                this.log("User logged in:", userId);
                let user = this.users.get(userId);
                if (!user) {
                    user = this.addUser(userId, socket);
                    user.onLogin(socket.id);
                } else {
                    user.addSocket(socket);
                    user.onLogin(socket.id);
                }
            }
        } catch (err) {
            this.logError("loginHandler", err);
        }     
    }

    logoutHandler(socket) {
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

    createOneOnOneCallRoom(caller, calleeId) {
        try {
            const allowedIds = new Map();
            allowedIds.set(caller.id, true);
            allowedIds.set(calleeId, true);
            const _room = new Room(caller.id, calleeId, caller, allowedIds);
            this.rooms.set(_room.id, _room);
            this.log("Created 1-1 call room for:", caller.id, " | ", calleeId, " | ROOMID:", _room.id);
            return _room;
        } catch (err) {
            this.logError("createOneOnOneCallRoom", err);
        }
    }

    getRoom(roomId) {
        try {
            return this.rooms.get(roomId);
        } catch (err) {
            this.logError("getRoom", err);
        }
    }

    deleteRoom(roomId) {
        try {
            this.rooms.delete(roomId);
            this.log("Deleted room:", roomId)
        } catch (err) {
            this.logError("deleteRoom", err);
        }
    }

    emitToUser(socket, userId, event, ...payload) {
        try {
            const user = this.users.get(userId);
            if (user) user.traverseSockets((_, sid) => {
                this.log("Receiver", sid, event);
                socket.to(sid).emit(event, ...payload)
            });
            this.log("Emitted:", event, " | ", socket.id, " | ", userId);
        } catch (err) {
            this.logError("emitToUser", err);
        }
    }

    checkBusy(userId) {
        try {
            this.log(this.users.get(userId).inCall);
            return this.users.get(userId) ? this.users.get(userId).inCall : false;
        } catch (err) {
            this.logError("checkBusy", err);
        }
    }
}

const _callServerInstance = new CallServer();

try {if (exports) exports.getInstance = () => _callServerInstance;} catch (err) {}