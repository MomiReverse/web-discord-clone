import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import styled from 'styled-components';

const VideoContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
    padding: 20px;
    height: calc(100vh - 80px);
    background-color: #36393f;
`;

const Video = styled.video`
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 10px;
    transform: scaleX(-1); /* Зеркальное отображение для своего видео */
`;

const ControlsContainer = styled.div`
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 80px;
    background-color: #2f3136;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
`;

const ControlButton = styled.button`
    padding: 10px 20px;
    font-size: 16px;
    border-radius: 5px;
    border: none;
    background-color: ${props => (props.active ? '#d94343' : '#7289da')};
    color: white;
    cursor: pointer;
`;


const Room = () => {
    const { roomId } = useParams();
    const [peers, setPeers] = useState([]);
    const [stream, setStream] = useState();
    const [isMuted, setIsMuted] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const socketRef = useRef();
    const userVideoRef = useRef();
    const peersRef = useRef([]);

    useEffect(() => {
        // Укажите здесь IP вашего сервера
        socketRef.current = io.connect("http://185.105.90.84:5000");

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(currentStream => {
                setStream(currentStream);
                if (userVideoRef.current) {
                    userVideoRef.current.srcObject = currentStream;
                }

                socketRef.current.emit("join-room", roomId);

                socketRef.current.on("all-users", users => {
                    const peers = [];
                    users.forEach(userID => {
                        const peer = createPeer(userID, socketRef.current.id, currentStream);
                        peersRef.current.push({
                            peerID: userID,
                            peer,
                        });
                        peers.push({ peerID: userID, peer });
                    });
                    setPeers(peers);
                });

                socketRef.current.on("user-joined", payload => {
                    const peer = addPeer(payload.signal, payload.callerID, currentStream);
                    peersRef.current.push({
                        peerID: payload.callerID,
                        peer,
                    });
                    setPeers(userPeers => [...userPeers, { peerID: payload.callerID, peer }]);
                });

                socketRef.current.on("receiving-returned-signal", payload => {
                    const item = peersRef.current.find(p => p.peerID === payload.id);
                    item.peer.signal(payload.signal);
                });

                socketRef.current.on("user-left", id => {
                    const peerObj = peersRef.current.find(p => p.peerID === id);
                    if(peerObj) {
                        peerObj.peer.destroy();
                    }
                    const newPeers = peersRef.current.filter(p => p.peerID !== id);
                    peersRef.current = newPeers;
                    setPeers(newPeers);
                });
            });

        return () => {
            socketRef.current.disconnect();
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [roomId]);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("sending-signal", { userToSignal, callerID, signal });
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("returning-signal", { signal, callerID });
        });

        peer.signal(incomingSignal);
        return peer;
    }
    
    const toggleMute = () => {
        if (stream) {
            stream.getAudioTracks()[0].enabled = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const toggleScreenSharing = () => {
        if (!isScreenSharing) {
            navigator.mediaDevices.getDisplayMedia({ cursor: true })
                .then(screenStream => {
                    replaceStream(screenStream);
                    setIsScreenSharing(true);
                    // Когда пользователь останавливает демонстрацию через нативную кнопку браузера
                    screenStream.getTracks()[0].onended = () => {
                        replaceStream(stream); // Возвращаем видео с камеры
                        setIsScreenSharing(false);
                    };
                });
        } else {
            replaceStream(stream); // Возвращаем видео с камеры
            setIsScreenSharing(false);
        }
    };

    // Функция для замены потока (камера <-> демонстрация экрана)
    const replaceStream = (newStream) => {
        if (userVideoRef.current) {
            userVideoRef.current.srcObject = newStream;
        }
        // Заменяем трек в каждом peer-соединении
        peersRef.current.forEach(({ peer }) => {
            // peer.removeStream(stream); // Устарело в некоторых версиях
            // peer.addStream(newStream);
            const videoTrack = newStream.getVideoTracks()[0];
            const sender = peer.streams[0].getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        });
    };


    return (
        <div>
            <VideoContainer>
                <Video muted ref={userVideoRef} autoPlay playsInline />
                {peers.map((peerItem) => {
                    return <PeerVideo key={peerItem.peerID} peer={peerItem.peer} />;
                })}
            </VideoContainer>
            <ControlsContainer>
                <ControlButton onClick={toggleMute} active={isMuted}>
                    {isMuted ? 'Unmute' : 'Mute'}
                </ControlButton>
                <ControlButton onClick={toggleScreenSharing} active={isScreenSharing}>
                    {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
                </ControlButton>
            </ControlsContainer>
        </div>
    );
};

// Отдельный компонент для видео другого пользователя
const PeerVideo = ({ peer }) => {
    const ref = useRef();

    useEffect(() => {
        peer.on("stream", stream => {
            ref.current.srcObject = stream;
        });
    }, [peer]);

    return <Video playsInline autoPlay ref={ref} />;
};

export default Room;