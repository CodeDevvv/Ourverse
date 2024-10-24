# OurVerse

## Introduction
OurVerse is a video chat application that allows users to connect and communicate in real time. It provides a user-friendly interface, enabling users to start video calls, invite others, and manage their audio and video settings easily. With the power of WebRTC and Socket.io, OurVerse ensures low-latency communication and high-quality video streaming.

## Technology Used
OurVerse is built using technologies, including:
- **Node.js**: A JavaScript runtime environment for building scalable server-side applications.
- **Express**: A web framework for Node.js, used for handling routing and server-side logic.
- **Socket.io**: A library for real-time web applications, enabling real-time bidirectional communication between clients and servers.
- **PeerJS**: A library that simplifies WebRTC connections for peer-to-peer video communication.
- **EJS**: A templating engine for rendering HTML views.
- **Nodemon**: A utility that automatically restarts the server during development.

## Steps to Run the Project

1. **Clone the repository**:
   ```bash
   git clone https://github.com/CodeDevvv/Ourverse.git
   cd OurVerse
   ```

2. **Install the dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   nodemon server.js
   ```

4. **Open your browser** and navigate to `http://localhost:3030` to access the application.

5. **Enter your name** and click on the "Start Call" button to begin a video chat.