class CallEventListener {
    constructor() {
        this.listeners = [];
    }

    addListener = (callback) => {
        this.listeners.push(callback);
    }

    removeListener = (callback) => {
        let _index = this.listeners.indexOf(callback);
        if (_index) this.listeners.splice(_index, 1);
    } 

    invoke(state) {
        this.listeners.forEach(callback => callback(state));
    }
    
}

try {if (module) module.exports = CallEventListener} catch (err) {}