// Class to handle child process used for running FFmpeg

const childProcess = require('child_process');
const Streamer = require('./Streamer');

module.exports = class FFmpeg extends Streamer {
  constructor(options) {
    super(options);

    this.time = options.time || '00:00:00.0'; // https://ffmpeg.org/ffmpeg-utils.html#time-duration-syntax
    this.createProcess();
    this.initListeners();
  }

  createProcess() {
    this.process = childProcess.spawn('ffmpeg', this.getArgs(this.kind, this.port, this.filename, this.time));
  }

  getArgs(kind, port, filename, time) {
    const map = (kind === 'video') ? '0:v:0' : '0:a:0';
    return [
      '-loglevel',
      'debug',
      '-re',
      '-v',
      'info',
      '-ss',
      time,
      '-i',
      filename,
      '-map',
      map,
      '-f',
      'tee',
      '-acodec',
      'libopus',
      '-ab',
      '128k',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libvpx',
      '-b:v',
      '1000k',
      '-deadline',
      'realtime',
      '-cpu-used', // https://www.webmproject.org/docs/encoder-parameters/
      '2',
      // `[select=v:f=rtp:ssrc=22222222:payload_type=102]rtp://127.0.0.1:${port}`,
      `[select=a:f=rtp:ssrc=11111111:payload_type=101]rtp://127.0.0.1:${port}`,
    ];
  }
};