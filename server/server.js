const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new socketIo.Server(server, {
    cors: {
        // ИЗМЕНЕНО: Указываем конкретный домен для безопасности
        origin: "https://zusii.ru", 
        methods: ["GET", "POST"]
    }
});

// Это будет хранить информацию о комнатах и пользователях в них
const rooms = {};

io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on("join-room", (roomId) => {
        const usersInThisRoom = rooms[roomId] ? rooms[roomId].filter(id => id !== socket.id) : [];
        
        if (rooms[roomId]) {
            if(!rooms[roomId].includes(socket.id)) {
               rooms[roomId].push(socket.id);
            }
        } else {
            rooms[roomId] = [socket.id];
        }
        
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);

        socket.emit("all-users", usersInThisRoom);
        console.log(`Sent "all-users" to ${socket.id} with data:`, usersInThisRoom);
    });

    socket.on("sending-signal", (payload) => {
        console.log(`Signal from ${payload.callerID} to ${payload.userToSignal}`);
        io.to(payload.userToSignal).emit("user-joined", {
            signal: payload.signal,
            callerID: payload.callerID,
        });
    });

    socket.on("returning-signal", (payload) => {
        console.log(`Returning signal from ${socket.id} to ${payload.callerID}`);
        io.to(payload.callerID).emit("receiving-returned-signal", {
            signal: payload.signal,
            id: socket.id,
        });
    });

    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        let roomIdToRemove = null;
        for (const roomId in rooms) {
            const users = rooms[roomId];
            const index = users.indexOf(socket.id);
            if (index !== -1) {
                users.splice(index, 1);
                roomIdToRemove = roomId;
                if (users.length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
        if(roomIdToRemove) {
            socket.to(roomIdToRemove).emit("user-left", socket.id);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));