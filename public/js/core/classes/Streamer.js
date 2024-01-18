const { EventEmitter } = require('events');

/**
 * Streams audio/video file
 */
class Streamer {
  constructor(options = {}) {
    this.kind = options.kind;
    this.port = options.port;
    this.rtpPort = options.rtpPort;
    this.rtcpPort = options.rtcpPort;
    this.filename = options.filename;

    this.process = null;
    this.observer = new EventEmitter();
  }

  initListeners() {
    if (this.process.stderr) {
      this.process.stderr.setEncoding('utf-8');
      this.process.stderr.on('data', this.onData.bind(this));
    }

    if (this.process.stdout) {
      this.process.stdout.setEncoding('utf-8');
      this.process.stdout.on('data', this.onData.bind(this));
    }

    this.process.on('message', message => {
      console.log('process::message', message)
    });

    this.process.on('error', error => {
      console.error('process::error', error)
    });

    this.process.once('close', () => {
      console.log('process::close');
      this.observer.emit('close');
    });
  }

  onData(data) {
    // TODO: parse and fetch the time
    // this.observer.emit('time', time);
    console.log('process::data', data);
  }

  /**
   * Stops streaming
   */
  stop() {
    console.log('process::stop [pid:%d]', this.process.pid);
    this.process.kill('SIGINT');
  }
}

module.exports = Streamer;