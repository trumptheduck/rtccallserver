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
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const encodings = [
        { maxBitrate: 500000 },
        { maxBitrate: 700000 },
        { maxBitrate: 900000 },
      ];
      const codecOptions = {
        videoGoogleStartBitrate : 1000
      };
      await transport.produce({track: videoTrack, encodings, codecOptions});
      await transport.produce({track: audioTrack});
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
      return consumer.track;
    }
}