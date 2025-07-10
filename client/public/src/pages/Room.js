// client/src/pages/Room.js

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'simple-peer'; // Библиотека, упрощающая работу с WebRTC
import styled from 'styled-components';

// --- Стилизация компонентов ---

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background-color: #36393f;
    color: white;
    overflow: hidden;
`;

const VideoGrid = styled.div`
    flex-grow: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 15px;
    padding: 15px;
    overflow-y: auto;
`;

const VideoWrapper = styled.div`
    background-color: #202225;
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
`;

const Video = styled.video`
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Зеркальное отображение для своего видео, чтобы было как в зеркале */
    transform: ${props => (props.isUserVideo ? 'scaleX(-1)' : 'none')};
`;

const ControlsBar = styled.div`
    flex-shrink: 0;
    width: 100%;
    height: 80px;
    background-color: #202225;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    padding: 0 20px;
    box-shadow: 0 -4px 10px rgba(0,0,0,0.2);
`;

const ControlButton = styled.button`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: none;
    font-size: 24px;
    color: white;
    cursor: pointer;
    transition: background-color 0.2s;
    
    background-color: ${props => (props.active ? '#f04747' : '#4a4d53')};

    &:hover {
        background-color: ${props => (props.active ? '#d84040' : '#5c6067')};
    }
