const Constants = {
    CALL_TIMEOUT_VALUE: 30000,
    DISCONNECT_TIMEOUT_VALUE: 0,
    DISPOSE_TIMEOUT_VALUE: 120000,
    KEEPALIVE_TIMEOUT_VALUE: 5000,
    WEBRTC_PEER_CONFIGURATION: { 
        "iceServers": [{ "url": "stun:stun.1.google.com:19302" }] 
    },
    VIDEO_CONSTRAINTS: {
        audio: true,
        video: true
    },
    VOICE_CONSTRAINTS: {
        audio: true,
        video: false
    },

}

try {if (module) module.exports = Constants;} catch (err) {}