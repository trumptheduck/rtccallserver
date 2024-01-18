const CallUser = require("./CallUser");

class CallCenter {
    static instance = null;
    static getInstance() {
        if (!this.instance) this.instance = new CallCenter();
        return this.instance;
    }
    constructor(io) {
        if (this.instance) throw Error("Can't create more than one instance of CallCenter");
        this.clients = new Map();
    }

    createClient() {
        const clientId = "client_" + Date.now();
        const user = new CallUser()
    }

}