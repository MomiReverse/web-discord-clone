import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const LobbyContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background-color: #36393f;
    color: white;
`;

const Input = styled.input`
    padding: 10px;
    font-size: 16px;
    margin-bottom: 20px;
    border-radius: 5px;
    border: none;
`;

const Button = styled.button`
    padding: 10px 20px;
    font-size: 16px;
    border-radius: 5px;
    border: none;
    background-color: #7289da;
    color: white;
    cursor: pointer;
    &:hover {
        background-color: #677bc4;
    }
`;

const Lobby = () => {
    const [roomId, setRoomId] = useState('');
    const navigate = useNavigate();

    const joinRoom = () => {
        if (roomId.trim() !== "") {
            navigate(`/room/${roomId}`);
        }
    };

    return (
        <LobbyContainer>
            <h1>Join a Room</h1>
            <Input
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
            />
            <Button onClick={joinRoom}>Join</Button>
        </LobbyContainer>
    );
};

export default Lobby;