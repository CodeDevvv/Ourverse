document.addEventListener("DOMContentLoaded", () => {
  const socket = io("/");
  const videoGrid = document.getElementById("video-grid");
  const roomIdInput = document.getElementById("secure-room-id");
  const ROOM_ID = roomIdInput ? roomIdInput.value : null;

  if (!ROOM_ID) {
    window.location.href = "about:blank";
    return;
  }

  const myVideo = document.createElement("video");
  myVideo.muted = true;
  myVideo.classList.add("local-video");
  myVideo.setAttribute('playsinline', '');

  let myVideoStream;
  let peer;
  let myPeerId = null;
  let SESSION_KEY = null;
  let peers = {};
  let localVideoEl = myVideo;
  let remoteVideoEl = null;

  const securityModal = document.getElementById("securityModal");
  const secretPassInput = document.getElementById("secretPassInput");
  const setSecretBtn = document.getElementById("setSecretBtn");
  const startModal = document.getElementById("startModal");

  secretPassInput.focus();

  secretPassInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setSecretBtn.click();
  });

  setSecretBtn.addEventListener("click", () => {
    const val = secretPassInput.value;
    if (!val) return;
    SESSION_KEY = val;
    const authHash = CryptoJS.SHA256(val).toString(CryptoJS.enc.Hex);
    socket.emit("join-request", ROOM_ID, authHash);
  });

  socket.on("auth-failed", () => {
    killEverything();
  });

  socket.on("room-full", () => {
    window.location.href = "about:blank";
  });

  socket.on("auth-success", (serverTurnConfig) => {
    securityModal.style.display = "none";
    startModal.style.display = "flex";
    initializePeer(serverTurnConfig);
  });

  function initializePeer(turnConfig) {
    if (peer) return;
    
    // Toggle these comments for Localhost vs Production
    // const isProduction = false; 
    const isProduction = true;

    if (isProduction) {
      peer = new Peer(undefined, {
        path: '/peerjs',
        host: '/',
        port: 443,
        secure: true,
        config: turnConfig,
        debug: 0
      });
    } else {
      peer = new Peer(undefined, {
        path: '/peerjs',
        host: '/',
        port: 3030,
        secure: false,
        debug: 0
      });
    }

    peer.on("open", (id) => {
      myPeerId = id;
    });

    peer.on("call", (call) => {
      if(myVideoStream) {
         answerCall(call);
      } else {
         navigator.mediaDevices.getUserMedia({ audio: true, video: true })
         .then((stream) => {
            myVideoStream = stream;
            addLocalVideo(stream);
            answerCall(call);
         }).catch(() => killEverything());
      }
    });
  }

  function answerCall(call) {
    call.answer(myVideoStream);
    const video = document.createElement("video");
    video.setAttribute('playsinline', '');
    call.on("stream", (userVideoStream) => {
      handleRemoteStream(video, userVideoStream, call.peer);
    });
    call.on("close", () => {
      removeRemoteVideo();
    });
    peers[call.peer] = { call, video };
  }

  document.getElementById("startCallButton").addEventListener("click", () => {
    startModal.style.display = "none";
    if (myVideoStream) {
       notifyReady();
       return;
    }
    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    }).then((stream) => {
      myVideoStream = stream;
      addLocalVideo(stream);
      notifyReady();
    }).catch(() => {
      alert("Hardware access denied.");
    });
  });

  function addLocalVideo(stream) {
      localVideoEl.srcObject = stream;
      localVideoEl.addEventListener("loadedmetadata", () => {
        localVideoEl.play();
      });
      if(!document.contains(localVideoEl)) videoGrid.append(localVideoEl);
      updateLayout();
  }

  function notifyReady() {
     if(peer && myPeerId) {
        socket.emit("peer-ready", ROOM_ID, myPeerId);
     } else {
        setTimeout(notifyReady, 500);
     }
  }

  socket.on("user-connected", (userId) => {
    connectToNewUser(userId, myVideoStream);
  });

  const connectToNewUser = (userId, stream) => {
    setTimeout(() => {
        const call = peer.call(userId, stream);
        const video = document.createElement("video");
        video.setAttribute('playsinline', '');
        call.on("stream", (userVideoStream) => {
          handleRemoteStream(video, userVideoStream, userId);
        });
        call.on("close", () => {
          removeRemoteVideo();
        });
        peers[userId] = { call, video };
    }, 1000);
  };

  function handleRemoteStream(videoEl, stream, userId) {
    if (remoteVideoEl) {
      remoteVideoEl.srcObject = null;
      remoteVideoEl.remove();
    }
    remoteVideoEl = videoEl;
    remoteVideoEl.srcObject = stream;
    remoteVideoEl.setAttribute("id", userId);
    remoteVideoEl.classList.add("remote-video");
    remoteVideoEl.addEventListener("loadedmetadata", () => {
      remoteVideoEl.play();
    });
    videoGrid.append(remoteVideoEl);
    updateLayout();
  }

  function removeRemoteVideo() {
    if (remoteVideoEl) {
      remoteVideoEl.srcObject = null;
      remoteVideoEl.remove();
      remoteVideoEl = null;
    }
    updateLayout();
  }

  socket.on("user-disconnected", () => {
    for (let key in peers) {
        if (peers[key].call) peers[key].call.close();
    }
    peers = {};
    removeRemoteVideo();
  });

  function updateLayout() {
    if (!remoteVideoEl) {
      localVideoEl.className = "full-screen-video";
      localVideoEl.style.zIndex = "1";
      localVideoEl.onclick = null;
    }
    else {
      localVideoEl.className = "floating-video";
      localVideoEl.style.zIndex = "100";
      remoteVideoEl.className = "full-screen-video";
      remoteVideoEl.style.zIndex = "1";
      localVideoEl.onclick = swapViews;
      remoteVideoEl.onclick = swapViews;
    }
  }

  function swapViews() {
    if (!localVideoEl || !remoteVideoEl) return;
    if (localVideoEl.classList.contains("floating-video")) {
      localVideoEl.className = "full-screen-video";
      localVideoEl.style.zIndex = "1";
      remoteVideoEl.className = "floating-video";
      remoteVideoEl.style.zIndex = "100";
    } else {
      localVideoEl.className = "floating-video";
      localVideoEl.style.zIndex = "100";
      remoteVideoEl.className = "full-screen-video";
      remoteVideoEl.style.zIndex = "1";
    }
  }

  function killEverything() {
    if (myVideoStream) {
      myVideoStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
    }
    if (socket) {
      socket.emit("manual-leave");
      socket.disconnect();
    }
    if (peer) peer.destroy();
    window.location.href = "about:blank";
  }

  document.getElementById("disconnect").addEventListener("click", () => {
    killEverything();
  });

  window.addEventListener("popstate", killEverything);
  window.addEventListener("beforeunload", () => {
    if (socket) socket.emit("manual-leave");
  });

  const shareScreenBtn = document.getElementById("shareScreen");
  let isSharing = false;
  let screenStream;

  const inviteModal = document.getElementById("inviteModal");
  const inviteInput = document.getElementById("inviteUrl");
  const copyBtn = document.getElementById("copyBtn");
  const closeInvite = document.getElementById("closeInvite");

  document.getElementById("inviteButton").addEventListener("click", () => {
    inviteModal.style.display = "flex";
    inviteInput.value = window.location.href;
    copyBtn.innerHTML = '📝';
  });

  copyBtn.addEventListener("click", () => {
    inviteInput.select();
    inviteInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(inviteInput.value).then(() => {
      copyBtn.innerHTML = '✅';
    });
  });

  closeInvite.addEventListener("click", () => { inviteModal.style.display = "none"; });
  document.getElementById("closeInviteX").addEventListener("click", () => { inviteModal.style.display = "none"; });
  window.addEventListener("click", (e) => { if (e.target == inviteModal) inviteModal.style.display = "none"; });

  document.getElementById("muteButton").addEventListener("click", () => {
    if (!myVideoStream) return;
    const audioTrack = myVideoStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const btn = document.getElementById("muteButton");
      btn.classList.toggle("off", !audioTrack.enabled);
      btn.innerHTML = audioTrack.enabled ? `🎤` : `🔇`;
    }
  });

  document.getElementById("stopVideo").addEventListener("click", () => {
    if (!myVideoStream) return;
    const videoTrack = myVideoStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const btn = document.getElementById("stopVideo");
      btn.classList.toggle("off", !videoTrack.enabled);
      btn.innerHTML = videoTrack.enabled ? `🎥` : `❌`;
    }
  });

  const chatWindow = document.getElementById("chatWindow");
  const chatToggleBtn = document.getElementById("toggleChat");
  const container = document.getElementById('emojiPickerContainer');
  const mainChatWindow = document.getElementById("mainChatWindow");

  chatToggleBtn.addEventListener("click", () => {
    const isHidden = chatWindow.style.display === "none";
    if (isHidden) {
      chatWindow.style.display = "flex";
      chatToggleBtn.classList.add("chat-active");
      chatToggleBtn.classList.remove("has-new-msg");
      document.body.classList.add("chat-open");
      document.getElementById("chat_message").focus();
      setTimeout(() => {
        mainChatWindow.scrollTop = mainChatWindow.scrollHeight;
      }, 50);
    } else {
      chatWindow.style.display = "none";
      chatToggleBtn.classList.remove("chat-active");
      document.body.classList.remove("chat-open");
      container.style.display = "none";
    }
  });

  document.getElementById("closeChat").addEventListener("click", () => {
    chatWindow.style.display = "none";
    chatToggleBtn.classList.remove("chat-active");
    document.body.classList.remove("chat-open");
  });

  shareScreenBtn.addEventListener("click", async () => {
    if (!isSharing) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: true
        });
        const screenVideoTrack = screenStream.getVideoTracks()[0];
        for (let key in peers) {
          const sender = peers[key].call.peerConnection.getSenders().find((s) => s.track.kind === "video");
          if (sender) sender.replaceTrack(screenVideoTrack);
        }
        localVideoEl.srcObject = screenStream;
        localVideoEl.classList.add("screen-share-mode");
        isSharing = true;
        shareScreenBtn.classList.add("sharing");
        shareScreenBtn.innerHTML = `🛑`;
        screenVideoTrack.onended = () => { stopScreenSharing(); };
      } catch (err) { }
    } else {
      stopScreenSharing();
    }
  });

  function stopScreenSharing() {
    if (screenStream) screenStream.getTracks().forEach((track) => track.stop());
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((newStream) => {
        const oldAudioTrack = myVideoStream.getAudioTracks()[0];
        if (oldAudioTrack && !oldAudioTrack.enabled) {
          newStream.getAudioTracks()[0].enabled = false;
        }
        myVideoStream = newStream;
        const newVideoTrack = newStream.getVideoTracks()[0];
        for (let key in peers) {
            const sender = peers[key].call.peerConnection.getSenders().find((s) => s.track.kind === "video");
            if (sender) sender.replaceTrack(newVideoTrack);
        }
        localVideoEl.srcObject = newStream;
        localVideoEl.classList.remove("screen-share-mode");
        isSharing = false;
        shareScreenBtn.classList.remove("sharing");
        shareScreenBtn.innerHTML = `💻`;
    });
  }

  const textInput = document.getElementById("chat_message");
  const sendBtn = document.getElementById("sendMsgBtn");

  const sendMessage = () => {
    const msg = textInput.value;
    if (msg.length !== 0 && SESSION_KEY) {
      try {
        const encryptedMsg = CryptoJS.AES.encrypt(msg, SESSION_KEY).toString();
        socket.emit("message", encryptedMsg, ROOM_ID, myPeerId);
        textInput.value = "";
      } catch (err) { }
    }
  };

  textInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
  sendBtn.addEventListener("click", sendMessage);

  socket.on("createMessage", (encryptedMsg, senderId) => {
    if (!SESSION_KEY) return;
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedMsg, SESSION_KEY);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      const messagesUl = document.getElementById("allMessages");
      const li = document.createElement("li");
      li.classList.add("message");
      const isMe = senderId === myPeerId;
      if (isMe) li.classList.add("self-message");
      if (originalText) {
        const boldName = document.createElement("b");
        boldName.textContent = isMe ? "You" : "Her";
        const spanMsg = document.createElement("span");
        spanMsg.textContent = originalText;
        li.appendChild(boldName);
        li.appendChild(spanMsg);
      }
      messagesUl.append(li);
      if (originalText) {
        mainChatWindow.scrollTop = mainChatWindow.scrollHeight;
        const isChatOpen = document.body.classList.contains("chat-open");
        if (!isChatOpen) chatToggleBtn.classList.add("has-new-msg");
      }
    } catch (e) { }
  });

  Promise.all([
    fetch('/libs/data.json').then(res => res.json()),
    fetch('/libs/messages.json').then(res => res.json())
  ]).then(([emojiData, messagesData]) => {
    const picker = picmo.createPicker({ 
        rootElement: container,
        data: emojiData,
        messages: messagesData
    });
    picker.addEventListener('emoji:select', (selection) => {
        textInput.value += selection.emoji;
        container.style.display = 'none';
        textInput.focus();
    });
  }).catch(() => {});

  document.getElementById("emojiBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = container.style.display === "block";
    container.style.display = isVisible ? "none" : "block";
  });
  window.addEventListener("click", (e) => {
    if (!document.getElementById("emojiBtn").contains(e.target) && !container.contains(e.target)) {
      container.style.display = "none";
    }
  });
});