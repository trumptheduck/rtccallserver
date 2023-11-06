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

try {if (module) module.exports = CallState;} catch (err) {}