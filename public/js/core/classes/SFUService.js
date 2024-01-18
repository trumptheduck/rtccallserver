const mediasoup = require("mediasoup");
const config = require("../../common/constants/SFUConfig")

class SFUService {
    static instance = null;
    static getInstance() {
        if (!this.instance) this.instance = new SFUService();
        return this.instance;
    }
    constructor() {
        if (this.instance) throw Error("Can't create more than one instance of SFUProvider");
        this.worker = null;
        this.worker = null;
        this.router = null;
        this.router = null;
        this.consumers = new Map();
        this.isReady = false;
    }

    log(...args) {
        console.log(`[SFU]`, ...args);
    }

    logError(...args) {
        console.log(`[SFU ERROR]`, ...args)
    }

    get activeConsumers() {
        return this.consumers.size;
    };

    get isOverloaded() {
        return this.activeConsumers >= config.consumersLimit;
    }

    get consumerLimit() {
        return config.consumersLimit
    }

    init = async () => {
        await this.initializeMediasoupWorker();
    }

    initializeMediasoupWorker = async () => {
        try {
            this.worker = await mediasoup.createWorker({
                logLevel: config.worker.logLevel,
                logTags: config.worker.logTags,
                rtcMinPort: config.worker.rtcMinPort,
                rtcMaxPort: config.worker.rtcMaxPort,
            });
    
            this.log("Created worker", this.worker.pid);
    
            this.worker.on('died', () => {
                this.logError(`Worker [${this.worker.pid}] died, attempt to create another`)
                this.initializeMediasoupWorker();
            });
            
            const mediaCodecs = config.router.mediaCodecs;
            this.router = await this.worker.createRouter({ mediaCodecs });
            this.isReady = true;
        } catch (err) {
            this.logError("initializeMediasoupWorker", err);
        }
    }

    createWebRtcTransport = async () => {
        try {
            const {
                maxIncomingBitrate,
                initialAvailableOutgoingBitrate
            } = config.webRtcTransport;
            
            const _transport = await this.router.createWebRtcTransport({
                listenIps: config.webRtcTransport.listenIps,
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
                initialAvailableOutgoingBitrate,
            });
            if (maxIncomingBitrate) {
                try {
                    await _transport.setMaxIncomingBitrate(maxIncomingBitrate);
                } catch (error) {
                }
            }
            return {
                transport: _transport,
                params: {
                    id: _transport.id,
                    iceParameters: _transport.iceParameters,
                    iceCandidates: _transport.iceCandidates,
                    dtlsParameters: _transport.dtlsParameters
                },
            };
        } catch (err) {
            this.logError("createWebRtcTransport", err);
        }
    }

    createConsumer = async (userId, producer, transport, rtpCapabilities) => {
        try {
            let _consumer;
            if (!this.router.canConsume({
                producerId: producer.id,
                rtpCapabilities,
            })) {
                console.error('can not consume');
                return;
            }
            try {
              _consumer = await transport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true,
              });
            } catch (error) {
              console.error('consume failed', error);
              return;
            }
          
            if (_consumer.type === 'simulcast') {
              await _consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
            }
            this.consumers.set(_consumer.id, {userId, consumer:_consumer});
            return {
                params: {
                    producerId: producer.id,
                    id: _consumer.id,
                    kind: _consumer.kind,
                    rtpParameters: _consumer.rtpParameters,
                    type: _consumer.type,
                    producerPaused: _consumer.producerPaused
                },
                consumer: _consumer
            };
        } catch (err) {
            this.logError("createConsumer", err);
        }
    }

    removeConsumer(consumerId) {
        this.consumers.delete(consumerId);
    }
    removeConsumerByUserId(userId) {
        let keys = [];
        this.consumers.forEach((v, k)=>{
            if (v.userId == userId) {
                keys.push(k);
            }
        });
        keys.forEach(k => this.removeConsumer(k));
    }

    produceAudioStream = async (data) => {
        const streamTransport = await this.router.createPlainRtpTransport({
          listenIp: '127.0.0.1',
          rtcpMux: true,
          comedia: true,
        });
      
        const producer = await streamTransport.produce({
          kind: 'audio',
          rtpParameters: {
            codecs: [{
              mimeType: 'audio/opus',
              clockRate: 48000,
              payloadType: 101,
              channels: 2,
              parameters: { 'sprop-stereo': 1 },
              rtcpFeedback: [
                { type: 'transport-cc' },
              ],
            }],
            encodings: [{ ssrc: 11111111 }],
          },
          appData: {},
          paused: true
        });

        new FFmpeg({
          kind: 'audio',
          port: streamTransport.tuple.localPort,
          filename: 'video.mp4',
        });
      
        return producer;
      };
}

const _sfuServiceInstance = new SFUService();

try {if (exports) exports.getInstance = () => _sfuServiceInstance;} catch (err) {}