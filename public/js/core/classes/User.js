class User {
    constructor(config) {
        this.userId = config.userId;
        this.userName = config.userName;
        this.userAvatar = config.userAvatar;
    }
}

try {if (module) module.exports = User} catch (err) {}