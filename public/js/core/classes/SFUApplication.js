class SFUApplication {
    constructor() {
        this.device = null;
        this.onDeviceReady = () => {}
    }

    

    loadDevice = async (routerRtpCapabilities) => {
        try {
          this.device = new mediasoup.Device();
          await this.device.load({ routerRtpCapabilities });
          this.onDeviceReady(this.device)
        } catch (err) {
          console.log(err);
        }
    }

    createSendTransport(params) {
      return this.device.createSendTransport(params);
    }

    createRecvTransport(params) {
      return this.device.createRecvTransport(params);
    }

    publish = async (transport, stream) => {  
      const track = stream.getVideoTracks()[0];
      const params = { track };
      params.encodings = [
        { maxBitrate: 100000 },
        { maxBitrate: 300000 },
        { maxBitrate: 900000 },
      ];
      params.codecOptions = {
        videoGoogleStartBitrate : 1000
      };
      return await transport.produce(params);
    }
      
    getUserMedia = async () => {
      if (!device.canProduce('video')) {
        console.error('cannot produce video');
        return;
      }
      return await navigator.mediaDevices.getUserMedia({ video: true });
    }
      
    subscribe = async (transport, params) => {
      const {
        producerId,
        id,
        kind,
        rtpParameters,
      } = params;

      let codecOptions = {};
      const consumer = await transport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
        codecOptions,
      });
      const stream = new MediaStream();
      stream.addTrack(consumer.track);
      return stream;
    }
}