`;


// --- Основной компонент комнаты ---

const Room = () => {
    const { roomId } = useParams(); // Получаем ID комнаты из URL

    // State-переменные для управления состоянием компонента
    const [peers, setPeers] = useState([]); // Массив с подключениями других участников
    const [userStream, setUserStream] = useState(null); // Поток с нашей камеры/микрофона
    const [isMuted, setIsMuted] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    // Refs для хранения данных, которые не должны вызывать перерисовку компонента
    const socketRef = useRef(); // Ref для хранения объекта сокета
    const userVideoRef = useRef(); // Ref для доступа к нашему <video> элементу
    const peersRef = useRef([]); // Ref для хранения массива пиров, чтобы избежать проблем с замыканиями
    const screenTrackRef = useRef(); // Ref для хранения потока демонстрации экрана

    useEffect(() => {
        // --- 1. Подключение к серверу и получение медиа-потока ---
        socketRef.current = io.connect("https://zusii.ru"); // Подключаемся к нашему домену

        navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
            .then(stream => {
                setUserStream(stream);
                if (userVideoRef.current) {
                    userVideoRef.current.srcObject = stream;
                }

                // --- 2. Присоединение к комнате ---
                socketRef.current.emit("join-room", roomId);

                // --- 3. Обработка событий от сервера ---

                // Событие "all-users": Сервер присылает список всех, кто уже в комнате
                socketRef.current.on("all-users", users => {
                    const peers = [];
                    users.forEach(userID => {
                        // Для каждого существующего юзера создаем peer-соединение
                        const peer = createPeer(userID, socketRef.current.id, stream);
                        peersRef.current.push({ peerID: userID, peer });
                        peers.push({ peerID: userID, peer });
                    });
                    setPeers(peers);
                });

                // Событие "user-joined": В комнату вошел новый участник
                socketRef.current.on("user-joined", payload => {
                    // Добавляем peer-соединение с новым участником
                    const peer = addPeer(payload.signal, payload.callerID, stream);
                    peersRef.current.push({ peerID: payload.callerID, peer });
                    setPeers(prevPeers => [...prevPeers, { peerID: payload.callerID, peer }]);
                });

                // Событие "receiving-returned-signal": Получаем ответный сигнал от тех, к кому мы подключались
                socketRef.current.on("receiving-returned-signal", payload => {
                    const item = peersRef.current.find(p => p.peerID === payload.id);
                    item.peer.signal(payload.signal);
                });

                // Событие "user-left": Кто-то покинул комнату
                socketRef.current.on("user-left", id => {
                    const peerObj = peersRef.current.find(p => p.peerID === id);
                    if (peerObj) {
                        peerObj.peer.destroy(); // Закрываем соединение
                    }
                    const newPeers = peersRef.current.filter(p => p.peerID !== id);
                    peersRef.current = newPeers;
                    setPeers(newPeers);
                });
            })
            .catch(error => {
                console.error("Error getting user media:", error);
                alert("Не удалось получить доступ к камере и микрофону.");
            });

        // --- 4. Очистка при выходе из компонента ---
        return () => {
            if (userStream) {
                userStream.getTracks().forEach(track => track.stop());
            }
            if (screenTrackRef.current) {
                screenTrackRef.current.getTracks().forEach(track => track.stop());
            }
            socketRef.current.disconnect();
        };
    }, [roomId]);

    // Функция для создания peer-соединения (когда МЫ инициируем связь)
    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true, // Мы - инициатор
            trickle: false, // Отключаем trickle ICE для простоты
            stream: stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("sending-signal", { userToSignal, callerID, signal });
        });

        return peer;
    }

    // Функция для добавления peer-соединения (когда НАМ пришел сигнал)
    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false, // Мы - не инициатор
            trickle: false,
            stream: stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("returning-signal", { signal, callerID });
        });

        peer.signal(incomingSignal); // Принимаем сигнал от другого участника
        return peer;
    }

    // Функция для замены медиа-трека (камера <-> демонстрация экрана)
    const replaceStreamTrack = (newStream) => {
        // Получаем видео-трек из нового потока
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Заменяем трек у всех существующих пиров
        for (const peerRef of peersRef.current) {
            const sender = peerRef.peer.streams[0].getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(newVideoTrack);
            }
        }

        // Обновляем видео-элемент у себя
        if (userVideoRef.current) {
            userVideoRef.current.srcObject = newStream;
        }

        // Если мы переключились на демонстрацию, следим, когда пользователь ее остановит
        if (newVideoTrack) {
            newVideoTrack.onended = () => {
                handleStopScreenShare();
            };
        }
    };
    
    // Обработчик для кнопки демонстрации экрана
    const handleToggleScreenShare = () => {
        if (isScreenSharing) {
            handleStopScreenShare();
        } else {
            navigator.mediaDevices.getDisplayMedia({ cursor: true, video: { frameRate: { ideal: 30, max: 60 } } })
                .then(screenStream => {
                    setIsScreenSharing(true);
                    screenTrackRef.current = screenStream;
                    replaceStreamTrack(screenStream);
                })
                .catch(err => console.error("Screen share error:", err));
        }
    };

    // Функция для остановки демонстрации и возврата к камере
    const handleStopScreenShare = () => {
        if (screenTrackRef.current) {
            screenTrackRef.current.getTracks().forEach(track => track.stop());
        }
        setIsScreenSharing(false);
        replaceStreamTrack(userStream); // Возвращаем поток с камеры
    };

    // Обработчик для кнопки выключения микрофона
    const handleToggleMute = () => {
        if (userStream) {
            const audioTrack = userStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    };

    return (
        <PageContainer>
            <VideoGrid>
                <VideoWrapper>
                    <Video ref={userVideoRef} muted autoPlay playsInline isUserVideo={!isScreenSharing} />
                </VideoWrapper>
                {peers.map(item => (
                    <PeerVideo key={item.peerID} peer={item.peer} />
                ))}
            </VideoGrid>
            <ControlsBar>
                <ControlButton onClick={handleToggleMute} active={isMuted} title={isMuted ? "Включить микрофон" : "Выключить микрофон"}>
                    🎤
                </ControlButton>
                <ControlButton onClick={handleToggleScreenShare} active={isScreenSharing} title={isScreenSharing ? "Остановить демонстрацию" : "Демонстрация экрана"}>
                    💻
                </ControlButton>
            </ControlsBar>
        </PageContainer>
    );
};

// Отдельный компонент для видео другого пользователя
const PeerVideo = ({ peer }) => {
    const ref = useRef();

    useEffect(() => {
        peer.on("stream", stream => {
            if (ref.current) {
                ref.current.srcObject = stream;
            }
        });
    }, [peer]);

    return (
        <VideoWrapper>
            <Video playsInline autoPlay ref={ref} />
        </VideoWrapper>
    );
};

export default Room;