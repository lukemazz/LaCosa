// frontend/src/components/GameBoard.js
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// Assumiamo che il backend sia in esecuzione su http://localhost:5000
const socket = io('http://localhost:5000');

function GameBoard() {
  const [gameId, setGameId] = useState('');
  const [username, setUsername] = useState('');
  const [game, setGame] = useState(null);
  const [messages, setMessages] = useState([]);
  const [moveCard, setMoveCard] = useState('');

  useEffect(() => {
    socket.on('playerJoined', (data) => {
      setMessages(prev => [...prev, `${data.username} è entrato nella partita`]);
    });

    socket.on('gameStarted', (data) => {
      setGame(data.game);
      setMessages(prev => [...prev, 'La partita è iniziata!']);
    });

    socket.on('moveMade', (data) => {
      setMessages(prev => [...prev, `${data.username} ha giocato: ${data.move.cardName}`]);
      // Aggiornare lo stato di gioco se necessario
    });

    return () => {
      socket.off('playerJoined');
      socket.off('gameStarted');
      socket.off('moveMade');
    };
  }, []);

  const handleCreateGame = async () => {
    try {
      const response = await axios.post('http://localhost:5000/api/games', { name: 'Partita The Thing' });
      setGame(response.data);
      setGameId(response.data._id);
      setMessages(prev => [...prev, `Partita creata con ID: ${response.data._id}`]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoinGame = async () => {
    if (!gameId || !username) return;
    try {
      const response = await axios.post(`http://localhost:5000/api/games/${gameId}/join`, { username });
      setGame(response.data);
      socket.emit('joinGame', { gameId, username });
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartGame = () => {
    if (!gameId) return;
    socket.emit('startGame', { gameId });
  };

  const handleSendMove = () => {
    if (!gameId || !username || !moveCard) return;
    const move = { type: 'azione', cardName: moveCard };
    socket.emit('gameMove', { gameId, username, move });
    setMoveCard('');
  };

  return (
    <div>
      {!game && (
        <div>
          <button onClick={handleCreateGame}>Crea Partita</button>
          <br />
          <input
            type="text"
            placeholder="ID Partita"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Nome Utente"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={handleJoinGame}>Entra nella Partita</button>
        </div>
      )}
      {game && (
        <div>
          <h2>Partita: {game.name}</h2>
          <h3>Giocatori:</h3>
          <ul>
            {game.players.map((p, index) => (
              <li key={index}>
                {p.username} {p.role && `(Ruolo: ${p.role})`}
              </li>
            ))}
          </ul>
          <button onClick={handleStartGame}>Inizia Partita</button>
          <div>
            <h3>Fai una mossa</h3>
            <input
              type="text"
              placeholder="Nome della carta"
              value={moveCard}
              onChange={(e) => setMoveCard(e.target.value)}
            />
            <button onClick={handleSendMove}>Gioca Carta</button>
          </div>
        </div>
      )}
      <div>
        <h3>Log di Gioco:</h3>
        <ul>
          {messages.map((msg, index) => (
            <li key={index}>{msg}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default GameBoard;
