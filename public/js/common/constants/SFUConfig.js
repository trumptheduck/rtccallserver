module.exports = {
    // Worker settings
    worker: {
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
        logLevel: 'warn',
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp',
            // 'rtx',
            // 'bwe',
            // 'score',
            // 'simulcast',
            // 'svc'
        ],
    },
    // Router settings
    router: {
    mediaCodecs:
        [
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
        },
        {
            kind: 'video',
            mimeType: 'video/H264',
            preferredPayloadType: 125,
            clockRate: 90000,
            parameters:
            {
                'packetization-mode': 1,
                'profile-level-id': '42e01f',
                'level-asymmetry-allowed': 1,
                'x-google-start-bitrate': 1000
            }
        }
        ]
    },
    // WebRtcTransport settings
    webRtcTransport: {
        listenIps: [
            {
            ip: '127.0.0.1',
            announcedIp: null,
            }
        ],
        maxIncomingBitrate: 1500000,
        initialAvailableOutgoingBitrate: 1000000,
    },
    consumersLimit: 500
};