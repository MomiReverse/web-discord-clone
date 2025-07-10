const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new socketIo.Server(server, {
    cors: {
        origin: "*", // В продакшене лучше указать конкретный домен вашего фронтенда
        methods: ["GET", "POST"]
    }
});

// Это будет хранить информацию о комнатах и пользователях в них
// В реальном приложении это лучше хранить в Redis или другой быстрой БД
const rooms = {};

io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on("join-room", (roomId) => {
        // Находим пользователей, которые уже есть в комнате
        const usersInThisRoom = rooms[roomId] ? rooms[roomId].filter(id => id !== socket.id) : [];
        
        // Добавляем нового пользователя
        if (rooms[roomId]) {
            if(!rooms[roomId].includes(socket.id)) {
               rooms[roomId].push(socket.id);
            }
        } else {
            rooms[roomId] = [socket.id];
        }
        
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);

        // Отправляем новому пользователю список всех остальных участников
        socket.emit("all-users", usersInThisRoom);
        console.log(`Sent "all-users" to ${socket.id} with data:`, usersInThisRoom);
    });

    // Этот ивент пересылает WebRTC "offer" от нового участника к существующим
    socket.on("sending-signal", (payload) => {
        console.log(`Signal from ${payload.callerID} to ${payload.userToSignal}`);
        io.to(payload.userToSignal).emit("user-joined", {
            signal: payload.signal,
            callerID: payload.callerID,
        });
    });

    // Этот ивент пересылает WebRTC "answer" от существующего участника обратно к новому
    socket.on("returning-signal", (payload) => {
        console.log(`Returning signal from ${socket.id} to ${payload.callerID}`);
        io.to(payload.callerID).emit("receiving-returned-signal", {
            signal: payload.signal,
            id: socket.id,
        });
    });

    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Находим комнату, в которой был пользователь, и удаляем его
        let roomIdToRemove = null;
        for (const roomId in rooms) {
            const users = rooms[roomId];
            const index = users.indexOf(socket.id);
            if (index !== -1) {
                users.splice(index, 1);
                roomIdToRemove = roomId;
                // Если комната пуста, можно ее удалить
                if (users.length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
        // Уведомляем остальных в комнате, что пользователь вышел
        if(roomIdToRemove) {
            socket.to(roomIdToRemove).emit("user-left", socket.id);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));