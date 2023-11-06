const CallElements = {
    localVideo: "callclient__local_video_stream",
    remoteVideo: "callclient__remote_video_stream",
    buttonAcceptCall: "callclient__button_accept_call",
    buttonRejectCall: "callclient__button_reject_call",
    buttonEndCall: "callclient__button_end_call",
    buttonStartCall: "callclient__button_start_call",
    buttonToggleMic: "callclient__button_toggle_mic",
    buttonToggleCamera: "callclient__button_toggle_camera",
    popupIncomingCall: "callclient__popup_incoming_call",
    popupBusyCall: "callclient__popup_busy_call",
    popupOngoingCall: "callclient__popup_ongoing_call",
}

try {if (module) module.exports = CallElements;} catch (err) {}